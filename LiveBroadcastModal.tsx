import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from "react-native";
import { AudioSession, LiveKitRoom, VideoTrack, useTracks, isTrackReference } from "@livekit/react-native";
import { Track } from "livekit-client";
import { supabase } from "./supabase";

type RoomCredentials = { url: string; token: string; room_name: string; role: "creator" | "viewer" };

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
  const isCreator = !sessionId;

  useEffect(() => {
    if (!visible || !sessionId || !supabase) return;
    let cancelled = false;
    const join = async () => {
      setBusy(true);
      const { data, error } = await supabase.functions.invoke("livekit-control", {
        body: { action: "join", session_id: sessionId },
      });
      if (cancelled) return;
      if (error || !data?.token || !data?.url || !data?.room_name) {
        Alert.alert("Unable to join Live", data?.error || error?.message || "Please try again.");
        setBusy(false);
        onClose();
        return;
      }
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
            <LiveKitRoom
              serverUrl={credentials.url}
              token={credentials.token}
              connect={true}
              audio={true}
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
            <View style={styles.liveOverlay}>
              <View><Text style={styles.livePill}>● LIVE</Text><Text style={styles.liveTitle}>{title}</Text></View>
              <Pressable onPress={finishLive} disabled={ending} style={styles.endButton}>
                {ending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.endText}>{isCreator ? "End Live" : "Leave"}</Text>}
              </Pressable>
            </View>
            {isCreator && !activeSessionId && <Text style={styles.waiting}>Publishing camera… preparing Live discovery</Text>}
            {isCreator && !!activeSessionId && <Text style={styles.waiting}>Your broadcast is visible on MEEi Live.</Text>}
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
});
