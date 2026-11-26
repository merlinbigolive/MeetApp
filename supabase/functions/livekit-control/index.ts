import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { AccessToken, RoomServiceClient } from "npm:livekit-server-sdk@2.20.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const livekitUrl = Deno.env.get("LIVEKIT_URL")!;
const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY")!;
const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const hasVideoTrack = (participant: any) =>
  Array.isArray(participant?.tracks) &&
  participant.tracks.some((track: any) =>
    track?.type === 1 || String(track?.type).toLowerCase() === "video"
  );

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!supabaseUrl || !anonKey || !serviceRoleKey ||
        !livekitUrl || !livekitApiKey || !livekitApiSecret) {
      console.error("LiveKit or Supabase server configuration is incomplete.");
      return json({ error: "Live streaming is not configured on the server." }, 500);
    }

    const authorization = request.headers.get("Authorization") || "";
    const jwt = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!jwt) return json({ error: "Sign in required." }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !authData.user) return json({ error: "Invalid or expired session." }, 401);
    const user = authData.user;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const serverUrl = livekitUrl.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
    const rooms = new RoomServiceClient(serverUrl, livekitApiKey, livekitApiSecret);
    const body = await request.json();
    const action = String(body?.action || "");

  const livekitRateLimitActions = new Set([
    "start", "join", "activate", "moderate", "heartbeat", "end", "cancel",
    "pk_invite", "pk_respond", "pk_join", "pk_moderate", "pk_end", "pk_inbox",
  ]);
  if (livekitRateLimitActions.has(action)) {
    const { data: rateAllowed, error: rateLimitError } = await authClient.rpc(
      "consume_my_meei_rate_limit",
      { p_action_key: `livekit_${action}` },
    );
    if (rateLimitError) throw rateLimitError;
    if (rateAllowed !== true) {
      return json({ error: "Too many Live actions. Please wait before trying again." }, 429);
    }
  }

    const issueToken = async (roomName: string, canPublish: boolean, displayName?: string) => {
      const token = new AccessToken(livekitApiKey, livekitApiSecret, {
        identity: user.id,
        name: (displayName || "MEEi member").slice(0, 64),
        ttl: "6h",
      });
      token.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish,
        canSubscribe: true,
        canPublishData: true,
      });
      return await token.toJwt();
    };

    if (action === "start") {
      const title = String(body.title || "").trim().slice(0, 120);
      const countryCode = String(body.country_code || "").trim().toUpperCase();
      const countryName = String(body.country_name || "").trim();
      if (!title) return json({ error: "Add a title for your Live." }, 400);
      if (!/^[A-Z]{2,3}$/.test(countryCode) || countryName.length < 2 || countryName.length > 80) {
        return json({ error: "Select a valid country before going Live." }, 400);
      }

      const { data: existing, error: existingError } = await admin
        .from("live_sessions")
        .select("id,last_heartbeat_at,provider_room_name")
        .eq("user_id", user.id)
        .eq("status", "live")
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        const fresh = Date.now() - new Date(existing.last_heartbeat_at).getTime() < 90_000;
        let creatorStillPublishing = false;
        if (existing.provider_room_name) {
          try {
            const participants = await rooms.listParticipants(existing.provider_room_name);
            const creator = participants.find((p: any) => p.identity === user.id);
            creatorStillPublishing = !!creator && hasVideoTrack(creator);
          } catch (roomLookupError) {
            console.warn("Could not inspect previous Live room before stale-session cleanup.");
            if (fresh) return json({ error: "Your previous Live is still being checked. Please try again shortly." }, 503);
          }
        }
        if (fresh || creatorStillPublishing) {
          return json({ error: "You already have an active Live session." }, 409);
        }
        const { error: staleUpdateError } = await admin.from("live_sessions")
          .update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", existing.id);
        if (staleUpdateError) throw staleUpdateError;
        if (existing.provider_room_name) {
          try { await rooms.deleteRoom(existing.provider_room_name); } catch (roomError) {
            console.warn("Stale Live room cleanup failed:", roomError);
          }
        }
      }

      const roomName = `meei-${user.id}-${crypto.randomUUID()}`;
      await rooms.createRoom({ name: roomName, emptyTimeout: 120, maxParticipants: 500 });
      const participantName = String(body.display_name || "MEEi creator").slice(0, 64);
      const accessToken = await issueToken(roomName, true, participantName);
      return json({
        url: livekitUrl,
        room_name: roomName,
        token: accessToken,
        role: "creator",
        title,
        country_code: countryCode,
        country_name: countryName,
        activate_after_video_published: true,
      });
    }

    if (action === "activate") {
      const roomName = String(body.room_name || "");
      const title = String(body.title || "").trim().slice(0, 120);
      const countryCode = String(body.country_code || "").trim().toUpperCase();
      const countryName = String(body.country_name || "").trim();
      if (!roomName.startsWith(`meei-${user.id}-`) ||
          !/^[A-Z]{2,3}$/.test(countryCode) ||
          countryName.length < 2 || countryName.length > 80 || !title) {
        return json({ error: "Invalid Live activation details." }, 400);
      }
      const participants = await rooms.listParticipants(roomName);
      const creator = participants.find((p: any) => p.identity === user.id);
      if (!creator || !hasVideoTrack(creator)) {
        return json({ error: "Publish your camera video before activating Live discovery." }, 409);
      }

      const { data: active, error: activeError } = await admin
        .from("live_sessions").select("id")
        .eq("user_id", user.id).eq("status", "live").maybeSingle();
      if (activeError) throw activeError;
      if (active) return json({ session_id: active.id, status: "live" });

      const { data: session, error: insertError } = await admin
        .from("live_sessions")
        .insert({
          user_id: user.id,
          status: "live",
          country_code: countryCode,
          country_name: countryName,
          title,
          provider_room_name: roomName,
          last_heartbeat_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      return json({ session_id: session.id, status: "live" });
    }

    if (action === "cancel") {
      const roomName = String(body.room_name || "");
      if (!roomName.startsWith(`meei-${user.id}-`)) return json({ error: "Invalid Live room." }, 403);
      try { await rooms.deleteRoom(roomName); } catch (roomError) {
        console.error("Unactivated Live room cleanup failed:", roomError);
      }
      return json({ ok: true, status: "cancelled" });
    }

    if (action === "join" || action === "heartbeat" || action === "end" || action === "moderate") {
      const sessionId = String(body.session_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ error: "Invalid Live session." }, 400);
      const { data: session, error: sessionError } = await admin
        .from("live_sessions")
        .select("id,user_id,status,provider_room_name,title,last_heartbeat_at")
        .eq("id", sessionId)
        .eq("status", "live")
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!session || !session.provider_room_name) return json({ error: "This Live has ended." }, 404);

      if (action === "join") {
        const { data: creatorProfile, error: creatorProfileError } = await admin
          .from("profiles").select("is_private").eq("id", session.user_id).maybeSingle();
        if (creatorProfileError) throw creatorProfileError;
        if (creatorProfile?.is_private && session.user_id !== user.id) {
          const { data: acceptedFollow, error: followError } = await admin
            .from("follows").select("follower_id")
            .eq("follower_id", user.id).eq("followed_id", session.user_id)
            .eq("status", "accepted").maybeSingle();
          if (followError) throw followError;
          if (!acceptedFollow) return json({ error: "Follow this private creator to join their Live." }, 403);
        }
        const { data: allowed, error: entryError } = await authClient.rpc("check_live_entry", {
          target_session_id: session.id,
        });
        if (entryError) throw entryError;
        if (!allowed?.[0]?.allowed) return json({ error: "You are not allowed to join this Live." }, 403);
        const { data: membershipId, error: membershipError } = await authClient.rpc("start_live_chat_membership", {
          target_session_id: session.id,
        });
        if (membershipError || !membershipId) {
          console.error("Could not establish Live chat membership:", membershipError);
          return json({ error: "Could not prepare your Live chat. Please try joining again." }, 500);
        }
        const accessToken = await issueToken(session.provider_room_name, false);
        return json({
          url: livekitUrl,
          room_name: session.provider_room_name,
          token: accessToken,
          role: "viewer",
          membership_id: membershipId,
        });
      }

      if (action === "moderate") {
        const targetViewerId = String(body.target_viewer_id || "");
        const moderationAction = String(body.moderation_action || "");
        if (!/^[0-9a-f-]{36}$/i.test(targetViewerId) ||
            !["mute", "kickout", "block"].includes(moderationAction) ||
            targetViewerId === user.id) {
          return json({ error: "Invalid moderation request." }, 400);
        }
        const { data: moderated, error: moderationError } = await authClient.rpc("moderate_live_viewer", {
          target_session_id: session.id,
          target_viewer_id: targetViewerId,
          moderation_action: moderationAction,
        });
        if (moderationError) throw moderationError;
        if (moderated !== true) return json({ error: "Moderation action was not applied." }, 409);
        if (moderationAction === "kickout" || moderationAction === "block") {
          try {
            await rooms.removeParticipant(session.provider_room_name, targetViewerId);
          } catch (removeError) {
            console.warn("Viewer was marked for removal but is no longer connected:", removeError);
          }
        }
        return json({ ok: true, action: moderationAction });
      }

      if (session.user_id !== user.id) return json({ error: "Only the creator can manage this Live." }, 403);

      if (action === "heartbeat") {
        const participants = await rooms.listParticipants(session.provider_room_name);
        const creator = participants.find((p: any) => p.identity === user.id);
        if (!creator || !hasVideoTrack(creator)) {
          return json({ error: "Creator video is not publishing." }, 409);
        }
        const { error: updateError } = await admin.from("live_sessions")
          .update({ last_heartbeat_at: new Date().toISOString() }).eq("id", session.id);
        if (updateError) throw updateError;
        return json({ ok: true });
      }

      const { error: endError } = await admin.from("live_sessions")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", session.id);
      if (endError) throw endError;
      await admin.from("live_pk_battles")
        .update({ status: "ended", ended_at: new Date().toISOString(), ended_by: user.id })
        .in("status", ["invited", "active"])
        .or(`session_a_id.eq.${session.id},session_b_id.eq.${session.id}`);
      try {
        await rooms.deleteRoom(session.provider_room_name);
      } catch (roomError) {
        console.error("LiveKit room cleanup failed:", roomError);
      }
      return json({ ok: true, status: "ended" });
    }


    if (action === "pk_inbox") {
      const { data, error } = await authClient.rpc("list_my_live_pk_invites");
      if (error) throw error;
      return json({ invites: Array.isArray(data) ? data : [] });
    }

    if (action === "pk_invite") {
      const opponentSessionId = String(body.opponent_session_id || "");
      const durationMinutes = Number(body.duration_minutes);
      if (!/^[0-9a-f-]{36}$/i.test(opponentSessionId) || ![5, 10, 15].includes(durationMinutes)) {
        return json({ error: "Choose a Live creator and a 5, 10 or 15 minute PK." }, 400);
      }
      const { data: ownSession, error: ownError } = await admin.from("live_sessions")
        .select("id,user_id,status,provider_room_name,last_heartbeat_at")
        .eq("user_id", user.id).eq("status", "live").maybeSingle();
      if (ownError) throw ownError;
      const { data: opponentSession, error: opponentError } = await admin.from("live_sessions")
        .select("id,user_id,status,provider_room_name,last_heartbeat_at")
        .eq("id", opponentSessionId).eq("status", "live").maybeSingle();
      if (opponentError) throw opponentError;
      if (!ownSession?.provider_room_name || !opponentSession?.provider_room_name ||
          Date.now() - new Date(ownSession.last_heartbeat_at).getTime() > 90_000 ||
          Date.now() - new Date(opponentSession.last_heartbeat_at).getTime() > 90_000) {
        return json({ error: "Both creators must be actively Live before sending a PK invite." }, 409);
      }
      const { data: opponentAccess, error: opponentAccessError } = await authClient.rpc("check_live_entry", {
        target_session_id: opponentSession.id,
      });
      if (opponentAccessError) throw opponentAccessError;
      if (!opponentAccess?.[0]?.allowed) {
        return json({ error: "You are not allowed to invite this creator." }, 403);
      }
      const { data: globallyBlocked, error: globalBlockError } = await authClient.rpc("is_blocked_for_current_user", {
        other_user_id: opponentSession.user_id,
      });
      if (globalBlockError) throw globalBlockError;
      if (globallyBlocked === true) return json({ error: "You cannot PK with this creator." }, 403);
      for (const liveSession of [ownSession, opponentSession]) {
        const participants = await rooms.listParticipants(liveSession.provider_room_name);
        const creator = participants.find((p: any) => p.identity === liveSession.user_id);
        if (!creator || !hasVideoTrack(creator)) {
          return json({ error: "Both creators must have their cameras publishing before PK." }, 409);
        }
      }
      const { data: battleId, error } = await admin.rpc("create_live_pk_invite_server", {
        actor_id: user.id,
        target_opponent_session_id: opponentSessionId,
        selected_duration_minutes: durationMinutes,
      });
      if (error) throw error;
      return json({ ok: true, battle_id: battleId, invite_expires_in_seconds: 45 });
    }

    if (action === "pk_respond") {
      const battleId = String(body.battle_id || "");
      const accept = body.accept === true;
      if (!/^[0-9a-f-]{36}$/i.test(battleId)) return json({ error: "Invalid PK invitation." }, 400);
      if (accept) {
        const { data: battle, error: battleError } = await admin.from("live_pk_battles")
          .select("id,session_a_id,session_b_id,creator_a_id,creator_b_id,invited_by,status")
          .eq("id", battleId).maybeSingle();
        if (battleError) throw battleError;
        if (!battle || battle.status !== "invited" || battle.invited_by === user.id ||
            ![battle.creator_a_id, battle.creator_b_id].includes(user.id)) {
          return json({ error: "This PK invitation is not available to your account." }, 403);
        }
        const { data: liveSessions, error: sessionsError } = await admin.from("live_sessions")
          .select("id,user_id,status,provider_room_name,last_heartbeat_at")
          .in("id", [battle.session_a_id, battle.session_b_id]).eq("status", "live");
        if (sessionsError) throw sessionsError;
        if (!liveSessions || liveSessions.length !== 2) return json({ error: "One creator is no longer Live." }, 409);
        for (const liveSession of liveSessions) {
          if (!liveSession.provider_room_name ||
              Date.now() - new Date(liveSession.last_heartbeat_at).getTime() > 90_000) {
            return json({ error: "One creator's Live connection is no longer active." }, 409);
          }
          const participants = await rooms.listParticipants(liveSession.provider_room_name);
          const creator = participants.find((p: any) => p.identity === liveSession.user_id);
          if (!creator || !hasVideoTrack(creator)) {
            return json({ error: "Both creators must still be publishing video to accept PK." }, 409);
          }
        }
      }
      const { data, error } = await admin.rpc("respond_live_pk_invite_server", {
        actor_id: user.id,
        target_battle_id: battleId,
        accept_invite: accept,
      });
      if (error) throw error;
      return json({ ok: data === true, accepted: accept });
    }

    if (action === "pk_join") {
      const sessionId = String(body.session_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ error: "Invalid Live session." }, 400);
      const { data: stateRows, error: stateError } = await authClient.rpc("get_live_pk_state", {
        target_session_id: sessionId,
      });
      if (stateError) throw stateError;
      const battle = Array.isArray(stateRows) ? stateRows[0] : null;
      if (!battle || battle.status !== "active") return json({ battle: battle || null });
      const { data: opponentSession, error: opponentError } = await admin.from("live_sessions")
        .select("id,user_id,status,provider_room_name,last_heartbeat_at")
        .eq("id", battle.opponent_session_id).eq("status", "live").maybeSingle();
      if (opponentError) throw opponentError;
      if (!opponentSession?.provider_room_name ||
          Date.now() - new Date(opponentSession.last_heartbeat_at).getTime() > 90_000) {
        return json({ error: "The opponent's Live has ended." }, 409);
      }
      const { data: currentSession, error: currentSessionError } = await admin.from("live_sessions")
        .select("id,user_id").eq("id", sessionId).maybeSingle();
      if (currentSessionError) throw currentSessionError;
      const actorIsCreator = user.id === opponentSession.user_id ||
        user.id === currentSession?.user_id;
      if (!actorIsCreator) {
        const { data: allowedRows, error: accessError } = await authClient.rpc("check_live_entry", {
          target_session_id: battle.opponent_session_id,
        });
        if (accessError) throw accessError;
        if (!allowedRows?.[0]?.allowed) return json({ error: "You are not allowed to view the opponent's Live." }, 403);
      }
      const opponentToken = await issueToken(opponentSession.provider_room_name, false);
      return json({
        battle,
        opponent: {
          url: livekitUrl,
          room_name: opponentSession.provider_room_name,
          token: opponentToken,
        },
      });
    }

    if (action === "pk_moderate") {
      const battleId = String(body.battle_id || "");
      const targetViewerId = String(body.target_viewer_id || "");
      const moderationAction = String(body.moderation_action || "");
      if (!/^[0-9a-f-]{36}$/i.test(battleId) ||
          !/^[0-9a-f-]{36}$/i.test(targetViewerId) ||
          !["mute", "kickout"].includes(moderationAction) || targetViewerId === user.id) {
        return json({ error: "Invalid PK moderation request." }, 400);
      }
      const { data: battle, error: battleError } = await admin.from("live_pk_battles")
        .select("id,session_a_id,session_b_id,status,ends_at")
        .eq("id", battleId).eq("status", "active").maybeSingle();
      if (battleError) throw battleError;
      if (!battle || new Date(battle.ends_at).getTime() <= Date.now()) {
        return json({ error: "This PK is no longer active." }, 409);
      }
      const { data: liveSessions, error: sessionsError } = await admin.from("live_sessions")
        .select("id,provider_room_name").in("id", [battle.session_a_id, battle.session_b_id]);
      if (sessionsError) throw sessionsError;
      let targetFound = false;
      for (const liveSession of liveSessions || []) {
        if (!liveSession.provider_room_name) continue;
        try {
          const participants = await rooms.listParticipants(liveSession.provider_room_name);
          if (participants.some((p: any) => p.identity === targetViewerId)) targetFound = true;
        } catch (_) {}
      }
      if (!targetFound) return json({ error: "This viewer is not connected to either PK room." }, 404);
      const { data: moderated, error } = await admin.rpc("moderate_live_pk_viewer_server", {
        actor_id: user.id,
        target_battle_id: battleId,
        target_viewer_id: targetViewerId,
        moderation_action: moderationAction,
      });
      if (error) throw error;
      if (moderated !== true) return json({ error: "PK moderation was not applied." }, 409);
      if (moderationAction === "kickout") {
        await Promise.allSettled((liveSessions || []).filter((s: any) => !!s.provider_room_name)
          .map((s: any) => rooms.removeParticipant(s.provider_room_name, targetViewerId)));
      }
      return json({ ok: true, action: moderationAction });
    }

    if (action === "pk_end") {
      const battleId = String(body.battle_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(battleId)) return json({ error: "Invalid PK battle." }, 400);
      const { data, error } = await authClient.rpc("end_live_pk_battle", { target_battle_id: battleId });
      if (error) throw error;
      return json({ ok: data === true, status: "ended" });
    }

    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("LiveKit control request failed:", error);
    return json({ error: "Live streaming request failed. Please try again." }, 500);
  }
});
