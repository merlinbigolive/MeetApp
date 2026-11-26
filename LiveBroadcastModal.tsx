import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from "react-native";
import { AudioSession, LiveKitRoom, VideoTrack, useTracks, isTrackReference } from "@livekit/react-native";
import { Track } from "livekit-client";
import { supabase } from "./supabase";

type RoomCredentials = { url: string; token: string; room_name: string; role: "creator" | "viewer" };
type LiveChatMessage = { id: string; user_id: string; username: string; body: string; created_at: string; avatar_path: string | null; origin_session_id?: string; side_label?: string };
type PKCreator = { session_id: string; user_id: string; username: string; display_name: string; title: string };
type PKInvite = { battle_id: string; opponent_session_id: string; opponent_user_id: string; opponent_username: string; opponent_display_name: string; duration_minutes: number; invite_expires_at: string };
type MiniProfile = { user_id: string; username: string; display_name: string; bio: string | null; avatarUrl: string | null };

type Props = {
  visible: boolean;
  sessionId?: string | null;
  creatorName: string;
  onClose: () => void;
};

export default function LiveBroadcastModal({ visible, sessionId, creatorName, onClose }: Props) {
  const [title, setTitle] = useState("Come say hello!");
  const [countryCode, setCountryCode] = useState("IN");
  const [countryName, setCountryName] = useState("India");
  const [credentials, setCredentials] = useState<RoomCredentials | null>(null);
  const [roomName, setRoomName] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const [chatMessages, setChatMessages] = useState<LiveChatMessage[]>([]);
  const [chatMembershipId, setChatMembershipId] = useState<string | null>(null);
  const [pkBattle, setPkBattle] = useState<any | null>(null);
  const [pkOpponentCredentials, setPkOpponentCredentials] = useState<RoomCredentials | null>(null);
  const [pkInvites, setPkInvites] = useState<PKInvite[]>([]);
  const [pkCreators, setPkCreators] = useState<PKCreator[]>([]);
  const [pkDuration, setPkDuration] = useState<5 | 10 | 15>(5);
  const [showPkPanel, setShowPkPanel] = useState(false);
  const [pkBusy, setPkBusy] = useState(false);
  const [pkNow, setPkNow] = useState(Date.now());
  const pkConnectRef = useRef<string | null>(null);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [selectedViewer, setSelectedViewer] = useState<MiniProfile | null>(null);
  const [moderationBusy, setModerationBusy] = useState(false);
  const [showViewerMenu, setShowViewerMenu] = useState(false);
  const [moderationRole, setModerationRole] = useState<"creator" | "moderator" | "viewer">("viewer");
  const [selectedIsModerator, setSelectedIsModerator] = useState(false);
  const isCreator = !sessionId;

  useEffect(() => {
    const client = supabase;
    if (!visible || !sessionId || !client) return;
    let cancelled = false;
    const join = async () => {
      setBusy(true);
      const { data, error } = await client.functions.invoke("livekit-control", {
        body: { action: "join", session_id: sessionId },
      });
      if (cancelled) return;
      if (error || !data?.token || !data?.url || !data?.room_name || !data?.membership_id) {
        Alert.alert("Unable to join Live", data?.error || error?.message || "Please try again.");
        setBusy(false);
        onClose();
        return;
      }
      setChatMessages([]);
      setChatMembershipId(String(data.membership_id));
      setCredentials({ url: data.url, token: data.token, room_name: data.room_name, role: "viewer" });
      setRoomName(data.room_name);
      setBusy(false);
    };
    void join();
    return () => { cancelled = true; };
  }, [visible, sessionId]);

  useEffect(() => {
    if (!visible || !activeSessionId || !isCreator || !supabase) return;
    const timer = setInterval(() => {
      void supabase!.functions.invoke("livekit-control", {
        body: { action: "heartbeat", session_id: activeSessionId },
      }).then(({ error, data }) => {
        if (error || data?.error) console.warn("MEEi Live heartbeat was not confirmed.");
      });
    }, 30_000);
    return () => clearInterval(timer);
  }, [visible, activeSessionId, isCreator]);

  const chatSessionId = sessionId || activeSessionId;
  const canModerate = isCreator || moderationRole === "moderator";
  const pkSecondsRemaining = pkBattle?.ends_at
    ? Math.max(0, Math.ceil((new Date(pkBattle.ends_at).getTime() - pkNow) / 1000))
    : 0;

  useEffect(() => {
    if (!visible || !sessionId || !supabase) { setModerationRole(isCreator ? "creator" : "viewer"); return; }
    let cancelled = false;
    void supabase.rpc("get_live_moderation_role", { target_session_id: sessionId }).then(({ data, error }) => {
      if (!cancelled && !error && (data === "creator" || data === "moderator" || data === "viewer")) setModerationRole(data);
    });
    return () => { cancelled = true; };
  }, [visible, sessionId, isCreator]);

  useEffect(() => {
    if (!visible || !chatSessionId || !supabase || (!isCreator && !chatMembershipId)) return;
    let cancelled = false;
    const loadChat = async () => {
      const rpcName = pkBattle?.status === "active" ? "get_live_pk_chat_messages" : "get_live_chat_messages";
      const args = pkBattle?.status === "active"
        ? { target_session_id: chatSessionId, target_membership_id: chatMembershipId, message_limit: 80 }
        : { target_session_id: chatSessionId, message_limit: 60, target_membership_id: chatMembershipId };
      const { data, error } = await supabase!.rpc(rpcName, args);
      if (!cancelled && !error && Array.isArray(data)) setChatMessages([...data].reverse() as LiveChatMessage[]);
    };
    void loadChat();
    const timer = setInterval(() => { void loadChat(); }, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [visible, chatSessionId, chatMembershipId, isCreator, pkBattle?.status, pkBattle?.battle_id]);

  useEffect(() => {
    if (!visible || !chatSessionId || !supabase) return;
    let cancelled = false;
    const loadPkState = async () => {
      const { data, error } = await supabase!.rpc("get_live_pk_state", { target_session_id: chatSessionId });
      if (cancelled || error) return;
      const battle = Array.isArray(data) ? data[0] : null;
      setPkBattle(battle || null);
      if (!battle || battle.status !== "active") {
        pkConnectRef.current = null;
        setPkOpponentCredentials(null);
        return;
      }
      setPkNow(Date.now());
      if (pkConnectRef.current === battle.battle_id) return;
      pkConnectRef.current = battle.battle_id;
      const { data: connected, error: connectError } = await supabase!.functions.invoke("livekit-control", {
        body: { action: "pk_join", session_id: chatSessionId },
      });
      if (cancelled) return;
      if (connectError || connected?.error || !connected?.opponent?.token) {
        pkConnectRef.current = null;
        console.warn("MEEi PK opponent connection was not confirmed.", connected?.error || connectError?.message);
        return;
      }
      setPkOpponentCredentials({
        url: connected.opponent.url,
        room_name: connected.opponent.room_name,
        token: connected.opponent.token,
        role: "viewer",
      });
    };
    void loadPkState();
    const timer = setInterval(() => { void loadPkState(); }, 2500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [visible, chatSessionId]);

  useEffect(() => {
    if (!visible || !isCreator || !activeSessionId || !supabase) { setPkInvites([]); return; }
    let cancelled = false;
    const loadInvites = async () => {
      const { data, error } = await supabase!.functions.invoke("livekit-control", { body: { action: "pk_inbox" } });
      if (!cancelled && !error && Array.isArray(data?.invites)) setPkInvites(data.invites as PKInvite[]);
    };
    void loadInvites();
    const timer = setInterval(() => { void loadInvites(); }, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [visible, isCreator, activeSessionId]);

  useEffect(() => {
    if (pkBattle?.status !== "active") return;
    const timer = setInterval(() => setPkNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pkBattle?.status, pkBattle?.ends_at]);

  const openPkPanel = async () => {
    if (!supabase || !isCreator || !activeSessionId) return;
    setShowPkPanel(true);
    setPkBusy(true);
    const { data, error } = await supabase.rpc("get_live_creators", { country_filter: null });
    const { data: authData } = await supabase.auth.getUser();
    setPkBusy(false);
    if (error) {
      Alert.alert("PK creators unavailable", error.message || "Please try again.");
      return;
    }
    setPkCreators((Array.isArray(data) ? data : []).filter((item: PKCreator) => item.user_id !== authData.user?.id) as PKCreator[]);
  };

  const sendPkInvite = async (opponent: PKCreator) => {
    if (!supabase || pkBusy) return;
    setPkBusy(true);
    const { data, error } = await supabase.functions.invoke("livekit-control", {
      body: { action: "pk_invite", opponent_session_id: opponent.session_id, duration_minutes: pkDuration },
    });
    setPkBusy(false);
    if (error || data?.error) {
      Alert.alert("PK invite failed", data?.error || error?.message || "Please try again.");
      return;
    }
    setShowPkPanel(false);
    Alert.alert("PK invitation sent", `Invitation sent to @${opponent.username}. They have 45 seconds to accept.`);
  };

  const respondPkInvite = async (invite: PKInvite, accept: boolean) => {
    if (!supabase || pkBusy) return;
    setPkBusy(true);
    const { data, error } = await supabase.functions.invoke("livekit-control", {
      body: { action: "pk_respond", battle_id: invite.battle_id, accept },
    });
    setPkBusy(false);
    if (error || data?.error || data?.ok !== true) {
      Alert.alert("PK response failed", data?.error || error?.message || "This invitation expired or the other creator left Live.");
      return;
    }
    if (data?.ok !== true) {
      Alert.alert("PK invitation unavailable", "The invitation expired or one creator left Live.");
      setPkInvites(items => items.filter(item => item.battle_id !== invite.battle_id));
      return;
    }
    setPkInvites(items => items.filter(item => item.battle_id !== invite.battle_id));
  };

  const endPkBattle = async () => {
    if (!supabase || !pkBattle?.battle_id || pkBusy) return;
    setPkBusy(true);
    const { data, error } = await supabase.functions.invoke("livekit-control", {
      body: { action: "pk_end", battle_id: pkBattle.battle_id },
    });
    setPkBusy(false);
    if (error || data?.error) {
      Alert.alert("Could not end PK", data?.error || error?.message || "Please try again.");
      return;
    }
    setPkBattle(null);
    setPkOpponentCredentials(null);
    pkConnectRef.current = null;
  };

  const sendLiveMessage = async () => {
    if (!supabase || !chatSessionId || !chatDraft.trim() || chatBusy) return;
    setChatBusy(true);
    const { error } = await supabase.rpc("send_live_chat_message", {
      target_session_id: chatSessionId,
      message_body: chatDraft.trim(),
    });
    setChatBusy(false);
    if (error) {
      Alert.alert("Message not sent", error.message || "Please try again.");
      return;
    }
    setChatDraft("");
    const { data } = pkBattle?.status === "active"
      ? await supabase.rpc("get_live_pk_chat_messages", {
          target_session_id: chatSessionId, target_membership_id: chatMembershipId, message_limit: 80,
        })
      : await supabase.rpc("get_live_chat_messages", {
          target_session_id: chatSessionId, message_limit: 60, target_membership_id: chatMembershipId,
        });
    if (Array.isArray(data)) setChatMessages([...data].reverse() as LiveChatMessage[]);
  };

  const openViewerProfile = async (viewerId: string) => {
    if (!supabase || !chatSessionId || !viewerId) return;
    setShowViewerMenu(false);
    try {
      let profile: any = null;
      if (isCreator) {
        const { data, error } = await supabase.rpc("get_live_viewer_profile", {
          target_session_id: chatSessionId, target_viewer_id: viewerId,
        });
        if (error) throw error;
        profile = Array.isArray(data) ? data[0] : data;
      } else {
        const { data, error } = await supabase.from("profiles")
          .select("id,username,display_name,bio").eq("id", viewerId).maybeSingle();
        if (error) throw error;
        profile = data ? { user_id: data.id, ...data } : null;
      }
      if (!profile) throw new Error("This profile is unavailable.");
      let avatarUrl: string | null = null;
      const { data: avatarMedia } = await supabase.from("profile_media")
        .select("storage_path,media_type").eq("user_id", viewerId).eq("kind", "avatar")
        .order("position", { ascending: true }).limit(1).maybeSingle();
      const { data: coverMedia } = !profile.avatar_path && !avatarMedia?.storage_path
        ? await supabase.from("profile_media").select("storage_path,media_type")
            .eq("user_id", viewerId).eq("kind", "cover").eq("media_type", "image")
            .order("position", { ascending: true }).limit(1).maybeSingle()
        : { data: null };
      const path = profile.avatar_path || avatarMedia?.storage_path || coverMedia?.storage_path;
      if (path) {
        const { data: signed } = await supabase.storage.from("usay-media").createSignedUrl(path, 900);
        avatarUrl = signed?.signedUrl || null;
      }
      setSelectedViewer({
        user_id: viewerId,
        username: String(profile.username || "meei_user").replace(/^[@#]/, ""),
        display_name: String(profile.display_name || profile.username || "MEEi member"),
        bio: profile.bio || null,
        avatarUrl,
      });
      if (isCreator) {
        const { data: moderatorFlag } = await supabase.rpc("is_live_moderator", { target_session_id: chatSessionId, target_user_id: viewerId });
        setSelectedIsModerator(moderatorFlag === true);
      } else setSelectedIsModerator(false);
    } catch (error: any) {
      Alert.alert("Profile unavailable", error?.message || "Could not load this profile.");
    }
  };

  const toggleModerator = async () => {
    if (!isCreator || !selectedViewer || !chatSessionId || !supabase || moderationBusy) return;
    setModerationBusy(true);
    const { data, error } = await supabase.rpc("set_live_moderator", {
      target_session_id: chatSessionId,
      target_user_id: selectedViewer.user_id,
      make_moderator: !selectedIsModerator,
    });
    setModerationBusy(false);
    if (error || data !== true) {
      Alert.alert("Moderator update failed", error?.message || "Please try again.");
      return;
    }
    setSelectedIsModerator(!selectedIsModerator);
    Alert.alert("Live Admin", selectedIsModerator ? "Admin access removed." : "This viewer is now a Live Admin.");
  };

  const moderateViewer = (action: "mute" | "kickout" | "block") => {
    if (!selectedViewer || !chatSessionId || !supabase || !canModerate || moderationBusy) return;
    const labels = {
      mute: pkBattle?.status === "active" ? "Mute this viewer in both PK chats for 15 minutes?" : "Mute this viewer in Live chat for 15 minutes?",
      kickout: pkBattle?.status === "active" ? "Remove this viewer from both PK rooms?" : "Remove this viewer from this Live?",
      block: "Block this viewer from your future Lives and remove them from this Live?",
    };
    Alert.alert(action === "kickout" ? "Kick out viewer" : action === "block" ? "Block viewer" : "Mute viewer", labels[action], [
      { text: "Cancel", style: "cancel" },
      { text: action === "block" ? "Block" : action === "kickout" ? "Kick out" : "Mute", style: action === "block" ? "destructive" : "default", onPress: async () => {
        setModerationBusy(true);
        const { data, error } = pkBattle?.status === "active"
          ? await supabase!.functions.invoke("livekit-control", {
              body: { action: "pk_moderate", battle_id: pkBattle.battle_id, target_viewer_id: selectedViewer.user_id, moderation_action: action },
            })
          : await supabase!.functions.invoke("livekit-control", {
              body: { action: "moderate", session_id: chatSessionId, target_viewer_id: selectedViewer.user_id, moderation_action: action },
            });
        setModerationBusy(false);
        if (error || data?.error) {
          Alert.alert("Action failed", data?.error || error?.message || "Please try again.");
          return;
        }
        setSelectedViewer(null);
        const { data: refreshed } = pkBattle?.status === "active"
          ? await supabase!.rpc("get_live_pk_chat_messages", {
              target_session_id: chatSessionId, target_membership_id: chatMembershipId, message_limit: 80,
            })
          : await supabase!.rpc("get_live_chat_messages", {
              target_session_id: chatSessionId, message_limit: 60, target_membership_id: chatMembershipId,
            });
        if (Array.isArray(refreshed)) setChatMessages([...refreshed].reverse() as LiveChatMessage[]);
        if (action === "kickout" || action === "block") Alert.alert("Viewer removed", "The viewer has been removed from this Live.");
      } },
    ]);
  };

  useEffect(() => {
    if (!visible || !credentials) return;
    void AudioSession.startAudioSession();
    return () => { void AudioSession.stopAudioSession(); };
  }, [visible, credentials]);

  const startLive = async () => {
    if (!supabase) {
      Alert.alert("Not connected", "MEEi Supabase setup is unavailable.");
      return;
    }
    if (!title.trim() || countryName.trim().length < 2 || !/^[A-Za-z]{2,3}$/.test(countryCode.trim())) {
      Alert.alert("Check Live details", "Enter a title and a valid country name and 2–3 letter country code.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("livekit-control", {
      body: {
        action: "start",
        title: title.trim(),
        country_code: countryCode.trim().toUpperCase(),
        country_name: countryName.trim(),
        display_name: creatorName,
      },
    });
    setBusy(false);
    if (error || !data?.token || !data?.url || !data?.room_name) {
      Alert.alert("Could not start Live", data?.error || error?.message || "Please try again.");
      return;
    }
    setRoomName(data.room_name);
    setCredentials({ url: data.url, token: data.token, room_name: data.room_name, role: "creator" });
  };

  const finishLive = async () => {
    if (ending) return;
    setEnding(true);
    if (supabase && !isCreator && chatMembershipId) {
      const { error: membershipEndError } = await supabase.rpc("end_live_chat_membership", {
        target_membership_id: chatMembershipId,
      });
      if (membershipEndError) console.warn("Live chat membership could not be closed on leave.");
    }
    if (supabase && isCreator && activeSessionId) {
      const { error, data } = await supabase.functions.invoke("livekit-control", {
        body: { action: "end", session_id: activeSessionId },
      });
      if (error || data?.error) {
        Alert.alert("Could not end Live", data?.error || error?.message || "Please retry.");
        setEnding(false);
        return;
      }
    } else if (supabase && isCreator && roomName) {
      await supabase.functions.invoke("livekit-control", {
        body: { action: "cancel", room_name: roomName },
      });
    }
    setCredentials(null);
    setRoomName("");
    setActiveSessionId(null);
    setChatMembershipId(null);
    setChatMessages([]);
    setPkBattle(null);
    setPkOpponentCredentials(null);
    setPkInvites([]);
    pkConnectRef.current = null;
    setEnding(false);
    onClose();
  };

  const handleActivated = (id: string) => setActiveSessionId(id);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={finishLive}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{credentials ? (isCreator ? "You're Live" : "Live broadcast") : (isCreator ? "Go Live" : "Joining Live")}</Text>
          <Pressable onPress={finishLive} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable>
        </View>
        {!credentials ? (
          <ScrollView contentContainerStyle={styles.form}>
            {busy ? <ActivityIndicator size="large" color="#168BE8" /> : <>
              <View style={styles.hero}><Text style={styles.heroIcon}>●</Text><Text style={styles.heroTitle}>{isCreator ? "Start a live video" : "Connecting to creator…"}</Text><Text style={styles.heroText}>Broadcast to your MEEi audience in real time.</Text></View>
              {isCreator && <>
                <Text style={styles.label}>Live title</Text>
                <TextInput value={title} onChangeText={setTitle} maxLength={120} placeholder="What are you going live about?" style={styles.input} />
                <Text style={styles.label}>Country name</Text>
                <TextInput value={countryName} onChangeText={setCountryName} placeholder="Country" style={styles.input} />
                <Text style={styles.label}>Country code (2–3 letters)</Text>
                <TextInput value={countryCode} onChangeText={setCountryCode} autoCapitalize="characters" maxLength={3} placeholder="IN" style={styles.input} />
                <Pressable onPress={startLive} style={styles.primary}><Text style={styles.primaryText}>Start Live</Text></Pressable>
                <Text style={styles.note}>Camera and microphone access will be requested by your device when the broadcast starts.</Text>
              </>}
            </>}
          </ScrollView>
        ) : (
          <View style={styles.room}>
            <View style={pkOpponentCredentials ? styles.pkVideoRow : styles.videoStageSingle}>
              <View style={styles.pkVideoPane}>
                <LiveKitRoom
                  serverUrl={credentials.url}
                  token={credentials.token}
                  connect={true}
                  audio={isCreator}
                  video={isCreator}
                  options={{ adaptiveStream: { pixelDensity: "screen" } }}
                >
                  <RoomTracks
                    creator={isCreator}
                    roomName={roomName}
                    title={title}
                    countryCode={countryCode.toUpperCase()}
                    countryName={countryName}
                    onActivated={handleActivated}
                  />
                </LiveKitRoom>
                {pkOpponentCredentials && <Text style={styles.pkSideBadge}>YOUR SIDE</Text>}
              </View>
              {pkOpponentCredentials && (
                <View style={styles.pkVideoPane}>
                  <LiveKitRoom
                    serverUrl={pkOpponentCredentials.url}
                    token={pkOpponentCredentials.token}
                    connect={true}
                    audio={false}
                    video={false}
                    options={{ adaptiveStream: { pixelDensity: "screen" } }}
                  >
                    <OpponentTracks />
                  </LiveKitRoom>
                  <Text style={styles.pkSideBadge}>OPPONENT</Text>
                </View>
              )}
            </View>
            <View style={styles.liveOverlay}>
              <View>
                <Text style={styles.livePill}>● LIVE</Text>
                <Text style={styles.liveTitle}>{title}</Text>
                {pkBattle?.status === "active" && <Text style={styles.pkTimer}>⚔ PK {Math.floor(pkSecondsRemaining / 60)}:{String(pkSecondsRemaining % 60).padStart(2, "0")}</Text>}
                {pkBattle?.status === "invited" && isCreator && pkBattle?.invite_is_outgoing && <Text style={styles.pkTimer}>PK invitation sent…</Text>}
              </View>
              <View style={styles.liveHeaderActions}>
                {isCreator && !!activeSessionId && !pkBattle && <Pressable onPress={openPkPanel} style={styles.pkButton}><Text style={styles.pkButtonText}>PK</Text></Pressable>}
                {isCreator && pkBattle?.status === "invited" && <Pressable onPress={endPkBattle} disabled={pkBusy} style={styles.pkEndButton}><Text style={styles.endText}>Cancel invite</Text></Pressable>}
                {isCreator && pkBattle?.status === "active" && <Pressable onPress={endPkBattle} disabled={pkBusy} style={styles.pkEndButton}><Text style={styles.endText}>End PK</Text></Pressable>}
                <Pressable onPress={finishLive} disabled={ending} style={styles.endButton}>
                  {ending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.endText}>{isCreator ? "End Live" : "Leave"}</Text>}
                </Pressable>
              </View>
            </View>
            <View style={styles.liveChatPanel}>
              <ScrollView style={styles.liveChatList} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
                {chatMessages.slice(-40).map((message) => (
                  <View key={message.id} style={styles.liveChatRow}>
                    <Pressable onPress={() => void openViewerProfile(message.user_id)}>
                      <Text style={styles.liveChatUsername}>{message.username.replace(/^[@#]/, "")}</Text>
                    </Pressable>
                    {!!message.side_label && <Text style={styles.pkSideLabel}>{message.side_label}</Text>}
                    <Text style={styles.liveChatBody}>{message.body}</Text>
                  </View>
                ))}
                {chatMessages.length === 0 && <Text style={styles.liveChatHint}>Be the first to say hello!</Text>}
              </ScrollView>
              <View style={styles.liveChatComposer}>
                <TextInput value={chatDraft} onChangeText={setChatDraft} placeholder="Say something…" placeholderTextColor="#AFC0CF" maxLength={500} style={styles.liveChatInput} returnKeyType="send" onSubmitEditing={sendLiveMessage}/>
                <Pressable onPress={sendLiveMessage} disabled={!chatDraft.trim() || chatBusy} style={styles.liveChatSend}><Text style={styles.liveChatSendText}>{chatBusy ? "…" : "Send"}</Text></Pressable>
              </View>
            </View>
            {isCreator && !activeSessionId && <Text style={styles.waiting}>Publishing camera… preparing Live discovery</Text>}
            {isCreator && !!activeSessionId && <Text style={styles.waiting}>Your broadcast is visible on MEEi Live.</Text>}
            <Modal visible={showPkPanel} transparent animationType="slide" onRequestClose={() => setShowPkPanel(false)}>
              <Pressable style={styles.profileBackdrop} onPress={() => setShowPkPanel(false)}>
                <Pressable style={styles.pkPanelCard} onPress={() => {}}>
                  <View style={styles.pkPanelHeader}>
                    <Text style={styles.pkPanelTitle}>Start a Live PK</Text>
                    <Pressable onPress={() => setShowPkPanel(false)}><Text style={styles.moreButtonText}>×</Text></Pressable>
                  </View>
                  <Text style={styles.pkPanelHint}>Choose battle duration</Text>
                  <View style={styles.pkDurationRow}>
                    {([5,10,15] as const).map((minutes) => (
                      <Pressable key={minutes} onPress={() => setPkDuration(minutes)} style={[styles.pkDurationOption, pkDuration === minutes && styles.pkDurationSelected]}>
                        <Text style={[styles.pkDurationText, pkDuration === minutes && styles.pkDurationTextSelected]}>{minutes} min</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.pkPanelHint}>Choose a creator who is Live now</Text>
                  {pkBusy ? <ActivityIndicator color="#168BE8" /> : (
                    <ScrollView style={styles.pkCreatorList}>
                      {pkCreators.map((creator) => (
                        <Pressable key={creator.session_id} onPress={() => void sendPkInvite(creator)} style={styles.pkCreatorRow}>
                          <View style={styles.pkCreatorAvatar}><Text style={styles.pkCreatorAvatarText}>{(creator.display_name || creator.username || "M").slice(0,1).toUpperCase()}</Text></View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.pkCreatorName}>{creator.display_name || creator.username}</Text>
                            <Text style={styles.pkCreatorUsername}>@{creator.username} · {creator.title}</Text>
                          </View>
                          <Text style={styles.pkInviteAction}>Invite</Text>
                        </Pressable>
                      ))}
                      {pkCreators.length === 0 && <Text style={styles.pkPanelHint}>No other eligible creators are Live right now.</Text>}
                    </ScrollView>
                  )}
                </Pressable>
              </Pressable>
            </Modal>
            <Modal visible={pkInvites.length > 0} transparent animationType="fade" onRequestClose={() => setPkInvites([])}>
              <View style={styles.profileBackdrop}>
                <View style={styles.pkPanelCard}>
                  <Text style={styles.pkPanelTitle}>PK invitation</Text>
                  {pkInvites.slice(0,3).map((invite) => (
                    <View key={invite.battle_id} style={styles.pkInviteCard}>
                      <Text style={styles.pkCreatorName}>@{invite.opponent_username} challenged you!</Text>
                      <Text style={styles.pkPanelHint}>{invite.duration_minutes}-minute Live PK battle</Text>
                      <View style={styles.pkDurationRow}>
                        <Pressable disabled={pkBusy} onPress={() => void respondPkInvite(invite, false)} style={styles.pkDeclineButton}><Text style={styles.pkDeclineText}>Decline</Text></Pressable>
                        <Pressable disabled={pkBusy} onPress={() => void respondPkInvite(invite, true)} style={styles.pkAcceptButton}><Text style={styles.pkAcceptText}>Accept PK</Text></Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </Modal>
            <Modal visible={!!selectedViewer} transparent animationType="fade" onRequestClose={() => { setSelectedViewer(null); setShowViewerMenu(false); }}>
              <Pressable style={styles.profileBackdrop} onPress={() => { setSelectedViewer(null); setShowViewerMenu(false); }}>
                <Pressable style={styles.profileCard} onPress={() => {}}>
                  <View style={styles.profileCardTop}>
                    {selectedViewer?.avatarUrl ? <Image source={{ uri: selectedViewer.avatarUrl }} style={styles.profileAvatar}/> : <View style={styles.profileAvatarFallback}><Text style={styles.profileAvatarLetter}>{selectedViewer?.display_name?.slice(0,1).toUpperCase() || "M"}</Text></View>}
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}><Text style={styles.profileDisplayName}>{selectedViewer?.display_name}</Text>{selectedIsModerator && <View style={{ backgroundColor: "#E8F1FF", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}><Text style={{ color: "#2457A6", fontSize: 10, fontWeight: "800" }}>ADMIN</Text></View>}</View>
                      <Text style={styles.profileUsername}>@{selectedViewer?.username}</Text>
                    </View>
                    {canModerate && <Pressable onPress={() => setShowViewerMenu(v => !v)} style={styles.moreButton}><Text style={styles.moreButtonText}>⋮</Text></Pressable>}
                  </View>
                  {!!selectedViewer?.bio && <Text style={styles.profileBio}>{selectedViewer.bio}</Text>}
                  {showViewerMenu && canModerate && <View style={styles.viewerMenu}>\n                    {isCreator && <Pressable disabled={moderationBusy} onPress={toggleModerator} style={styles.viewerMenuItem}><Text style={styles.viewerMenuText}>{selectedIsModerator ? "Remove Admin" : "Set as Admin"}</Text></Pressable>}
                    <Pressable disabled={moderationBusy} onPress={() => moderateViewer("mute")} style={styles.viewerMenuItem}><Text style={styles.viewerMenuText}>Mute for 12 hours</Text></Pressable>
                    <Pressable disabled={moderationBusy} onPress={() => moderateViewer("kickout")} style={styles.viewerMenuItem}><Text style={styles.viewerMenuText}>Kick out for 12 hours</Text></Pressable>
                    {pkBattle?.status !== "active" && <Pressable disabled={moderationBusy} onPress={() => moderateViewer("block")} style={styles.viewerMenuItem}><Text style={[styles.viewerMenuText,{color:"#D83B4B"}]}>Block permanently</Text></Pressable>}
                  </View>}
                </Pressable>
              </Pressable>
            </Modal>
          </View>
        )}
      </View>
    </Modal>
  );
}

function RoomTracks({
  creator, roomName, title, countryCode, countryName, onActivated,
}: {
  creator: boolean; roomName: string; title: string; countryCode: string; countryName: string;
  onActivated: (id: string) => void;
}) {
  const tracks = useTracks([Track.Source.Camera]);
  const activationStarted = useRef(false);

  useEffect(() => {
    const localVideo = tracks.find((item) => isTrackReference(item) && item.participant.isLocal);
    if (!creator || !localVideo || activationStarted.current || !supabase) return;
    activationStarted.current = true;
    void supabase.functions.invoke("livekit-control", {
      body: {
        action: "activate",
        room_name: roomName,
        title,
        country_code: countryCode,
        country_name: countryName,
      },
    }).then(({ data, error }) => {
      if (error || !data?.session_id) {
        activationStarted.current = false;
        Alert.alert("Live is not listed yet", data?.error || error?.message || "Camera publishing could not be verified.");
        return;
      }
      onActivated(data.session_id);
    });
  }, [tracks, creator, roomName, title, countryCode, countryName, onActivated]);

  const videoTracks = tracks.filter(isTrackReference);
  return (
    <View style={styles.trackStage}>
      {videoTracks.length ? videoTracks.map((trackRef) => (
        <VideoTrack key={trackRef.participant.identity} trackRef={trackRef} style={styles.video} />
      )) : <View style={styles.cameraPlaceholder}><ActivityIndicator color="#FFFFFF" /><Text style={styles.cameraText}>Waiting for camera video…</Text></View>}
    </View>
  );
}

function OpponentTracks() {
  const tracks = useTracks([Track.Source.Camera]);
  const videoTracks = tracks.filter(isTrackReference);
  return (
    <View style={styles.trackStage}>
      {videoTracks.length ? videoTracks.map((trackRef) => (
        <VideoTrack key={trackRef.participant.identity} trackRef={trackRef} style={styles.video} />
      )) : (
        <View style={styles.cameraPlaceholder}>
          <ActivityIndicator color="#FFFFFF" />
          <Text style={styles.cameraText}>Connecting opponent video…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#071522" },
  header: { height: 58, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#1C3142" },
  headerTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  closeButton: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#203447" },
  closeText: { color: "#FFFFFF", fontSize: 28, lineHeight: 30 },
  form: { padding: 22, gap: 12 },
  hero: { alignItems: "center", paddingVertical: 28, gap: 8 },
  heroIcon: { color: "#FF465B", fontSize: 34 },
  heroTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  heroText: { color: "#B7C6D3", fontSize: 13, textAlign: "center" },
  label: { color: "#D8E6F1", fontWeight: "700", marginTop: 8 },
  input: { color: "#FFFFFF", backgroundColor: "#142A3B", borderWidth: 1, borderColor: "#294358", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  primary: { backgroundColor: "#168BE8", borderRadius: 14, alignItems: "center", paddingVertical: 15, marginTop: 12 },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  note: { color: "#9DB0C0", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 6 },
  room: { flex: 1, backgroundColor: "#000000" },
  videoStageSingle: { flex: 1 },
  pkVideoRow: { flex: 1, flexDirection: "row" },
  pkVideoPane: { flex: 1, overflow: "hidden", backgroundColor: "#000000" },
  pkSideBadge: { position: "absolute", top: 74, left: 8, color: "#FFFFFF", backgroundColor: "#071522CC", overflow: "hidden", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, fontSize: 10, fontWeight: "900" },
  liveHeaderActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  pkButton: { backgroundColor: "#7C4DFF", borderRadius: 20, paddingHorizontal: 15, paddingVertical: 11 },
  pkButtonText: { color: "#FFFFFF", fontWeight: "900" },
  pkEndButton: { backgroundColor: "#A45B20", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 11 },
  pkTimer: { color: "#FFE28A", fontSize: 13, fontWeight: "900", marginTop: 6, textShadowColor: "#000000", textShadowRadius: 4 },
  pkSideLabel: { color: "#FFE28A", fontSize: 10, fontWeight: "900" },
  pkPanelCard: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 18, gap: 13, maxHeight: "75%" },
  pkPanelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pkPanelTitle: { color: "#172B3A", fontSize: 19, fontWeight: "900" },
  pkPanelHint: { color: "#71879A", fontSize: 12 },
  pkDurationRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  pkDurationOption: { flex: 1, borderWidth: 1, borderColor: "#D8E6F1", borderRadius: 12, paddingVertical: 11, alignItems: "center" },
  pkDurationSelected: { backgroundColor: "#EAF3FF", borderColor: "#168BE8" },
  pkDurationText: { color: "#526B7D", fontWeight: "800" },
  pkDurationTextSelected: { color: "#168BE8" },
  pkCreatorList: { maxHeight: 320 },
  pkCreatorRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#EEF2F5" },
  pkCreatorAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#EAF3FF", alignItems: "center", justifyContent: "center" },
  pkCreatorAvatarText: { color: "#168BE8", fontSize: 16, fontWeight: "900" },
  pkCreatorName: { color: "#172B3A", fontSize: 14, fontWeight: "900" },
  pkCreatorUsername: { color: "#71879A", fontSize: 11, marginTop: 2 },
  pkInviteAction: { color: "#168BE8", fontSize: 12, fontWeight: "900" },
  pkInviteCard: { borderTopWidth: 1, borderTopColor: "#EEF2F5", paddingTop: 12, gap: 8 },
  pkAcceptButton: { flex: 1, backgroundColor: "#168BE8", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  pkAcceptText: { color: "#FFFFFF", fontWeight: "900" },
  pkDeclineButton: { flex: 1, backgroundColor: "#F1F5F8", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  pkDeclineText: { color: "#526B7D", fontWeight: "900" },
  trackStage: { flex: 1, backgroundColor: "#000000", justifyContent: "center" },
  video: { flex: 1, width: "100%" },
  cameraPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  cameraText: { color: "#FFFFFF" },
  liveOverlay: { position: "absolute", left: 16, right: 16, top: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  livePill: { color: "#FFFFFF", backgroundColor: "#E5394D", overflow: "hidden", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, fontWeight: "900", alignSelf: "flex-start" },
  liveTitle: { color: "#FFFFFF", fontWeight: "800", marginTop: 8, textShadowColor: "#000000", textShadowRadius: 5 },
  endButton: { backgroundColor: "#E5394D", borderRadius: 22, paddingHorizontal: 18, paddingVertical: 12, minWidth: 84, alignItems: "center" },
  endText: { color: "#FFFFFF", fontWeight: "800" },
  waiting: { position: "absolute", bottom: 24, left: 20, right: 20, color: "#FFFFFF", textAlign: "center", backgroundColor: "#00000088", padding: 10, borderRadius: 12 },
  liveChatPanel: { position: "absolute", left: 12, right: 12, bottom: 18, maxHeight: "38%", backgroundColor: "#071522AA", borderRadius: 16, padding: 10, gap: 8 },
  liveChatList: { maxHeight: 150 },
  liveChatRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 7 },
  liveChatUsername: { color: "#8FD5FF", fontSize: 12, fontWeight: "900" },
  liveChatBody: { color: "#FFFFFF", fontSize: 12, flexShrink: 1 },
  liveChatHint: { color: "#FFFFFF", fontSize: 12, paddingVertical: 8 },
  liveChatComposer: { flexDirection: "row", alignItems: "center", gap: 7 },
  liveChatInput: { flex: 1, minHeight: 40, maxHeight: 70, borderRadius: 20, paddingHorizontal: 14, color: "#FFFFFF", backgroundColor: "#FFFFFF22", borderWidth: 1, borderColor: "#FFFFFF44" },
  liveChatSend: { backgroundColor: "#168BE8", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 11 },
  liveChatSendText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  profileBackdrop: { flex: 1, backgroundColor: "#0009", justifyContent: "center", padding: 22 },
  profileCard: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 16, gap: 12 },
  profileCardTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  profileAvatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#EAF5FF" },
  profileAvatarFallback: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#EAF5FF", alignItems: "center", justifyContent: "center" },
  profileAvatarLetter: { color: "#168BE8", fontSize: 22, fontWeight: "900" },
  profileDisplayName: { color: "#172B3A", fontSize: 15, fontWeight: "900" },
  profileUsername: { color: "#71879A", fontSize: 12 },
  profileBio: { color: "#526B7D", fontSize: 12, lineHeight: 18 },
  moreButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#EFF7FC" },
  moreButtonText: { color: "#172B3A", fontSize: 24, fontWeight: "900" },
  viewerMenu: { borderTopWidth: 1, borderTopColor: "#E8EEF3", paddingTop: 4 },
  viewerMenuItem: { paddingVertical: 12 },
  viewerMenuText: { color: "#172B3A", fontSize: 14, fontWeight: "700" },
});
