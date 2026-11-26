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
        .select("id,last_heartbeat_at")
        .eq("user_id", user.id)
        .eq("status", "live")
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        const fresh = Date.now() - new Date(existing.last_heartbeat_at).getTime() < 90_000;
        if (fresh) return json({ error: "You already have an active Live session." }, 409);
        const { error: staleUpdateError } = await admin.from("live_sessions")
          .update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", existing.id);
        if (staleUpdateError) throw staleUpdateError;
      }

      const roomName = `meei-${user.id}-${crypto.randomUUID()}`;
      await rooms.createRoom({ name: roomName, emptyTimeout: 15, maxParticipants: 500 });
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
        const accessToken = await issueToken(session.provider_room_name, false);
        return json({ url: livekitUrl, room_name: session.provider_room_name, token: accessToken, role: "viewer" });
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
      try {
        await rooms.deleteRoom(session.provider_room_name);
      } catch (roomError) {
        console.error("LiveKit room cleanup failed:", roomError);
      }
      return json({ ok: true, status: "ended" });
    }

    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("LiveKit control request failed:", error);
    return json({ error: "Live streaming request failed. Please try again." }, 500);
  }
});
