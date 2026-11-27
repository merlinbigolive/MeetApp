import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import {
  ActivityIndicator, Alert, AppState, Image, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Platform, Share,
  Text, TextInput, View, useWindowDimensions, useColorScheme, Animated, PanResponder
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Contacts from 'expo-contacts';
import * as Localization from 'expo-localization';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { supabase } from './supabase';
import { validateProfile } from './profileValidation';
import { selectActiveVideo } from './videoPlayback';
import { buildProfileMediaUpdate, buildProfileUpdate, isProfileSessionOwner, mapProfileRecord, resolveProfileCountry, resolveProfileMediaPreview } from './profilePersistence';
import LiveBroadcastModal from './LiveBroadcastModal';

type Media = { uri: string; type: 'image' | 'video'; name?: string; size?: number; mimeType?: string; storagePath?: string; unavailable?: boolean };
type CloudMediaRow = { id: string; kind: 'avatar' | 'cover' | 'post'; position: number; storage_path: string; media_type: 'image' | 'video'; original_name: string | null; };
type Tab = 'Home' | 'Public' | 'Search' | 'Videos' | 'Live' | 'Create' | 'Inbox' | 'Profile';
type SearchCategory = 'People' | 'Videos' | 'Reels' | 'Trending' | 'Funny' | 'Vlogs' | 'Cinema' | 'Creators';
type SearchVideo = { id: string; caption: string | null; media_path: string; created_at: string; user_id: string; content_category: string; like_count: number; view_count: number };
type LiveCreator = { session_id: string; user_id: string; username: string; display_name: string; profession_category: string | null; country_code: string; country_name: string; title: string; thumbnail_path: string | null; avatar_path: string | null; playback_url: string | null; started_at: string };
type PublishedPost = { id: string; post_type: 'photo' | 'video' | 'text'; caption: string | null; media_path: string | null; created_at: string; visibility: string; content_category: string | null; like_count: number; viewer_liked: boolean; comment_count: number; media: Media };
type FeedPost = PublishedPost & { author: PublicProfile; authorAvatar?: Media | null };
type PostComment = { id: string; post_id: string; user_id: string; body: string; created_at: string; username: string; display_name: string };
type PostReactionSummary = { counts: Record<string, number>; mine: string | null };
type BlockedAccount = { user_id: string; username: string; display_name: string; blocked_at: string };
type PublicProfile = { id: string; username: string; display_name: string; bio: string | null; profession_category: string | null; website_url?: string | null; activity_status?: string | null; is_private?: boolean; account_type?: 'personal' | 'business'; business_name?: string | null; business_category?: string | null; business_description?: string | null };
type FollowRequest = { follower_id: string; username: string; display_name: string; requested_at: string };
type ChatMessage = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; read_at?: string | null; message_type?: 'text' | 'voice'; audio_path?: string | null; audio_url?: string | null; transcript?: string | null };
type ChatThread = { id: string; user_one_id: string; user_two_id: string; updated_at: string; unread_count?: number; otherUser: PublicProfile };

const LONG_VIDEOS_PUBLIC_ENABLED = false; // Keep the completed Long Videos experience private until monetization is ready.

const CUCKOO_SOUND_FILE = 'cuckoo_default_natural.wav';
const CUCKOO_SOUND_CHANNEL = 'messages-cuckoo-sound';
const SILENT_MESSAGE_CHANNEL = 'messages-silent';
const NOTIFICATION_SOUND_KEY = '@cuckoo/message_notification_sound';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const LIGHT_C = {
  bg: '#FFFFFF', panel: '#FFFFFF', panel2: '#F4F9FD', text: '#172B3A',
  muted: '#718096', pink: '#258FEA', cyan: '#43B8E8', border: '#E5EDF4',
  success: '#22A06B', danger: '#D64545'
};
const DARK_C = {
  bg: '#0B1420', panel: '#121F2D', panel2: '#1A2A3A', text: '#EAF3FA',
  muted: '#9AAFC0', pink: '#49A9F5', cyan: '#65C7EF', border: '#2A3D50',
  success: '#4BC58C', danger: '#FF7373'
};
let C = LIGHT_C;

function LongVideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, p => { p.loop = true; p.muted = true; });
  return <VideoView player={player} style={s.longVideoThumb} contentFit="cover" nativeControls={false}/>;
}

function FeedVideoMedia({ id, uri, onPress, postTop, scrollY, viewportHeight, active, onVisibilityChange }: {
  id: string; uri: string; onPress: () => void; postTop: number; scrollY: number;
  viewportHeight: number; active: boolean; onVisibilityChange: (id: string, ratio: number) => void;
}) {
  const player = useVideoPlayer(uri, p => { p.loop = true; p.muted = true; });
  const [mediaLayout, setMediaLayout] = useState({ y: 0, height: 0 });
  const mediaTop = postTop + mediaLayout.y - scrollY;
  const visibleHeight = viewportHeight > 0 && postTop >= 0 && mediaLayout.height > 0
    ? Math.max(0, Math.min(mediaTop + mediaLayout.height, viewportHeight) - Math.max(mediaTop, 0))
    : 0;
  const visibilityRatio = mediaLayout.height > 0 ? visibleHeight / mediaLayout.height : 0;
  useEffect(() => {
    onVisibilityChange(id, visibilityRatio);
    return () => onVisibilityChange(id, 0);
  }, [id, onVisibilityChange, visibilityRatio]);
  useEffect(() => {
    if (active && visibilityRatio >= 0.25) player.play();
    else player.pause();
    return () => player.pause();
  }, [active, player, visibilityRatio]);
  return <Pressable onLayout={event => setMediaLayout({
    y: event.nativeEvent.layout.y,
    height: event.nativeEvent.layout.height,
  })} onPress={onPress} style={s.feedMedia}>
    <VideoView player={player} style={{width:'100%',height:'100%'}} contentFit="cover" nativeControls={false}/>
  </Pressable>;
}

function SearchReelTile({ id, uri, caption, views, onPress, gridTop, scrollY, viewportHeight, active, onVisibilityChange }: {
  id: string; uri?: string; caption: string; views: number; onPress: () => void;
  gridTop: number; scrollY: number; viewportHeight: number;
  active: boolean; onVisibilityChange: (id: string, ratio: number) => void;
}) {
  const player = useVideoPlayer(uri || null, p => {
    p.loop = true;
    p.muted = true;
  });
  const [tileLayout, setTileLayout] = useState({ y: 0, height: 0 });
  const tileTop = gridTop + tileLayout.y - scrollY;
  const visibleHeight = viewportHeight > 0 && tileLayout.height > 0
    ? Math.max(0, Math.min(tileTop + tileLayout.height, viewportHeight) - Math.max(tileTop, 0))
    : 0;
  const visibilityRatio = uri && tileLayout.height > 0 ? visibleHeight / tileLayout.height : 0;
  useEffect(() => {
    onVisibilityChange(id, visibilityRatio);
    return () => onVisibilityChange(id, 0);
  }, [id, onVisibilityChange, visibilityRatio]);
  useEffect(() => {
    if (uri && active && visibilityRatio >= 0.25) player.play();
    else player.pause();
    return () => player.pause();
  }, [active, player, uri, visibilityRatio]);
  return <Pressable onLayout={event => setTileLayout({
    y: event.nativeEvent.layout.y,
    height: event.nativeEvent.layout.height,
  })} onPress={onPress} style={s.reelTile}>
    {uri ? <VideoView player={player} style={s.reelTileVideo} contentFit="cover" nativeControls={false}/> : <View style={s.reelTileFallback}><Ionicons name="play-circle" size={34} color="#FFFFFF"/></View>}
    <View style={s.reelTileShade}/>
    <View style={s.reelTilePlay}><Ionicons name="play" size={13} color="#FFFFFF"/></View>
    <View style={s.reelTileInfo}><Text style={s.reelTileCaption} numberOfLines={2}>{caption}</Text><View style={s.reelTileViews}><Ionicons name="eye-outline" size={12} color="#FFFFFF"/><Text style={s.reelTileViewsText}>{views.toLocaleString()}</Text></View></View>
  </Pressable>;
}

function ProfileCoverVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, p => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    player.play();
    return () => player.pause();
  }, [player]);
  return <VideoView player={player} style={s.coverBackdropVideo} contentFit="cover" nativeControls={false} />;
}

function VoiceMessageBubble({ uri, transcript, mine }: { uri: string; transcript: string | null; mine: boolean }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const [showTranscript, setShowTranscript] = useState(false);
  return <View style={{ gap: 7, minWidth: 170 }}>
    <Pressable onPress={() => status.playing ? player.pause() : player.play()} onPressIn={() => setShowTranscript(true)} onPressOut={() => setShowTranscript(false)} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5 }}>
      <Ionicons name={status.playing ? 'pause-circle' : 'play-circle'} size={27} color={mine ? C.pink : C.cyan}/>
      <View style={{ flex: 1 }}><Text style={{ color: C.text, fontSize: 13, fontWeight: '600' }}>Voice message</Text><Text style={{ color: C.muted, fontSize: 10 }}>Hold to read transcript</Text></View>
    </Pressable>
    {showTranscript && <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 7 }}><Text style={{ color: C.text, fontSize: 13 }}>{transcript || 'Transcript unavailable for this voice message.'}</Text></View>}
  </View>;
}

function CoverMediaSlide({ media }: { media: Media }) {
  const player = useVideoPlayer(media.type === 'video' && !media.unavailable ? media.uri : null, p => { p.loop = true; });
  useEffect(() => {
    if (media.type === 'video' && !media.unavailable) player.play();
    else player.pause();
    return () => player.pause();
  }, [media.type, media.uri, media.unavailable, player]);
  if (media.unavailable) {
    return <View style={{ width: '100%', height: '85%', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <Ionicons name="alert-circle-outline" size={34} color="#FFFFFF" />
      <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>Preview unavailable</Text>
    </View>;
  }
  return media.type === 'image'
    ? <Image source={{ uri: media.uri }} resizeMode="contain" style={{ width: '100%', height: '85%' }} />
    : <VideoView player={player} style={{ width: '100%', height: '85%' }} contentFit="contain" nativeControls />;
}

export function MEEiOpeningExperience({ onComplete }: { onComplete?: () => void }) {
  const [visible, setVisible] = useState(true);
  const [welcome, setWelcome] = useState(false);
  const [mascotVisible, setMascotVisible] = useState(false);
  const { width } = useWindowDimensions();
  const mascotY = useRef(new Animated.Value(42)).current;
  const mascotScale = useRef(new Animated.Value(0.72)).current;
  const mascotOpacity = useRef(new Animated.Value(0)).current;
  const mascotFloat = useRef(new Animated.Value(0)).current;
  const mascotSway = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const blush = useRef(new Animated.Value(0)).current;
  const welcomeOpacity = useRef(new Animated.Value(0)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let alive = true;
    const entryTimer = setTimeout(() => {
      if (!alive) return;
      setMascotVisible(true);
      Animated.parallel([
        Animated.spring(mascotY, { toValue: 0, useNativeDriver: true, damping: 12, stiffness: 105 }),
        Animated.spring(mascotScale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 100 }),
        Animated.timing(mascotOpacity, { toValue: 1, duration: 520, useNativeDriver: true }),
      ]).start();
    }, 420);

    const floatLoop = Animated.loop(Animated.sequence([
      Animated.timing(mascotFloat, { toValue: -7, duration: 1050, useNativeDriver: true }),
      Animated.timing(mascotFloat, { toValue: 0, duration: 1050, useNativeDriver: true }),
    ]));
    const blinkLoop = Animated.loop(Animated.sequence([
      Animated.delay(1250),
      Animated.timing(blink, { toValue: 0, duration: 85, useNativeDriver: true }),
      Animated.timing(blink, { toValue: 1, duration: 125, useNativeDriver: true }),
      Animated.delay(1850),
      Animated.timing(blink, { toValue: 0, duration: 85, useNativeDriver: true }),
      Animated.timing(blink, { toValue: 1, duration: 125, useNativeDriver: true }),
    ]));
    const swayLoop = Animated.loop(Animated.sequence([
      Animated.timing(mascotSway, { toValue: -1, duration: 420, useNativeDriver: true }),
      Animated.timing(mascotSway, { toValue: 1, duration: 520, useNativeDriver: true }),
      Animated.timing(mascotSway, { toValue: 0, duration: 360, useNativeDriver: true }),
      Animated.delay(900),
    ]));
    floatLoop.start();
    blinkLoop.start();
    swayLoop.start();

    const blushLoop = Animated.sequence([
      Animated.delay(900),
      Animated.timing(blush, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(850),
      Animated.timing(blush, { toValue: 0.35, duration: 450, useNativeDriver: true }),
    ]);
    blushLoop.start();

    const welcomeTimer = setTimeout(() => {
      if (!alive) return;
      setWelcome(true);
      Animated.timing(welcomeOpacity, { toValue: 1, duration: 760, useNativeDriver: true }).start();
    }, 3900);

    return () => {
      alive = false;
      clearTimeout(entryTimer);
      clearTimeout(welcomeTimer);
      floatLoop.stop();
      blinkLoop.stop();
      swayLoop.stop();
      blushLoop.stop();
    };
  }, [blink, blush, mascotFloat, mascotOpacity, mascotScale, mascotSway, mascotY, welcomeOpacity]);

  const continueIntoApp = () => {
    Animated.timing(exitOpacity, { toValue: 0, duration: 420, useNativeDriver: true }).start(() => { setVisible(false); onComplete?.(); });
  };
  if (!visible) return null;

  const openingMascotWidth = Math.min(width * 0.64, 270);
  const welcomeMascotWidth = Math.min(width * 0.48, 190);
  const blinkLineOpacity = blink.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const swayRotation = mascotSway.interpolate({ inputRange: [-1, 1], outputRange: ['-4deg', '4deg'] });

  return (
    <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, opacity: exitOpacity }}>
      <View style={{ flex: 1, backgroundColor: welcome ? '#F8FCFF' : '#0789F5', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <View style={{ position: 'absolute', width: width * 1.2, height: width * 1.2, borderRadius: width, backgroundColor: welcome ? '#E6F5FF' : '#159BFF', top: -width * 0.68, right: -width * 0.42 }} />
        <View style={{ position: 'absolute', width: width * 0.92, height: width * 0.92, borderRadius: width, backgroundColor: welcome ? '#EFF9FF' : '#0075E9', bottom: -width * 0.48, left: -width * 0.35 }} />
        {!welcome ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%' }}>
            <Animated.View style={{ alignItems: 'center', opacity: mascotVisible ? mascotOpacity : 0, transform: [{ translateY: Animated.add(mascotY, mascotFloat) }, { rotate: swayRotation }, { scale: mascotScale }] }}>
              <View style={{ width: openingMascotWidth, height: openingMascotWidth * 1.245, alignItems: 'center', justifyContent: 'center' }}>
                <Animated.Image source={require('./assets/cuckoo_mascot.webp')} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
                <Animated.View pointerEvents="none" style={{ position: 'absolute', left: '37%', top: '35%', width: '13%', height: 7, borderRadius: 8, backgroundColor: '#A77CEB', opacity: blinkLineOpacity }} />
                <Animated.View pointerEvents="none" style={{ position: 'absolute', left: '65%', top: '37%', width: '13%', height: 7, borderRadius: 8, backgroundColor: '#A77CEB', opacity: blinkLineOpacity }} />
                <Animated.View pointerEvents="none" style={{ position: 'absolute', left: '29%', top: '43%', width: '12%', height: 9, borderRadius: 10, backgroundColor: '#FF7DAA', opacity: blush }} />
                <Animated.View pointerEvents="none" style={{ position: 'absolute', right: '27%', top: '44%', width: '12%', height: 9, borderRadius: 10, backgroundColor: '#FF7DAA', opacity: blush }} />
              </View>
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: 2.4, marginTop: 12 }}>HELLO THERE!</Text>
            </Animated.View>
            {!mascotVisible && <View style={{ alignItems: 'center' }}><Text style={{ color: '#FFFFFF', fontSize: 34, fontWeight: '900', letterSpacing: 4 }}>MEEi</Text><Text style={{ color: '#EAF7FF', fontSize: 13, marginTop: 8 }}>Connect · Chat · Make Friends</Text></View>}
          </View>
        ) : (
          <Animated.View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26, width: '100%', opacity: welcomeOpacity }}>
            <View style={{ width: welcomeMascotWidth, height: welcomeMascotWidth * 1.245, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.Image source={require('./assets/cuckoo_mascot.webp')} resizeMode="contain" style={{ width: '100%', height: '100%', transform: [{ translateY: mascotFloat }, { rotate: swayRotation }] }} />
              <Animated.View pointerEvents="none" style={{ position: 'absolute', left: '37%', top: '35%', width: '13%', height: 6, borderRadius: 8, backgroundColor: '#A77CEB', opacity: blinkLineOpacity }} />
              <Animated.View pointerEvents="none" style={{ position: 'absolute', left: '65%', top: '37%', width: '13%', height: 6, borderRadius: 8, backgroundColor: '#A77CEB', opacity: blinkLineOpacity }} />
            </View>
            <Text style={{ color: '#087FEA', fontSize: 36, fontWeight: '900', letterSpacing: 1.5, marginTop: 8 }}>MEEi</Text>
            <Text style={{ color: '#142E49', fontSize: 18, fontWeight: '800', marginTop: 8 }}>Welcome to MEEi</Text>
            <Text style={{ color: '#71879A', fontSize: 14, textAlign: 'center', lineHeight: 21, marginTop: 10 }}>Connect with amazing people{ '\n' }around the world!</Text>
            <Pressable onPress={continueIntoApp} style={{ marginTop: 34, width: Math.min(width - 64, 300), paddingVertical: 15, borderRadius: 28, backgroundColor: '#0789F5', alignItems: 'center', shadowColor: '#0789F5', shadowOpacity: 0.22, shadowRadius: 12, elevation: 4 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>Continue →</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}


const CHAT_EMOJI_CATEGORIES = [
  { label: 'Smileys', icon: '😀', emojis: '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😋 😛 😜 🤪 🤗 🤔 🫡 🤭 🫢 😎 🥳 😭 😢 😤 😡 🤯 🥹 🫶'.split(' ') },
  { label: 'Gestures', icon: '👋', emojis: '👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤝 🙏 💪'.split(' ') },
  { label: 'Hearts', icon: '❤️', emojis: '❤️ 🩷 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🩶 🤍 💔 ❤️‍🔥 ❤️‍🩹 💕 💞 💓 💗 💖 💘 💝 💟'.split(' ') },
  { label: 'Animals', icon: '🐶', emojis: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦄 🐝 🦋 🐢 🐬 🦖'.split(' ') },
  { label: 'Food', icon: '🍕', emojis: '🍎 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥑 🍕 🍔 🍟 🌮 🍜 🍣 🍩 🍪 🎂 🍫 ☕ 🧋'.split(' ') },
  { label: 'Activities', icon: '⚽', emojis: '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏓 🏸 🥊 🏆 🎮 🎯 🎲 🎨 🎤 🎧 🎬 🎸 🎹 🏋️ 🚴 🧘'.split(' ') },
  { label: 'Objects', icon: '✨', emojis: '✨ ⭐ 🌟 💫 🔥 💯 🎉 🎊 🎁 🎈 💎 👑 🚀 ✈️ 🚗 📱 💻 📸 💡 🔔 📌 ❤️'.split(' ') },
];

const POST_REACTION_EMOJIS = ['❤️','😂','😍','🔥','👏','😮','😢','👍','🎉','🤔','🥰','🙏','💯','🤩','😡','🫶'];

function PostReactionPicker({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (emoji: string) => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}>
      <Pressable onPress={() => {}} style={{ backgroundColor: C.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 30, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: C.text, fontSize: 16, fontWeight: '900' }}>React to post</Text>
          <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={23} color="#526B7D"/></Pressable>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
          {POST_REACTION_EMOJIS.map(emoji => <Pressable key={emoji} onPress={() => onSelect(emoji)} style={{ width: '23%', minHeight: 54, borderRadius: 13, backgroundColor: C.panel2, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 29 }}>{emoji}</Text></Pressable>)}
        </View>
      </Pressable>
    </Pressable>
  </Modal>;
}

function ChatEmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [category, setCategory] = useState('Smileys');
  const active = CHAT_EMOJI_CATEGORIES.find(item => item.label === category) || CHAT_EMOJI_CATEGORIES[0];
  return (
    <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E9EF', borderRadius: 16, padding: 10, marginBottom: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 9 }}>
        {CHAT_EMOJI_CATEGORIES.map(item => (
          <Pressable key={item.label} onPress={() => setCategory(item.label)} accessibilityRole="button" accessibilityLabel={item.label}
            style={{ minWidth: 42, height: 36, paddingHorizontal: 9, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: category === item.label ? '#E7F4FF' : '#F5F8FB', borderWidth: 1, borderColor: category === item.label ? '#8BCBFA' : '#EDF1F5' }}>
            <Text style={{ fontSize: 19 }}>{item.icon}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
        {active.emojis.map((emoji, index) => (
          <Pressable key={active.label + index} onPress={() => onSelect(emoji)} accessibilityRole="button" accessibilityLabel={'Insert ' + emoji}
            style={{ width: '12.5%', minWidth: 34, height: 42, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 25 }}>{emoji}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const MEEI_COUNTRY_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(' ');

const getCountryDisplayName = (countryCode: string, localeTag?: string) => {
  try {
    const DisplayNames = (Intl as any).DisplayNames;
    return DisplayNames ? (new DisplayNames([localeTag || 'en'], { type: 'region' }).of(countryCode) || countryCode) : countryCode;
  } catch {
    return countryCode;
  }
};

export default function App() {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<'system' | 'light' | 'dark'>('system');
  const activePalette = themeMode === 'system' ? (systemColorScheme === 'dark' ? DARK_C : LIGHT_C) : themeMode === 'dark' ? DARK_C : LIGHT_C;
  C = activePalette;
  s = createStyles(activePalette);
  const setAppearanceMode = (mode: 'system' | 'light' | 'dark') => {
    setThemeMode(mode);
    void AsyncStorage.setItem('@meei/appearance_mode', mode).catch(error => console.warn('Appearance preference could not be saved:', error));
  };
  const [tab, setTab] = useState<Tab>('Profile');
  const [createMenuVisible, setCreateMenuVisible] = useState(false);
  const [legalVisible, setLegalVisible] = useState(false);
  const [blockedAccountsVisible, setBlockedAccountsVisible] = useState(false);
  const [blockedAccounts, setBlockedAccounts] = useState<BlockedAccount[]>([]);
  const [blockedAccountsLoading, setBlockedAccountsLoading] = useState(false);
  const [unblockingUserId, setUnblockingUserId] = useState<string | null>(null);
  const [liveStudioVisible, setLiveStudioVisible] = useState(false);
  const [liveJoinSessionId, setLiveJoinSessionId] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingMediaKinds, setUploadingMediaKinds] = useState<Record<'avatar' | 'cover' | 'post', boolean>>({ avatar: false, cover: false, post: false });
  const savingProfileLock = useRef(false);
  const mediaUploadLocks = useRef<Set<string>>(new Set());
  const [profileLoadStatus, setProfileLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadedProfileUserId, setLoadedProfileUserId] = useState('');
  const [profileLoadError, setProfileLoadError] = useState('');
  const [profileLoadAttempt, setProfileLoadAttempt] = useState(0);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [occupation, setOccupation] = useState('');
  const [accountType, setAccountType] = useState<'personal' | 'business'>('personal');
  const [businessName, setBusinessName] = useState('');
  const [businessCategory, setBusinessCategory] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [activity, setActivity] = useState('Available');
  const [avatar, setAvatar] = useState<Media | null>(null);
  const [covers, setCovers] = useState<Media[]>([]);
  const [posts, setPosts] = useState<Media[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [followerCount, setFollowerCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [publicProfiles, setPublicProfiles] = useState<PublicProfile[]>([]);
  const [discoverAvatars, setDiscoverAvatars] = useState<Record<string, Media>>({});
  const [followedUserIds, setFollowedUserIds] = useState<string[]>([]);
  const [pendingFollowIds, setPendingFollowIds] = useState<string[]>([]);
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>([]);
  const [isPrivateAccount, setIsPrivateAccount] = useState(false);
  const [followRequestBusyIds, setFollowRequestBusyIds] = useState<string[]>([]);
  const [profileSearch, setProfileSearch] = useState('');
  const [debouncedProfileSearch, setDebouncedProfileSearch] = useState('');
  const [searchCategory, setSearchCategory] = useState<SearchCategory>('Reels');
  const [publicVideos, setPublicVideos] = useState<SearchVideo[]>([]);
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  const [savedPostIds, setSavedPostIds] = useState<string[]>([]);
  const [postReactionSummaries, setPostReactionSummaries] = useState<Record<string, PostReactionSummary>>({});
  const [reactionPostId, setReactionPostId] = useState<string | null>(null);
  const [savedPostBusyIds, setSavedPostBusyIds] = useState<string[]>([]);
  const [reportBusyIds, setReportBusyIds] = useState<string[]>([]);
  const [reportPost, setReportPost] = useState<FeedPost | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [ownPublishedPosts, setOwnPublishedPosts] = useState<PublishedPost[]>([]);
  const [otherPublishedPosts, setOtherPublishedPosts] = useState<PublishedPost[]>([]);
  const [commentPost, setCommentPost] = useState<PublishedPost | null>(null);
  const [postComments, setPostComments] = useState<PostComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentSending, setCommentSending] = useState(false);
  const [postsRefreshKey, setPostsRefreshKey] = useState(0);
  const [mediaRefreshKey, setMediaRefreshKey] = useState(0);
  const [likedVideoIds, setLikedVideoIds] = useState<string[]>([]);
  const [likeBusyIds, setLikeBusyIds] = useState<string[]>([]);
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [liveCreators, setLiveCreators] = useState<LiveCreator[]>([]);
  const [liveMediaUrls, setLiveMediaUrls] = useState<Record<string, string>>({});
  const [homeCountryCode, setHomeCountryCode] = useState(() => (Localization.getLocales()[0]?.regionCode || 'IN').toUpperCase());
  const [homeCountryName, setHomeCountryName] = useState(() => getCountryDisplayName((Localization.getLocales()[0]?.regionCode || 'IN').toUpperCase(), Localization.getLocales()[0]?.languageTag));
  const [homeCountrySearch, setHomeCountrySearch] = useState('');
  const [liveCountry, setLiveCountry] = useState(() => (Localization.getLocales()[0]?.regionCode || 'IN').toUpperCase());
  const [liveCountryPage, setLiveCountryPage] = useState<'explore' | 'all' | 'country'>('explore');
  const [liveCountrySearch, setLiveCountrySearch] = useState('');
  const [loadingLiveCreators, setLoadingLiveCreators] = useState(false);
  const [followBusyIds, setFollowBusyIds] = useState<string[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<PublicProfile | null>(null);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [activeChat, setActiveChat] = useState<ChatThread | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [contactMatches, setContactMatches] = useState<PublicProfile[]>([]);
  const [contactSyncing, setContactSyncing] = useState(false);
  const [contactSyncDone, setContactSyncDone] = useState(false);
  const [contactDiscoverable, setContactDiscoverable] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceStopPending, setVoiceStopPending] = useState(false);
  const [voiceLocalUri, setVoiceLocalUri] = useState<string | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceSending, setVoiceSending] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState('hi-IN');
  const [translationLanguage, setTranslationLanguage] = useState<'hi' | 'en'>('hi');
  const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});
  const [visibleTranslations, setVisibleTranslations] = useState<string[]>([]);
  const [translatingMessageIds, setTranslatingMessageIds] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [messageSoundEnabled, setMessageSoundEnabled] = useState(true);

  useEffect(() => {
    let previousState = AppState.currentState;
    const refreshSignedMedia = () => {
      setMediaRefreshKey(value => value + 1);
      setPostsRefreshKey(value => value + 1);
    };
    const subscription = AppState.addEventListener('change', nextState => {
      const returnedToForeground = previousState !== 'active' && nextState === 'active';
      previousState = nextState;
      if (returnedToForeground) refreshSignedMedia();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') refreshSignedMedia();
    }, 50 * 60 * 1000);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem('@meei/appearance_mode').then(saved => {
      if (active && (saved === 'system' || saved === 'light' || saved === 'dark')) setThemeMode(saved);
    }).catch(error => console.warn('Appearance preference could not be loaded:', error));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const setupMessageNotifications = async () => {
      try {
        const saved = await AsyncStorage.getItem(NOTIFICATION_SOUND_KEY);
        const enabled = saved === null ? true : saved === 'true';
        if (active) setMessageSoundEnabled(enabled);
        const permission = await Notifications.getPermissionsAsync();
        if (!permission.granted) await Notifications.requestPermissionsAsync();
        await Notifications.setNotificationChannelAsync(CUCKOO_SOUND_CHANNEL, {
          name: 'Messages - MEEi sound', importance: Notifications.AndroidImportance.HIGH,
          sound: CUCKOO_SOUND_FILE, vibrationPattern: [0, 180, 100, 180],
        });
        await Notifications.setNotificationChannelAsync(SILENT_MESSAGE_CHANNEL, {
          name: 'Messages - Silent', importance: Notifications.AndroidImportance.DEFAULT,
          sound: null, vibrationPattern: [0],
        });
      } catch (error) {
        console.warn('Message notification setup failed:', error);
      }
    };
    void setupMessageNotifications();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const supabaseClient = supabase;
    if (!supabaseClient || !currentUserId) return;
    let active = true;
    const registerPushToken = async () => {
      try {
        let permission = await Notifications.getPermissionsAsync();
        if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
        if (!permission.granted) return;
        const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) {
          console.warn('Expo project ID is missing; background push token registration skipped.');
          return;
        }
        const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
        if (!active) return;
        const { error } = await supabaseClient.rpc('register_my_push_token', {
          p_expo_push_token: tokenResult.data,
          p_device_platform: Platform.OS,
          p_sound_enabled: messageSoundEnabled,
        });
        if (error) console.warn('Push token could not be saved:', error.message);
      } catch (error) {
        console.warn('Push token registration failed:', error);
      }
    };
    void registerPushToken();
    return () => { active = false; };
  }, [currentUserId, messageSoundEnabled]);

  const setMessageNotificationSound = async (enabled: boolean) => {
    setMessageSoundEnabled(enabled);
    try {
      await AsyncStorage.setItem(NOTIFICATION_SOUND_KEY, String(enabled));
      if (supabase && currentUserId) {
        const { error } = await supabase.rpc('set_my_push_sound_preference', { p_sound_enabled: enabled });
        if (error) console.warn('Could not update push sound preference:', error.message);
      }
      if (enabled) {
        const permission = await Notifications.getPermissionsAsync();
        if (!permission.granted) {
          const requested = await Notifications.requestPermissionsAsync();
          if (!requested.granted) {
            setMessageSoundEnabled(false);
            await AsyncStorage.setItem(NOTIFICATION_SOUND_KEY, 'false');
            Alert.alert('Notifications disabled', 'Allow notifications in your phone settings to hear the Cuckoo sound.');
          }
        }
      }
    } catch (error: any) {
      Alert.alert('Setting not saved', error?.message || 'Please try again.');
    }
  };

  useSpeechRecognitionEvent('result', event => { const recognized = event.results?.[0]?.transcript; if (recognized) setVoiceTranscript(old => event.isFinal && old && !old.endsWith(recognized) ? old + ' ' + recognized : recognized); });
  useSpeechRecognitionEvent('audioend', event => { if (event.uri) setVoiceLocalUri(event.uri); });
  useSpeechRecognitionEvent('end', () => setVoiceRecording(false));
  useSpeechRecognitionEvent('error', event => { setVoiceRecording(false); setVoiceStopPending(false); Alert.alert('Voice message error', event.message || event.error || 'Speech recognition could not start.'); });
  const [createMedia, setCreateMedia] = useState<Media | null>(null);
  const [createCaption, setCreateCaption] = useState('');
  const [createCategory, setCreateCategory] = useState<'videos' | 'reels' | 'funny' | 'vlogs' | 'cinema'>('videos');
  const [createVisibility, setCreateVisibility] = useState<'public' | 'followers' | 'private'>('public');
  const [publishingPost, setPublishingPost] = useState(false);
  const [otherProfileMedia, setOtherProfileMedia] = useState<{ avatar: Media | null; covers: Media[]; posts: Media[] }>({ avatar: null, covers: [], posts: [] });
  const [otherFollowingCount, setOtherFollowingCount] = useState(0);
  const [otherFollowerCount, setOtherFollowerCount] = useState(0);
  const [otherLikesCount, setOtherLikesCount] = useState(0);
  const [loadingOtherProfile, setLoadingOtherProfile] = useState(false);
  const [otherCoverExpanded, setOtherCoverExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [viewer, setViewer] = useState<Media | null>(null);
  const [coverExpanded, setCoverExpanded] = useState(false);
  const [coverRevealed, setCoverRevealed] = useState(false);
  const avatarDrag = useRef(new Animated.Value(0)).current;
  const coverRevealProgress = useRef(new Animated.Value(0)).current;
  const lastProfileScrollY = useRef(0);
  const animateCoverReveal = (reveal: boolean) => {
    setCoverRevealed(reveal);
    Animated.spring(coverRevealProgress, {
      toValue: reveal ? 1 : 0,
      useNativeDriver: false,
      damping: 20,
      stiffness: 150,
    }).start();
    Animated.spring(avatarDrag, {
      toValue: reveal ? 190 : 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 150,
    }).start();
  };
  const avatarPan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_: any, g: any) =>
      (g.dy > 8 && !coverRevealed) || (g.dy < -8 && coverRevealed),
    onPanResponderMove: (_: any, g: any) => {
      if (g.dy > 8 && !coverRevealed) {
        avatarDrag.setValue(Math.max(0, Math.min(g.dy, 190)));
        coverRevealProgress.setValue(Math.min(g.dy / 190, 1));
      } else if (g.dy < -8 && coverRevealed) {
        const progress = Math.max(0, 1 - Math.abs(g.dy) / 190);
        avatarDrag.setValue(progress * 190);
        coverRevealProgress.setValue(progress);
      }
    },
    onPanResponderRelease: (_: any, g: any) => {
      if (g.dy > 55) animateCoverReveal(true);
      else if (g.dy < -45) animateCoverReveal(false);
      else if (coverRevealed) animateCoverReveal(true);
      else {
        Animated.spring(avatarDrag, { toValue: 0, useNativeDriver: true }).start();
        Animated.spring(coverRevealProgress, { toValue: 0, useNativeDriver: false }).start();
      }
    },
  }), [avatarDrag, coverRevealProgress, coverRevealed]);
  const [isOwnProfile, setIsOwnProfile] = useState(true);
  const { width } = useWindowDimensions();

  useEffect(() => {
    let active = true;
    setProfileLoadStatus('loading');
    setProfileLoadError('');
    setLoadedProfileUserId('');
    const loadCloudProfile = async () => {
      if (!supabase) {
        setProfileLoadError('Cloud profile service is not configured. Please check the app setup.');
        setProfileLoadStatus('error');
        return;
      }
      try {
        const { data: authData, error: authError } = await supabase.auth.getSession();
        if (!active) return;
        if (authError) {
          console.warn('Profile session could not be restored:', authError.message);
          setProfileLoadError('Your session could not be checked. Please sign in again.');
          setProfileLoadStatus('error');
          return;
        }
        const userId = authData.session?.user.id;
        if (!userId) {
          setProfileLoadError('No signed-in account was found. Please sign in again.');
          setProfileLoadStatus('error');
          return;
        }
        setCurrentUserId(userId);
        const { data, error } = await supabase
          .from('profiles')
          .select('username, display_name, bio, website_url, profession_category, activity_status, is_private, account_type, business_name, business_category, business_description, country_code, country_name')
          .eq('id', userId)
          .maybeSingle();
        if (!active) return;
        if (error || !data) {
          console.warn('Profile details could not be loaded:', error?.message || 'No profile row found.');
          setProfileLoadError(error?.message || 'Your profile details could not be loaded. Please check your connection and retry.');
          setProfileLoadStatus('error');
          return;
        }
        setLoadedProfileUserId(userId);
        const profileForm = mapProfileRecord(data);
        setName(profileForm.name);
        setUsername(profileForm.username);
        setBio(profileForm.bio);
        setWebsite(profileForm.website);
        setOccupation(profileForm.occupation);
        setAccountType(profileForm.accountType);
        setBusinessName(profileForm.businessName);
        setBusinessCategory(profileForm.businessCategory);
        setBusinessDescription(profileForm.businessDescription);
        setIsPrivateAccount(profileForm.isPrivateAccount);

        const deviceLocale = Localization.getLocales()[0];
        const deviceCountryCode = (deviceLocale?.regionCode || 'IN').toUpperCase();
        const deviceCountryName = getCountryDisplayName(deviceCountryCode, deviceLocale?.languageTag);
        const resolvedCountry = resolveProfileCountry({
          savedCountryCode: data.country_code,
          savedCountryName: data.country_name,
          deviceCountryCode,
          deviceCountryName,
          getDisplayName: code => getCountryDisplayName(code, deviceLocale?.languageTag),
        });
        const resolvedCountryCode = resolvedCountry.countryCode;
        setHomeCountryCode(resolvedCountryCode);
        setHomeCountryName(resolvedCountry.countryName);
        setLiveCountry(resolvedCountryCode);

        const missingCountryFields = resolvedCountry.persistFields;
        if (Object.keys(missingCountryFields).length > 0) {
          const { error: countrySaveError } = await supabase.from('profiles').update({
            ...missingCountryFields,
            updated_at: new Date().toISOString(),
          }).eq('id', userId);
          if (countrySaveError) console.warn('Home country could not be saved:', countrySaveError.message);
          if (!active) return;
        }

        const [followingResult, followerResult, likesResult] = await Promise.all([
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId).eq('status', 'accepted'),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followed_id', userId).eq('status', 'accepted'),
          supabase.rpc('get_profile_likes_count', { target_user_id: userId }),
        ]);
        if (!active) return;
        if (!followingResult.error) setFollowingCount(followingResult.count ?? 0);
        if (!followerResult.error) setFollowerCount(followerResult.count ?? 0);
        if (!likesResult.error) setLikesCount(Number(likesResult.data || 0));

        if (profileForm.activity) setActivity(profileForm.activity);

        const { data: mediaRows, error: mediaError } = await supabase
          .from('profile_media')
          .select('id, kind, position, storage_path, media_type, original_name')
          .eq('user_id', userId)
          .order('position', { ascending: true });
        if (!active) return;
        if (mediaError) {
          console.warn('Profile media could not be loaded:', mediaError.message);
          setAvatar(null);
          setCovers([]);
          setPosts([]);
          setProfileLoadStatus('ready');
          Alert.alert('Profile media unavailable', 'Your profile details loaded, but photos and videos could not be loaded. Please check your connection and try again.');
          return;
        }
        const hydrated = await Promise.all(((mediaRows || []) as CloudMediaRow[]).map(async row => {
          const { media, errorMessage: signedError } = await resolveProfileMediaPreview(row, storagePath =>
            supabase!.storage.from('usay-media').createSignedUrl(storagePath, 60 * 60));
          if (media.unavailable) {
            console.warn('Profile media URL could not be created:', row.storage_path, signedError || 'Missing signed URL');
          }
          return { row, media: media as Media };
        }));
        if (!active) return;
        setAvatar(hydrated.find(item => item.row.kind === 'avatar')?.media || null);
        setCovers(hydrated.filter(item => item.row.kind === 'cover').map(item => item.media).slice(0, 3));
        setPosts(hydrated.filter(item => item.row.kind === 'post').map(item => item.media).slice(0, 3));
        if (hydrated.some(item => item.media.unavailable)) {
          Alert.alert('Some profile media unavailable', 'Your profile details loaded, but one or more photos or videos could not be opened. Your saved items are still listed so you can manage them or try again later.');
        }
        if (active) setProfileLoadStatus('ready');
      } catch (error: any) {
        console.warn('Unexpected profile loading error:', error);
        if (active) {
          setProfileLoadError(error?.message || 'Something went wrong while loading your profile. Please check your connection and retry.');
          setProfileLoadStatus('error');
        }
      }
    };
    void loadCloudProfile();
    return () => { active = false; };
  }, [profileLoadAttempt]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const loadOwnPublishedPosts = async () => {
      try {
        const client = supabase;
        if (!client) return;
        const { data: authData, error: authError } = await client.auth.getSession();
        if (!active) return;
        if (authError) throw authError;
        const userId = authData.session?.user.id;
        if (!userId) {
          setOwnPublishedPosts([]);
          return;
        }
        const { data, error } = await client.from('posts')
          .select('id, post_type, caption, media_path, created_at, visibility, content_category')
          .eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
        if (!active) return;
        if (error) throw error;
        const rows = (data || []).filter((row: any) => !!row.media_path);
        const hydrated = await Promise.all(rows.map(async (row: any) => {
          const preview = await resolveProfileMediaPreview({
            media_type: row.post_type === 'video' ? 'video' : 'image',
            original_name: null,
            storage_path: row.media_path,
          }, storagePath => client.storage.from('usay-media').createSignedUrl(storagePath, 60 * 60));
          if (preview.media.unavailable) {
            console.warn('Published profile post media URL could not be created:', row.media_path, preview.errorMessage || 'Missing signed URL');
          }
          return { ...row, media: preview.media as Media } as PublishedPost;
        }));
        if (!active) return;
        const validPosts = hydrated;
        if (validPosts.some(post => post.media.unavailable)) {
          Alert.alert('Some posts unavailable', 'One or more post previews could not be opened. Your published posts remain listed; try refreshing later.');
        }
        if (!validPosts.length) {
          setOwnPublishedPosts([]);
          return;
        }
        const engagementResult = await client.rpc('get_profile_post_engagement', { target_post_ids: validPosts.map(post => post.id) });
        if (!active) return;
        const commentCounts = await fetchPostCommentCounts(validPosts.map(post => post.id));
        if (!active) return;
        if (engagementResult.error) {
          Alert.alert('Could not load post likes', 'Your posts loaded, but likes could not be refreshed. Please try again later.');
          setOwnPublishedPosts(validPosts.map(post => ({ ...post, like_count: 0, viewer_liked: false, comment_count: commentCounts[post.id] || 0 })));
        } else {
          const engagementById = new Map<string, any>((engagementResult.data || []).map((item: any) => [item.post_id, item] as [string, any]));
          setOwnPublishedPosts(validPosts.map(post => {
            const engagement = engagementById.get(post.id) as any;
            return { ...post, like_count: Number(engagement?.like_count || 0), viewer_liked: !!engagement?.viewer_liked, comment_count: commentCounts[post.id] || 0 };
          }));
        }
      } catch (error: any) {
        console.warn('Own published profile posts could not be loaded:', error?.message || error);
        if (active) Alert.alert('Could not load your posts', 'Your profile is available, but your published posts could not be loaded. Please check your connection and try again.');
      }
    };
    void loadOwnPublishedPosts();
    return () => { active = false; };
  }, [postsRefreshKey]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedProfileSearch(profileSearch.trim().replace(/^[@#]+/, '').toLowerCase()), 300);
    return () => clearTimeout(timer);
  }, [profileSearch]);

  useEffect(() => {
    if (tab !== 'Search' || !supabase) return;
    let active = true;
    const loadDiscoverProfiles = async () => {
      setLoadingProfiles(true);
      const { data: authData, error: authError } = await supabase!.auth.getSession();
      const userId = authData.session?.user.id;
      if (authError || !userId) {
        if (active) setLoadingProfiles(false);
        return;
      }
      const searchTerm = debouncedProfileSearch.trim().replace(/^[@#]+/, '').toLowerCase();
      const profilesRequest = searchTerm
        ? supabase!.rpc('search_discover_profiles', { search_text: searchTerm })
        : supabase!.rpc('get_discover_profiles');
      const [profilesResult, followsResult] = await Promise.all([
        profilesRequest,
        supabase!.from('follows').select('followed_id, status').eq('follower_id', userId),
      ]);
      if (!active) return;
      if (profilesResult.error) Alert.alert('Could not load people', profilesResult.error.message);
      else {
        const profiles = (profilesResult.data || []) as PublicProfile[];
        setPublicProfiles(profiles);
        const profileIds = profiles.map(profile => profile.id);
        if (profileIds.length) {
          const { data: avatarRows, error: avatarError } = await supabase!
            .from('profile_media')
            .select('user_id, storage_path, media_type, original_name')
            .in('user_id', profileIds)
            .eq('kind', 'avatar');
          if (!active) return;
          if (avatarError) {
            Alert.alert('Could not load profile photos', avatarError.message);
          } else {
            const avatarEntries = await Promise.all((avatarRows || []).map(async row => {
              const { data: signed, error } = await supabase!.storage.from('usay-media').createSignedUrl(row.storage_path, 60 * 60);
              if (error || !signed?.signedUrl) return null;
              return [row.user_id, { uri: signed.signedUrl, type: row.media_type, name: row.original_name || undefined, storagePath: row.storage_path } as Media] as const;
            }));
            if (!active) return;
            setDiscoverAvatars(Object.fromEntries(avatarEntries.filter((entry): entry is NonNullable<typeof entry> => entry !== null)));
          }
        } else {
          setDiscoverAvatars({});
        }
      }
      if (followsResult.error) Alert.alert('Could not load follows', followsResult.error.message);
      else {
        setFollowedUserIds((followsResult.data || []).filter(row => row.status === 'accepted').map(row => row.followed_id));
        setPendingFollowIds((followsResult.data || []).filter(row => row.status === 'pending').map(row => row.followed_id));
      }
      setLoadingProfiles(false);
    };
    loadDiscoverProfiles();
    return () => { active = false; };
  }, [tab, debouncedProfileSearch, mediaRefreshKey]);

  useEffect(() => {
    const videoCategories: SearchCategory[] = ['Videos', 'Reels', 'Trending', 'Funny', 'Vlogs', 'Cinema'];
    if ((tab !== 'Search' && (tab !== 'Videos' || !LONG_VIDEOS_PUBLIC_ENABLED)) || !videoCategories.includes(searchCategory) || !supabase) return;
    let active = true;
    const loadSearchVideos = async () => {
      setLoadingVideos(true);
      setVideoUrls({});
      const categoryFilter = tab === 'Videos' ? 'videos' : (searchCategory === 'Reels' ? (debouncedProfileSearch ? 'all' : 'reels') : searchCategory.toLowerCase());
      const { data, error } = await supabase!
        .rpc('get_public_search_posts', { category_filter: categoryFilter, search_text: debouncedProfileSearch || null });
      if (!active) return;
      if (error) {
        Alert.alert('Search is not ready yet', 'Run supabase_search_discovery_setup.sql in Supabase SQL Editor, then try again.');
        setPublicVideos([]);
        setVideoUrls({});
        setLoadingVideos(false);
        return;
      }
      const rows = (data || []) as SearchVideo[];
      setPublicVideos(rows);
      if (rows.length) {
        const { data: likedRows, error: likedError } = await supabase!.from('post_likes')
          .select('post_id').in('post_id', rows.map(row => row.id));
        if (!active) return;
        if (likedError) {
          Alert.alert('Could not load likes', likedError.message);
          setLikedVideoIds([]);
        } else {
          setLikedVideoIds((likedRows || []).map(row => row.post_id));
        }
      } else {
        setLikedVideoIds([]);
      }
      const entries = await Promise.all(rows.map(async row => {
        const { data: signed, error: signedError } = await supabase!.storage.from('usay-media').createSignedUrl(row.media_path, 60 * 60);
        return signedError || !signed?.signedUrl ? null : [row.id, signed.signedUrl] as const;
      }));
      if (!active) return;
      setVideoUrls(Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null)));
      setLoadingVideos(false);
    };
    loadSearchVideos();
    return () => { active = false; };
  }, [tab, searchCategory, debouncedProfileSearch, mediaRefreshKey]);


  useEffect(() => {
    if (tab !== 'Home' || !supabase) return;
    let active = true;
    const loadPublicFeed = async () => {
      setLoadingFeed(true);
      const { data: authData, error: authError } = await supabase!.auth.getSession();
      if (authError || !authData.session?.user.id) {
        if (active) setLoadingFeed(false);
        return;
      }
      const { data: savedRows, error: savedError } = await supabase!.from('saved_posts').select('post_id').eq('user_id', authData.session.user.id);
      if (!active) return;
      if (savedError) {
        console.warn('Saved posts could not be loaded:', savedError.message);
        setSavedPostIds([]);
      } else {
        setSavedPostIds((savedRows || []).map((row: any) => row.post_id));
      }
      const { data: postRows, error } = await supabase!.from('posts')
        .select('id, post_type, caption, media_path, created_at, visibility, content_category, user_id')
        .eq('visibility', 'public').not('media_path', 'is', null)
        .order('created_at', { ascending: false }).limit(40);
      if (!active) return;
      if (error) {
        setFeedPosts([]);
        setLoadingFeed(false);
        Alert.alert('Feed could not load', error.message);
        return;
      }
      const rows = postRows || [];
      const authorIds = [...new Set(rows.map((row: any) => row.user_id))];
      const [profileResult, avatarResult] = await Promise.all([
        authorIds.length ? supabase!.from('profiles').select('id, username, display_name, bio, profession_category, is_private, account_type, business_name, business_category').in('id', authorIds) : Promise.resolve({ data: [], error: null }),
        authorIds.length ? supabase!.from('profile_media').select('user_id, storage_path, media_type, original_name').in('user_id', authorIds).eq('kind', 'avatar') : Promise.resolve({ data: [], error: null }),
      ]);
      if (!active) return;
      const authors = new Map<string, PublicProfile>((profileResult.data || []).filter((p: any) => !p.is_private).map((p: any) => [p.id, p as PublicProfile] as const));
      const visibleRows = rows.filter((row: any) => authors.has(row.user_id));
      const avatarEntries = await Promise.all((avatarResult.data || []).map(async (row: any) => {
        const { data } = await supabase!.storage.from('usay-media').createSignedUrl(row.storage_path, 3600);
        return data?.signedUrl ? [row.user_id, { uri: data.signedUrl, type: row.media_type, name: row.original_name || undefined, storagePath: row.storage_path } as Media] as const : null;
      }));
      const avatarMap = new Map(avatarEntries.filter((entry): entry is NonNullable<typeof entry> => entry !== null));
      const hydrated = await Promise.all(visibleRows.map(async (row: any) => {
        const author = authors.get(row.user_id);
        if (!author) return null;
        const preview = await resolveProfileMediaPreview({
          media_type: row.post_type === 'video' ? 'video' : 'image',
          original_name: null,
          storage_path: row.media_path,
        }, storagePath => supabase!.storage.from('usay-media').createSignedUrl(storagePath, 3600));
        if (preview.media.unavailable) {
          console.warn('Public feed media preview could not be created:', row.media_path, preview.errorMessage || 'Missing signed URL');
        }
        return { ...row, author, authorAvatar: avatarMap.get(row.user_id) || null,
          media: preview.media as Media,
          like_count: 0, viewer_liked: false, comment_count: 0 } as FeedPost;
      }));
      if (!active) return;
      const valid = hydrated.filter((post): post is FeedPost => post !== null);
      if (valid.some(post => post.media.unavailable)) {
        Alert.alert('Some feed media unavailable', 'Some public post previews could not be opened. The posts remain in your feed; try refreshing later.');
      }
      if (valid.length) {
        const [engagement, commentCounts, reactionsResult] = await Promise.all([
          supabase!.rpc('get_profile_post_engagement', { target_post_ids: valid.map(post => post.id) }),
          fetchPostCommentCounts(valid.map(post => post.id)),
          supabase!.from('post_reactions').select('post_id,user_id,emoji').in('post_id', valid.map(post => post.id)),
        ]);
        if (!active) return;
        const byId = new Map<string, any>((engagement.data || []).map((item: any) => [item.post_id, item]));
        const reactionMap: Record<string, PostReactionSummary> = {};
        valid.forEach(post => { reactionMap[post.id] = { counts: {}, mine: null }; });
        if (reactionsResult.error) console.warn('Post reactions could not be loaded:', reactionsResult.error.message);
        else (reactionsResult.data || []).forEach((reaction: any) => {
          const summary = reactionMap[reaction.post_id];
          if (!summary) return;
          summary.counts[reaction.emoji] = (summary.counts[reaction.emoji] || 0) + 1;
          if (reaction.user_id === authData.session!.user.id) summary.mine = reaction.emoji;
        });
        setPostReactionSummaries(reactionMap);
        setFeedPosts(valid.map(post => {
          const item = byId.get(post.id);
          return { ...post, like_count: Number(item?.like_count || 0), viewer_liked: !!item?.viewer_liked, comment_count: commentCounts[post.id] || 0 };
        }));
      } else setFeedPosts([]);
      setLoadingFeed(false);
    };
    void loadPublicFeed();
    return () => { active = false; };
  }, [tab, postsRefreshKey, mediaRefreshKey]);

  useEffect(() => {
    if (tab !== 'Live' || !supabase) return;
    let active = true;
    const loadLiveCreators = async () => {
      setLoadingLiveCreators(true);
      const { data, error } = await supabase!.rpc('get_live_creators', { country_filter: null });
      if (!active) return;
      if (error) {
        setLiveCreators([]);
        setLiveMediaUrls({});
        setLoadingLiveCreators(false);
        Alert.alert('Live discovery is not ready yet', 'Run supabase_live_discovery_setup.sql in Supabase SQL Editor. Live broadcasts will appear after the streaming service starts sending verified live sessions.');
        return;
      }
      const rows = (data || []) as LiveCreator[];
      setLiveCreators(rows);
      const mediaEntries = await Promise.all(rows.map(async row => {
        const path = row.thumbnail_path || row.avatar_path;
        if (!path) return null;
        const { data: signed, error: signedError } = await supabase!.storage.from('usay-media').createSignedUrl(path, 60 * 60);
        return signedError || !signed?.signedUrl ? null : [row.session_id, signed.signedUrl] as const;
      }));
      if (!active) return;
      setLiveMediaUrls(Object.fromEntries(mediaEntries.filter((entry): entry is NonNullable<typeof entry> => entry !== null)));
      setLoadingLiveCreators(false);
    };
    void loadLiveCreators();
    const channel = supabase.channel('meei-live-discovery')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_sessions' }, () => { void loadLiveCreators(); })
      .subscribe();
    return () => {
      active = false;
      void supabase?.removeChannel(channel);
    };
  }, [tab, mediaRefreshKey]);

  useEffect(() => {
    if (!selectedProfile || !supabase) return;
    let active = true;
    const loadOtherProfile = async () => {
      const isPrivateLocked = !!selectedProfile.is_private && !followedUserIds.includes(selectedProfile.id);
      if (isPrivateLocked) {
        setOtherProfileMedia({ avatar: null, covers: [], posts: [] });
        setOtherPublishedPosts([]);
        setOtherFollowingCount(0);
        setOtherFollowerCount(0);
        setOtherLikesCount(0);
        setLoadingOtherProfile(false);
        return;
      }
      setLoadingOtherProfile(true);
      const [mediaResult, postsResult, countsResult, likesResult] = await Promise.all([
        supabase!.from('profile_media').select('id, kind, position, storage_path, media_type, original_name').eq('user_id', selectedProfile.id).order('position', { ascending: true }),
        supabase!.from('posts').select('id, post_type, caption, media_path, created_at, visibility, content_category').eq('user_id', selectedProfile.id).order('created_at', { ascending: false }).limit(50),
        supabase!.rpc('get_profile_follow_counts', { target_user_id: selectedProfile.id }).maybeSingle(),
        supabase!.rpc('get_profile_likes_count', { target_user_id: selectedProfile.id }),
      ]);
      if (!active) return;
      if (mediaResult.error) Alert.alert('Could not load profile media', mediaResult.error.message);
      const rows = (mediaResult.data || []) as CloudMediaRow[];
      const hydrated = await Promise.all(rows.map(async row => {
        const { media, errorMessage } = await resolveProfileMediaPreview(row, storagePath =>
          supabase!.storage.from('usay-media').createSignedUrl(storagePath, 60 * 60));
        if (media.unavailable) {
          console.warn('Other profile media preview could not be created:', row.storage_path, errorMessage || 'Missing signed URL');
        }
        return { kind: row.kind, position: row.position, media: media as Media };
      }));
      if (!active) return;
      if (hydrated.some(item => item.media.unavailable)) {
        Alert.alert('Some profile media unavailable', 'Some saved photos or videos could not be previewed. Their gallery positions are preserved; try refreshing later.');
      }
      const valid = hydrated;
      setOtherProfileMedia({
        avatar: valid.find(item => item.kind === 'avatar')?.media || null,
        covers: valid.filter(item => item.kind === 'cover').sort((a,b) => a.position-b.position).map(item => item.media).slice(0,3),
        posts: valid.filter(item => item.kind === 'post').sort((a,b) => a.position-b.position).map(item => item.media).slice(0,3),
      });
      if (postsResult.error) Alert.alert('Could not load published posts', postsResult.error.message);
      const publishedRows = (postsResult.data || []).filter((row: any) => !!row.media_path);
      const publishedHydrated = await Promise.all(publishedRows.map(async (row: any) => {
        const preview = await resolveProfileMediaPreview({
          media_type: row.post_type === 'video' ? 'video' : 'image',
          original_name: null,
          storage_path: row.media_path,
        }, storagePath => supabase!.storage.from('usay-media').createSignedUrl(storagePath, 60 * 60));
        if (preview.media.unavailable) {
          console.warn('Other published post media URL could not be created:', row.media_path, preview.errorMessage || 'Missing signed URL');
        }
        return { ...row, media: preview.media as Media } as PublishedPost;
      }));
      if (!active) return;
      const validPublishedPosts = publishedHydrated;
      if (validPublishedPosts.some(post => post.media.unavailable)) {
        Alert.alert('Some posts unavailable', 'Some published post previews could not be opened. The posts remain listed; try refreshing later.');
      }
      if (validPublishedPosts.length) {
        const engagementResult = await supabase!.rpc('get_profile_post_engagement', { target_post_ids: validPublishedPosts.map(post => post.id) });
        if (!active) return;
        const commentCounts = await fetchPostCommentCounts(validPublishedPosts.map(post => post.id));
        if (!active) return;
        if (engagementResult.error) {
          Alert.alert('Could not load post likes', engagementResult.error.message);
          setOtherPublishedPosts(validPublishedPosts.map(post => ({ ...post, like_count: 0, viewer_liked: false, comment_count: commentCounts[post.id] || 0 })));
        } else {
          const engagementById = new Map<string, any>((engagementResult.data || []).map((item: any) => [item.post_id, item] as [string, any]));
          setOtherPublishedPosts(validPublishedPosts.map(post => {
            const engagement = engagementById.get(post.id) as any;
            return { ...post, like_count: Number(engagement?.like_count || 0), viewer_liked: !!engagement?.viewer_liked, comment_count: commentCounts[post.id] || 0 };
          }));
        }
      } else {
        setOtherPublishedPosts([]);
      }
      if (countsResult.error) Alert.alert('Could not load profile counts', countsResult.error.message);
      const followCounts = countsResult.data as { following_count?: number; follower_count?: number } | null;
      setOtherFollowingCount(Number(followCounts?.following_count || 0));
      setOtherFollowerCount(Number(followCounts?.follower_count || 0));
      if (likesResult.error) Alert.alert('Could not load profile likes', likesResult.error.message);
      setOtherLikesCount(Number(likesResult.data || 0));
      setLoadingOtherProfile(false);
    };
    loadOtherProfile();
    return () => { active = false; };
  }, [selectedProfile?.id, followedUserIds, mediaRefreshKey]);

  const toggleFollow = async (profile: PublicProfile) => {
    if (!supabase || followBusyIds.includes(profile.id)) return;
    const { data: authData, error: authError } = await supabase.auth.getSession();
    const userId = authData.session?.user.id;
    if (authError || !userId) { Alert.alert('Sign in required', 'Please sign in again to follow people.'); return; }
    setFollowBusyIds(old => [...old, profile.id]);
    const isFollowing = followedUserIds.includes(profile.id);
    if (isFollowing || pendingFollowIds.includes(profile.id)) {
      const { error } = await supabase.from('follows').delete().eq('follower_id', userId).eq('followed_id', profile.id);
      setFollowBusyIds(old => old.filter(id => id !== profile.id));
      if (error) { Alert.alert('Follow update failed', error.message); return; }
      if (isFollowing) {
        setFollowedUserIds(old => old.filter(id => id !== profile.id));
        setFollowingCount(count => Math.max(0, count - 1));
        if (selectedProfile?.id === profile.id) setOtherFollowerCount(count => Math.max(0, count - 1));
      } else setPendingFollowIds(old => old.filter(id => id !== profile.id));
      return;
    }
    const { data, error } = await supabase.rpc('request_profile_follow', { target_user_id: profile.id });
    setFollowBusyIds(old => old.filter(id => id !== profile.id));
    if (error) { Alert.alert('Follow failed', error.message); return; }
    if (data === 'accepted') {
      setFollowedUserIds(old => old.includes(profile.id) ? old : [...old, profile.id]);
      setFollowingCount(count => count + 1);
      if (selectedProfile?.id === profile.id) setOtherFollowerCount(count => count + 1);
    } else setPendingFollowIds(old => old.includes(profile.id) ? old : [...old, profile.id]);
  };

  const blockProfile = async (profile: PublicProfile) => {
    if (!supabase) return;
    Alert.alert(
      'Block account?',
      'You and @' + profile.username.replace(/[@#]/g, '') + ' will no longer see each other’s profiles, posts, or Live discovery, and messaging/following will be disabled.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: async () => {
          const { error } = await supabase!.rpc('block_user', { target_user_id: profile.id });
          if (error) { Alert.alert('Could not block account', error.message); return; }
          setPublicProfiles(old => old.filter(item => item.id !== profile.id));
          setLiveCreators(old => old.filter(item => item.user_id !== profile.id));
          setFollowedUserIds(old => old.filter(id => id !== profile.id));
          setPendingFollowIds(old => old.filter(id => id !== profile.id));
          setChatThreads(old => old.filter(thread => thread.otherUser.id !== profile.id));
          setFeedPosts(old => old.filter(item => item.author.id !== profile.id));
          if (activeChat && activeChat.otherUser.id === profile.id) { setActiveChat(null); setChatMessages([]); }
          setSelectedProfile(null);
          Alert.alert('Account blocked', 'This account has been blocked.');
        } },
      ],
    );
  };
  const loadBlockedAccounts = async () => {
    if (!supabase) return;
    setBlockedAccountsLoading(true);
    const { data, error } = await supabase.rpc('get_my_blocked_users');
    setBlockedAccountsLoading(false);
    if (error) { Alert.alert('Blocked accounts could not load', error.message); return; }
    setBlockedAccounts((data || []) as BlockedAccount[]);
  };

  const unblockAccount = async (account: BlockedAccount) => {
    if (!supabase || unblockingUserId) return;
    setUnblockingUserId(account.user_id);
    const { data, error } = await supabase.rpc('unblock_user', { target_user_id: account.user_id });
    setUnblockingUserId(null);
    if (error) { Alert.alert('Could not unblock account', error.message); return; }
    if (data) setBlockedAccounts(old => old.filter(item => item.user_id !== account.user_id));
  };

  const loadFollowRequests = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('get_my_follow_requests');
    if (error) { Alert.alert('Could not load follow requests', error.message); return; }
    setFollowRequests((data || []) as FollowRequest[]);
  };

  const respondToFollowRequest = async (followerId: string, approve: boolean) => {
    if (!supabase || followRequestBusyIds.includes(followerId)) return;
    setFollowRequestBusyIds(old => [...old, followerId]);
    const { data, error } = await supabase.rpc('respond_to_follow_request', { target_follower_id: followerId, approve });
    setFollowRequestBusyIds(old => old.filter(id => id !== followerId));
    if (error || !data) { Alert.alert('Request update failed', error?.message || 'This request is no longer available.'); return; }
    setFollowRequests(old => old.filter(item => item.follower_id !== followerId));
    if (approve) setFollowerCount(count => count + 1);
  };

  const chooseCreateMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow MEEi to access your phone gallery.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: 0.85,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const type = asset.type === 'video' ? 'video' : 'image';
    if (typeof asset.fileSize === 'number' && asset.fileSize > 50 * 1024 * 1024) {
      Alert.alert('File size limit', 'Please choose a photo or video that is 50 MB or smaller.');
      return;
    }
    setCreateMedia({ uri: asset.uri, type, name: asset.fileName || undefined, size: asset.fileSize || undefined, mimeType: asset.mimeType || (type === 'video' ? 'video/mp4' : 'image/jpeg') });
  };

  const publishPost = async () => {
    const client = supabase;
    if (!client || !createMedia || publishingPost) return;
    const caption = createCaption.trim();
    if (caption.length > 2000) {
      Alert.alert('Caption too long', 'Captions can contain up to 2,000 characters.');
      return;
    }
    const { data: authData, error: authError } = await client.auth.getSession();
    const userId = authData.session?.user.id;
    if (authError || !userId) {
      Alert.alert('Sign in required', 'Please sign in again before publishing.');
      return;
    }
    setPublishingPost(true);
    let storagePath = '';
    try {
      const mimeType = createMedia.mimeType || (createMedia.type === 'video' ? 'video/mp4' : 'image/jpeg');
      const extension = createMedia.name?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ||
        (createMedia.type === 'video' ? 'mp4' : 'jpg');
      const response = await fetch(createMedia.uri);
      if (!response.ok) throw new Error('Could not read the selected media from this device.');
      const fileData = await response.arrayBuffer();
      if (fileData.byteLength > 50 * 1024 * 1024) throw new Error('Media must be 50 MB or smaller.');
      storagePath = `${userId}/posts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
      const { error: uploadError } = await client.storage.from('usay-media').upload(storagePath, fileData, {
        contentType: mimeType,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { error: postError } = await client.from('posts').insert({
        user_id: userId,
        post_type: createMedia.type === 'video' ? 'video' : 'photo',
        caption: caption || null,
        media_path: storagePath,
        visibility: createVisibility,
        content_category: createMedia.type === 'video' ? createCategory : 'videos',
      });
      if (postError) throw postError;
      setCreateMedia(null);
      setCreateCaption('');
      setCreateCategory('videos');
      setCreateVisibility('public');
      setPostsRefreshKey(value => value + 1);
      Alert.alert('Published', 'Your post has been published to MEEi.');
    } catch (error: any) {
      if (storagePath) await client.storage.from('usay-media').remove([storagePath]);
      Alert.alert('Could not publish', error?.message || 'Please try again.');
    } finally {
      setPublishingPost(false);
    }
  };

  const toggleVideoLike = async (video: SearchVideo) => {
    const client = supabase;
    if (!client || likeBusyIds.includes(video.id)) return;
    const { data: authData, error: authError } = await client.auth.getSession();
    const userId = authData.session?.user.id;
    if (authError || !userId) {
      Alert.alert('Sign in required', 'Please sign in again to like videos.');
      return;
    }
    const isLiked = likedVideoIds.includes(video.id);
    setLikeBusyIds(old => [...old, video.id]);
    const result = isLiked
      ? await client.from('post_likes').delete().eq('post_id', video.id).eq('user_id', userId)
      : await client.from('post_likes').insert({ post_id: video.id, user_id: userId });
    setLikeBusyIds(old => old.filter(id => id !== video.id));
    if (result.error) {
      Alert.alert('Could not update like', result.error.message);
      return;
    }
    setLikedVideoIds(old => isLiked ? old.filter(id => id !== video.id) : [...old, video.id]);
    setPublicVideos(old => old.map(item => item.id === video.id
      ? { ...item, like_count: Math.max(0, item.like_count + (isLiked ? -1 : 1)) }
      : item));
  };

  const fetchPostCommentCounts = async (postIds: string[]) => {
    const client = supabase;
    if (!client || !postIds.length) return {} as Record<string, number>;
    const { data, error } = await client.from('post_comments').select('post_id').in('post_id', postIds);
    if (error) { console.warn('Could not load post comment counts:', error.message); return {} as Record<string, number>; }
    return (data || []).reduce((counts: Record<string, number>, row: any) => {
      counts[row.post_id] = (counts[row.post_id] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
  };

  const loadPostComments = async (postId: string) => {
    const client = supabase;
    if (!client) return;
    setCommentsLoading(true);
    const { data, error } = await client.from('post_comments')
      .select('id, post_id, user_id, body, created_at')
      .eq('post_id', postId).order('created_at', { ascending: true }).limit(100);
    if (error) {
      setCommentsLoading(false);
      Alert.alert('Could not load comments', error.message);
      return;
    }
    const rows = data || [];
    const userIds = [...new Set(rows.map((row: any) => row.user_id))];
    const profilesResult = userIds.length
      ? await client.from('profiles').select('id, username, display_name').in('id', userIds)
      : { data: [], error: null };
    const profilesById = new Map<string, any>((profilesResult.data || []).map((profile: any) => [profile.id, profile] as [string, any]));
    setPostComments(rows.map((row: any) => {
      const profile = profilesById.get(row.user_id) as any;
      return { ...row, username: profile?.username || 'user', display_name: profile?.display_name || 'User' } as PostComment;
    }));
    setCommentsLoading(false);
  };

  const openPostComments = (post: PublishedPost) => {
    setCommentPost(post);
    setCommentDraft('');
    setPostComments([]);
    void loadPostComments(post.id);
  };

  const sendPostComment = async () => {
    const client = supabase;
    const post = commentPost;
    const body = commentDraft.trim();
    if (!client || !post || !body || commentSending) return;
    if (body.length > 2000) { Alert.alert('Comment too long', 'Comments can contain up to 2,000 characters.'); return; }
    const { data: authData, error: authError } = await client.auth.getSession();
    const userId = authData.session?.user.id;
    if (authError || !userId) { Alert.alert('Sign in required', 'Please sign in again to comment.'); return; }
    setCommentSending(true);
    const { error } = await client.from('post_comments').insert({ post_id: post.id, user_id: userId, body });
    setCommentSending(false);
    if (error) { Alert.alert('Could not add comment', error.message); return; }
    setCommentDraft('');
    setFeedPosts(old => old.map(item => item.id === post.id ? { ...item, comment_count: item.comment_count + 1 } : item));
    setOwnPublishedPosts(old => old.map(item => item.id === post.id ? { ...item, comment_count: item.comment_count + 1 } : item));
    setOtherPublishedPosts(old => old.map(item => item.id === post.id ? { ...item, comment_count: item.comment_count + 1 } : item));
    void loadPostComments(post.id);
  };

  const togglePostReaction = async (postId: string, emoji: string) => {
    const client = supabase;
    if (!client || !POST_REACTION_EMOJIS.includes(emoji)) return;
    const { data: authData, error: authError } = await client.auth.getSession();
    const userId = authData.session?.user.id;
    if (authError || !userId) { Alert.alert('Sign in required', 'Please sign in again to react to posts.'); return; }
    const current = postReactionSummaries[postId] || { counts: {}, mine: null };
    const previous = current.mine;
    const result = previous === emoji
      ? await client.from('post_reactions').delete().eq('post_id', postId).eq('user_id', userId)
      : await client.from('post_reactions').upsert({ post_id: postId, user_id: userId, emoji }, { onConflict: 'post_id,user_id' });
    if (result.error) { Alert.alert('Reaction not saved', result.error.message); return; }
    setPostReactionSummaries(old => {
      const base = old[postId] || { counts: {}, mine: null };
      const counts = { ...base.counts };
      if (previous) counts[previous] = Math.max(0, (counts[previous] || 0) - 1);
      const nextMine = previous === emoji ? null : emoji;
      if (nextMine) counts[nextMine] = (counts[nextMine] || 0) + 1;
      Object.keys(counts).forEach(key => { if (!counts[key]) delete counts[key]; });
      return { ...old, [postId]: { counts, mine: nextMine } };
    });
    setReactionPostId(null);
  };

  const toggleSavedPost = async (postId: string) => {
    const client = supabase;
    if (!client || savedPostBusyIds.includes(postId)) return;
    const { data: authData, error: authError } = await client.auth.getSession();
    const userId = authData.session?.user.id;
    if (authError || !userId) {
      Alert.alert('Sign in required', 'Please sign in again to save posts.');
      return;
    }
    const isSaved = savedPostIds.includes(postId);
    setSavedPostBusyIds(old => [...old, postId]);
    const result = isSaved
      ? await client.from('saved_posts').delete().eq('post_id', postId).eq('user_id', userId)
      : await client.from('saved_posts').insert({ post_id: postId, user_id: userId });
    setSavedPostBusyIds(old => old.filter(id => id !== postId));
    if (result.error) {
      Alert.alert('Could not update saved posts', result.error.message);
      return;
    }
    setSavedPostIds(old => isSaved ? old.filter(id => id !== postId) : [...old, postId]);
  };

  const submitPostReport = async (post: FeedPost, reason: 'spam' | 'harassment' | 'hate' | 'violence' | 'nudity' | 'scam' | 'copyright' | 'other') => {
    const client = supabase;
    if (!client || reportBusyIds.includes(post.id)) return;
    const { data: authData, error: authError } = await client.auth.getSession();
    const userId = authData.session?.user.id;
    if (authError || !userId) {
      Alert.alert('Sign in required', 'Please sign in again to report a post.');
      return;
    }
    if (post.author.id === userId) {
      Alert.alert('Cannot report your own post', 'You can report content posted by another account.');
      return;
    }
    setReportBusyIds(old => [...old, post.id]);
    const { error } = await client.from('post_reports').insert({
      reporter_id: userId,
      post_id: post.id,
      reason,
    });
    setReportBusyIds(old => old.filter(id => id !== post.id));
    if (error?.code === '23505') {
      Alert.alert('Already reported', 'You have already reported this post. The report remains available for moderation review.');
      return;
    }
    if (error) {
      Alert.alert('Report not submitted', error.message);
      return;
    }
    Alert.alert('Report submitted', 'Thank you. Your report has been recorded for moderation review.');
  };

  const togglePublishedPostLike = async (post: PublishedPost, isOtherProfile: boolean) => {
    const client = supabase;
    if (!client || likeBusyIds.includes(post.id)) return;
    const { data: authData, error: authError } = await client.auth.getSession();
    const userId = authData.session?.user.id;
    if (authError || !userId) {
      Alert.alert('Sign in required', 'Please sign in again to like posts.');
      return;
    }
    const isLiked = post.viewer_liked;
    setLikeBusyIds(old => [...old, post.id]);
    const result = isLiked
      ? await client.from('post_likes').delete().eq('post_id', post.id).eq('user_id', userId)
      : await client.from('post_likes').insert({ post_id: post.id, user_id: userId });
    setLikeBusyIds(old => old.filter(id => id !== post.id));
    if (result.error) {
      Alert.alert('Could not update like', result.error.message);
      return;
    }
    const delta = isLiked ? -1 : 1;
    const updatePost = (item: PublishedPost) => item.id === post.id
      ? { ...item, viewer_liked: !isLiked, like_count: Math.max(0, item.like_count + delta) }
      : item;
    setFeedPosts(old => old.map(item => item.id === post.id ? { ...item, viewer_liked: !isLiked, like_count: Math.max(0, item.like_count + delta) } : item));
    setOwnPublishedPosts(old => old.map(updatePost));
    setOtherPublishedPosts(old => old.map(updatePost));
    if (isOtherProfile) setOtherLikesCount(count => Math.max(0, count + delta));
    else setLikesCount(count => Math.max(0, count + delta));
  };

  const runContactSync = async () => {
    if (!supabase || contactSyncing) return;
    setContactSyncing(true);
    setContactSyncDone(false);
    setContactMatches([]);
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Contacts permission needed', 'Allow MEEi to read contact phone numbers only when you choose to find people you know.');
        return;
      }
      const response = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
        pageSize: 2000,
      });
      const numbers = Array.from(new Set((response.data || [])
        .flatMap((contact: any) => (contact.phoneNumbers || []).map((phone: any) => phone.number))
        .filter((number: unknown): number is string => typeof number === 'string' && number.trim().length > 0)))
        .slice(0, 500);
      if (!numbers.length) {
        setContactMatches([]);
        setContactSyncDone(true);
        Alert.alert('No phone numbers found', 'Your address book does not contain any phone numbers to match.');
        return;
      }
      const defaultCountry = Localization.getLocales()[0]?.regionCode || undefined;
      const { data, error } = await supabase.functions.invoke('meei-contact-discovery', {
        body: { numbers, defaultCountry },
      });
      if (error) throw error;
      setContactMatches((data?.matches || []) as PublicProfile[]);
      setContactSyncDone(true);
      Alert.alert('Contact sync complete', (data?.matches?.length || 0) + ' MEEi account(s) found among your contacts.');
    } catch (error: any) {
      Alert.alert('Contact sync unavailable', error?.message || 'Please try again later.');
    } finally {
      setContactSyncing(false);
    }
  };

  const confirmContactSync = () => {
    Alert.alert(
      'Find people you know',
      'MEEi will read phone numbers from your contacts only after your permission. Numbers are securely matched against accounts that chose to be discoverable; raw contact numbers are not saved in MEEi.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => void runContactSync() },
      ],
    );
  };

  const toggleContactDiscoverability = () => {
    if (!supabase) return;
    const nextValue = !contactDiscoverable;
    Alert.alert(
      nextValue ? 'Let contacts find you?' : 'Turn off phone discovery?',
      nextValue
        ? 'People who have your verified phone number saved may find your MEEi profile. Your phone number will never be shown. You can turn this off anytime.'
        : 'Your account will no longer appear in phone-contact matching.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: nextValue ? 'Enable' : 'Turn off', onPress: async () => {
          const { data, error } = await supabase!.rpc('set_my_contact_discoverability', { p_enabled: nextValue });
          if (error) {
            Alert.alert('Could not update setting', error.message);
            return;
          }
          setContactDiscoverable(Boolean(data));
          if (!nextValue) Alert.alert('Phone discovery off', 'Your phone lookup entry has been deleted.');
        } },
      ],
    );
  };

  const loadInbox = async () => {
    if (!supabase) return;
    const { data: authData, error: authError } = await supabase.auth.getSession();
    const userId = authData.session?.user.id;
    if (authError || !userId) {
      Alert.alert('Sign in required', 'Please sign in again to view your messages.');
      return;
    }
    if (currentUserId !== userId) {
      setContactMatches([]);
      setContactSyncDone(false);
      setContactDiscoverable(false);
    }
    setCurrentUserId(userId);
    void supabase.rpc('get_my_contact_discoverability').then(({ data, error }) => {
      if (!error) setContactDiscoverable(Boolean(data));
    });
    setChatLoading(true);
    const { data: rows, error } = await supabase.from('conversations')
      .select('id, user_one_id, user_two_id, updated_at')
      .or('user_one_id.eq.' + userId + ',user_two_id.eq.' + userId)
      .order('updated_at', { ascending: false });
    if (error) {
      setChatLoading(false);
      Alert.alert('Inbox could not load', error.message);
      return;
    }
    const ids = Array.from(new Set((rows || []).map((row: any) => row.user_one_id === userId ? row.user_two_id : row.user_one_id)));
    let profiles: PublicProfile[] = [];
    if (ids.length) {
      const result = await supabase.from('profiles')
        .select('id, username, display_name, bio, profession_category, website_url, activity_status')
        .in('id', ids);
      if (result.error) {
        setChatLoading(false);
        Alert.alert('Inbox could not load', result.error.message);
        return;
      }
      profiles = (result.data || []) as PublicProfile[];
    }
    const byId = new Map(profiles.map(profile => [profile.id, profile]));
    const conversationIds = (rows || []).map((row: any) => row.id);
    const unreadResult = conversationIds.length ? await supabase.from('messages').select('conversation_id').in('conversation_id', conversationIds).neq('sender_id', userId).is('read_at', null) : { data: [], error: null };
    if (unreadResult.error) { setChatLoading(false); Alert.alert('Unread messages could not load', unreadResult.error.message); return; }
    const unreadCounts = new Map<string, number>();
    (unreadResult.data || []).forEach((message: any) => unreadCounts.set(message.conversation_id, (unreadCounts.get(message.conversation_id) || 0) + 1));
    const threads = (rows || []).map((row: any) => {
      const otherUserId = row.user_one_id === userId ? row.user_two_id : row.user_one_id;
      const otherUser = byId.get(otherUserId);
      return otherUser ? { ...row, unread_count: unreadCounts.get(row.id) || 0, otherUser } as ChatThread : null;
    }).filter((item: ChatThread | null): item is ChatThread => item !== null);
    setChatThreads(threads);
    setChatLoading(false);
  };

  const openChat = async (profile: PublicProfile) => {
    if (!supabase) {
      Alert.alert('Chat unavailable', 'Supabase is not connected.');
      return;
    }
    const { data: authData, error: authError } = await supabase.auth.getSession();
    const userId = authData.session?.user.id;
    if (authError || !userId) {
      Alert.alert('Sign in required', 'Please sign in again to message people.');
      return;
    }
    if (userId === profile.id) {
      Alert.alert('Your profile', 'You cannot start a chat with yourself.');
      return;
    }
    setCurrentUserId(userId);
    const pair = [userId, profile.id].sort();
    let result = await supabase.from('conversations').select('id, user_one_id, user_two_id, updated_at')
      .eq('user_one_id', pair[0]).eq('user_two_id', pair[1]).maybeSingle();
    if (result.error) {
      Alert.alert('Could not open chat', result.error.message);
      return;
    }
    let conversation = result.data;
    if (!conversation) {
      const created = await supabase.from('conversations')
        .insert({ user_one_id: pair[0], user_two_id: pair[1] })
        .select('id, user_one_id, user_two_id, updated_at').single();
      if (created.error) {
        const retry = await supabase.from('conversations').select('id, user_one_id, user_two_id, updated_at')
          .eq('user_one_id', pair[0]).eq('user_two_id', pair[1]).maybeSingle();
        if (retry.error || !retry.data) {
          Alert.alert('Could not start chat', created.error.message);
          return;
        }
        conversation = retry.data;
      } else conversation = created.data;
    }
    const thread = { ...conversation, otherUser: profile } as ChatThread;
    setActiveChat(thread);
    setChatLoading(true);
    setChatMessages([]);
    const messagesResult = await supabase.from('messages')
       .select('id, conversation_id, sender_id, body, created_at, read_at, message_type, audio_path, transcript')
      .eq('conversation_id', thread.id).order('created_at', { ascending: true }).limit(200);
    setChatLoading(false);
    if (messagesResult.error) {
      Alert.alert('Could not load messages', messagesResult.error.message);
    } else {
      const hydratedMessages = await Promise.all(((messagesResult.data || []) as ChatMessage[]).map(async message => {
        if (!message.audio_path) return message;
        const { data: signed } = await supabase!.storage.from('usay-chat-audio').createSignedUrl(message.audio_path, 3600);
        return { ...message, audio_url: signed?.signedUrl || null };
      }));
      setChatMessages(hydratedMessages);
      const { error: readError } = await supabase.rpc('mark_conversation_read', { target_conversation_id: thread.id });
      if (readError) Alert.alert('Read status could not update', readError.message);
      else {
        const readAt = new Date().toISOString();
        setChatMessages(old => old.map(message => message.sender_id !== userId && !message.read_at ? { ...message, read_at: readAt } : message));
      }
    }
    setSelectedProfile(null);
    setTab('Inbox');
    await loadInbox();
  };

  const sendChatMessage = async () => {
    const body = chatDraft.trim();
    if (!body || !activeChat || !supabase || chatSending) return;
    if (body.length > 4000) {
      Alert.alert('Message too long', 'Messages can contain up to 4,000 characters.');
      return;
    }
    setChatSending(true);
    const { data: authData } = await supabase.auth.getSession();
    const senderId = authData.session?.user.id;
    if (!senderId || senderId !== currentUserId) {
      setChatSending(false);
      Alert.alert('Sign in required', 'Please sign in again before sending a message.');
      return;
    }
    const { data, error } = await supabase.from('messages')
      .insert({ conversation_id: activeChat.id, sender_id: senderId, body })
      .select('id, conversation_id, sender_id, body, created_at, read_at').single();
    if (error) {
      setChatSending(false);
      Alert.alert('Message not sent', error.message);
      return;
    }
    setChatMessages(old => [...old, data as ChatMessage]);
    setChatDraft('');
    setChatSending(false);
    void loadInbox();
  };

  const translateMessage = async (message: ChatMessage) => {
    if (visibleTranslations.includes(message.id)) { setVisibleTranslations(old => old.filter(id => id !== message.id)); return; }
    if (translatedMessages[message.id]) { setVisibleTranslations(old => [...old, message.id]); return; }
    setTranslatingMessageIds(old => [...old, message.id]);
    try {
      const endpoint = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + translationLanguage + '&dt=t&q=' + encodeURIComponent(message.body);
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Translation service is unavailable.');
      const result = await response.json();
      const translated = Array.isArray(result?.[0]) ? result[0].map((part: any) => part?.[0] || '').join('') : '';
      if (!translated) throw new Error('No translation was returned.');
      setTranslatedMessages(old => ({ ...old, [message.id]: translated })); setVisibleTranslations(old => [...old, message.id]);
    } catch (error: any) { Alert.alert('Translation failed', error?.message || 'Please try again.'); }
    finally { setTranslatingMessageIds(old => old.filter(id => id !== message.id)); }
  };

  const startVoiceRecording = async () => {
    if (!activeChat || voiceRecording || voiceSending) return;
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) { Alert.alert('Microphone permission needed', 'Allow microphone and speech recognition to send voice messages.'); return; }
      setVoiceLocalUri(null); setVoiceTranscript(''); setVoiceStopPending(false); setVoiceRecording(true);
      ExpoSpeechRecognitionModule.start({ lang: voiceLanguage, interimResults: true, continuous: true, maxAlternatives: 1, recordingOptions: { persist: true, outputFileName: 'cuckoo-voice-' + Date.now() + '.wav' } });
    } catch (error: any) { setVoiceRecording(false); Alert.alert('Could not start recording', error?.message || 'Please try again.'); }
  };

  const sendVoiceMessage = async (uri: string, transcript: string) => {
    if (!supabase || !activeChat || !currentUserId) { setVoiceStopPending(false); return; }
    setVoiceSending(true);
    try {
      const fileResponse = await fetch(uri); if (!fileResponse.ok) throw new Error('Recorded audio file could not be read.');
      const audioBytes = await fileResponse.arrayBuffer();
      const audioPath = currentUserId + '/' + activeChat.id + '/' + Date.now() + '.wav';
      const uploaded = await supabase.storage.from('usay-chat-audio').upload(audioPath, audioBytes, { contentType: 'audio/wav', upsert: false });
      if (uploaded.error) throw uploaded.error;
      const { data, error } = await supabase.from('messages').insert({ conversation_id: activeChat.id, sender_id: currentUserId, body: transcript.trim() || '🎤 Voice message', message_type: 'voice', audio_path: audioPath, transcript: transcript.trim() || null }).select('id, conversation_id, sender_id, body, created_at, read_at, message_type, audio_path, transcript').single();
      if (error) throw error;
      const { data: signed } = await supabase.storage.from('usay-chat-audio').createSignedUrl(audioPath, 3600);
      setChatMessages(old => [...old, { ...data, audio_url: signed?.signedUrl || null } as ChatMessage]); void loadInbox();
    } catch (error: any) { Alert.alert('Voice message not sent', error?.message || 'Please try again.'); }
    finally { setVoiceSending(false); setVoiceStopPending(false); setVoiceLocalUri(null); }
  };
  const stopVoiceRecording = () => { if (!voiceRecording) return; setVoiceStopPending(true); ExpoSpeechRecognitionModule.stop(); };
  useEffect(() => { if (voiceStopPending && voiceLocalUri) void sendVoiceMessage(voiceLocalUri, voiceTranscript); }, [voiceStopPending, voiceLocalUri]);

  useEffect(() => {
    if (tab === 'Inbox') void loadInbox();
    if (tab === 'Profile') void loadFollowRequests();
  }, [tab]);

  useEffect(() => {
    if (!supabase || tab !== 'Profile' || !currentUserId) return;
    const channel = supabase.channel('follow-requests-' + currentUserId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'follows' }, payload => {
        const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as { followed_id?: string } | undefined;
        if (row?.followed_id === currentUserId) void loadFollowRequests();
      })
      .subscribe();
    return () => { void supabase!.removeChannel(channel); };
  }, [tab, currentUserId]);

  useEffect(() => {
    if (!supabase || !currentUserId) return;
    const channel = supabase.channel('inbox-live-' + currentUserId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async payload => {
        const incoming = payload.new as ChatMessage;
        if (activeChat?.id === incoming.conversation_id) {
          if (incoming.audio_path) { const { data: signed } = await supabase!.storage.from('usay-chat-audio').createSignedUrl(incoming.audio_path, 3600); incoming.audio_url = signed?.signedUrl || null; }
          setChatMessages(old => old.some(message => message.id === incoming.id) ? old : [...old, incoming]);
          if (incoming.sender_id !== currentUserId) {
            void supabase!.rpc('mark_conversation_read', { target_conversation_id: incoming.conversation_id });
          }
        }
        void loadInbox();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
        const updated = payload.new as ChatMessage;
        if (activeChat?.id === updated.conversation_id) {
          setChatMessages(old => old.map(message => message.id === updated.id ? { ...message, read_at: updated.read_at } : message));
        }
      })
      .subscribe();
    return () => { void supabase!.removeChannel(channel); };
  }, [currentUserId, activeChat?.id, messageSoundEnabled]);

  const saveProfile = async () => {
    const client = supabase;
    if (!client || savingProfileLock.current) {
      if (!client) Alert.alert('Cloud not configured', 'Connect Supabase before saving profile changes.');
      return;
    }
    const cleanName = name.trim();
    const cleanUsername = username.trim().replace(/[@#]/g, '').toLowerCase();
    const cleanWebsite = website.trim();
    const cleanBusinessName = businessName.trim();
    const cleanBusinessCategory = businessCategory.trim();
    const validationError = validateProfile({
      name: cleanName,
      username: cleanUsername,
      bio,
      accountType,
      businessName: cleanBusinessName,
      businessCategory: cleanBusinessCategory,
      businessDescription,
      website: cleanWebsite,
    });
    if (validationError) {
      Alert.alert(validationError.title, validationError.message);
      return;
    }
    savingProfileLock.current = true;
    setSavingProfile(true);
    try {
      const { data: authData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      const userId = authData.session?.user.id;
      if (!userId) throw new Error('Please sign in again before saving your profile.');
      if (!isProfileSessionOwner(userId, loadedProfileUserId) || profileLoadStatus !== 'ready') {
        if (userId !== loadedProfileUserId) setProfileLoadAttempt(value => value + 1);
        throw new Error('Your signed-in account or profile changed. We are refreshing your profile; please review it before saving again.');
      }
      const updatePayload = buildProfileUpdate({
        name: cleanName,
        username: cleanUsername,
        bio,
        website: cleanWebsite,
        occupation,
        accountType,
        businessName: cleanBusinessName,
        businessCategory: cleanBusinessCategory,
        businessDescription,
        isPrivateAccount,
        countryCode: homeCountryCode,
        countryName: homeCountryName,
        activity,
      }, new Date().toISOString());
      const { data: updatedProfile, error } = await client.from('profiles')
        .update(updatePayload).eq('id', userId).select('id').maybeSingle();
      if (error) throw error;
      if (!updatedProfile) throw new Error('Your profile could not be found or updated. Please sign in again and retry.');
      setUsername(cleanUsername);
      setHomeCountrySearch('');
      setEditing(false);
      Alert.alert('Profile saved', 'Your profile details have been saved.');
    } catch (error: any) {
      Alert.alert('Profile not saved', error?.message || 'Please check your connection and try again.');
    } finally {
      savingProfileLock.current = false;
      setSavingProfile(false);
    }
  };

  const refreshOwnMediaGallery = async (
    client: NonNullable<typeof supabase>,
    userId: string,
    kind: 'avatar' | 'cover' | 'post',
    shouldApply: () => boolean = () => true
  ) => {
    const { data: rows, error } = await client.from('profile_media')
      .select('id, kind, position, storage_path, media_type, original_name')
      .eq('user_id', userId).eq('kind', kind).order('position', { ascending: true });
    if (error) throw error;
    const hydrated = await Promise.all(((rows || []) as CloudMediaRow[]).map(async row => {
      const { media, errorMessage: signedError } = await resolveProfileMediaPreview(row, storagePath =>
        client.storage.from('usay-media').createSignedUrl(storagePath, 60 * 60));
      if (media.unavailable) {
        console.warn('Profile media preview could not be refreshed:', row.storage_path, signedError || 'Missing signed URL');
      }
      return { position: row.position, media: media as Media };
    }));
    // Re-check the authenticated owner after the asynchronous media lookups.
    // A session switch must never apply one account's gallery to another account.
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session?.user.id !== userId || !isProfileSessionOwner(userId, loadedProfileUserId)) {
      throw new Error('The signed-in account or loaded profile changed while media was refreshing. Please reload your profile and try again.');
    }
    // A refresh may finish after the account or visible tab changes. Callers
    // can invalidate the result so stale signed URLs never overwrite new state.
    if (shouldApply()) {
      if (kind === 'avatar') setAvatar(hydrated[0]?.media || null);
      if (kind === 'cover') setCovers(hydrated.map(item => item.media).slice(0, 3));
      if (kind === 'post') setPosts(hydrated.map(item => item.media).slice(0, 3));
    }
    return (rows || []) as CloudMediaRow[];
  };

  useEffect(() => {
    if (!supabase || !currentUserId || tab !== 'Profile' || mediaRefreshKey === 0) return;
    let active = true;
    const userId = currentUserId;
    const client = supabase;
    const shouldApply = () => active && currentUserId === userId && tab === 'Profile';
    const refreshOwnGalleries = async () => {
      const results = await Promise.allSettled((['avatar', 'cover', 'post'] as const).map(kind =>
        refreshOwnMediaGallery(client, userId, kind, shouldApply)
      ));
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn('Profile media URL refresh failed:', ['avatar', 'cover', 'post'][index], result.reason);
        }
      });
    };
    void refreshOwnGalleries();
    return () => { active = false; };
  }, [currentUserId, tab, mediaRefreshKey]);

  useEffect(() => {
    if (!supabase || mediaRefreshKey === 0 || !viewer?.storagePath) return;
    let active = true;
    const client = supabase;
    const media = viewer;
    const refreshOpenViewer = async () => {
      const { media: refreshed, errorMessage } = await resolveProfileMediaPreview({
        storage_path: media.storagePath!,
        media_type: media.type,
        original_name: media.name || null,
      }, storagePath => client.storage.from('usay-media').createSignedUrl(storagePath, 60 * 60));
      if (!active || viewer !== media) return;
      if (refreshed.unavailable) {
        console.warn('Open media viewer URL could not be refreshed:', media.storagePath, errorMessage || 'Missing signed URL');
      }
      setViewer(refreshed as Media);
    };
    void refreshOpenViewer();
    return () => { active = false; };
  }, [mediaRefreshKey]);

  const chooseMedia = async (kind: 'avatar' | 'cover' | 'post', index?: number) => {
    if (kind === 'cover' && covers.length >= 3 && index === undefined) {
      Alert.alert('Cover gallery full', 'You can add up to 3 cover photos/videos.');
      return;
    }
    if (kind === 'post' && posts.length >= 3 && index === undefined) {
      Alert.alert('Posts gallery full', 'You can add up to 3 post media files.');
      return;
    }

    // Hold the gallery lock from before opening the picker until the upload is
    // fully saved/cleaned up, so removal/reordering cannot stale the target slot.
    const galleryLockKey = `${kind}:gallery`;
    if (mediaUploadLocks.current.has(galleryLockKey) ||
        Array.from(mediaUploadLocks.current).some(key => key.startsWith(`${kind}:`))) {
      Alert.alert('Gallery update in progress', 'Please wait for the current gallery update to finish.');
      return;
    }
    mediaUploadLocks.current.add(galleryLockKey);

    let uploadedStoragePath: string | null = null;
    let mediaMetadataSaved = false;
    try {
      let targetPosition = 0;
      let result: Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>>;
      try {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow MEEi to access your phone gallery.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: kind === 'avatar' ? ['images'] : ['images', 'videos'],
          allowsEditing: kind === 'avatar',
          aspect: kind === 'avatar' ? [1, 1] : undefined,
          quality: 0.85,
          videoMaxDuration: 60,
        });
      } catch (error: any) {
        Alert.alert('Could not open gallery', error?.message || 'Please check your gallery permission and try again.');
        return;
      }
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      const type = a.type === 'video' ? 'video' : 'image';
      if (typeof a.fileSize === 'number' && a.fileSize > 50 * 1024 * 1024) {
        Alert.alert('File size limit', 'Please choose a photo or video that is 50 MB or smaller.');
        return;
      }
      setUploadingMediaKinds(old => ({ ...old, [kind]: true }));
      const client = supabase;
      if (!client) {
        Alert.alert('Cloud not configured', 'Connect Supabase before uploading profile media.');
        return;
      }
      const { data: authData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      const userId = authData.session?.user.id;
      if (!userId) {
        Alert.alert('Sign in required', 'Please sign in before uploading profile media.');
        return;
      }
      if (!isProfileSessionOwner(userId, currentUserId) || profileLoadStatus !== 'ready') {
        if (userId !== currentUserId) setProfileLoadAttempt(value => value + 1);
        throw new Error('Your signed-in account or profile changed. Please wait for your profile to refresh before uploading media.');
      }
      const existingRows = kind === 'avatar' ? [] : await refreshOwnMediaGallery(client, userId, kind);
      if (kind === 'avatar') {
        targetPosition = 0;
      } else {
        const orderedPositions = existingRows.map(row => row.position);
        const visibleMedia = index === undefined ? undefined : (kind === 'cover' ? covers[index] : posts[index]);
        const visibleRow = visibleMedia?.storagePath
          ? existingRows.find(row => row.storage_path === visibleMedia.storagePath)
          : undefined;
        if (index !== undefined && !visibleRow) {
          throw new Error('This gallery item could not be matched to its saved record. Refresh your profile and try again.');
        }
        targetPosition = visibleRow?.position ?? [0, 1, 2].find(position => !orderedPositions.includes(position)) ?? -1;
        if (targetPosition < 0) {
          Alert.alert('Gallery full', 'Remove an existing item before adding another.');
          return;
        }
      }

      const mimeType = a.mimeType || (type === 'video' ? 'video/mp4' : 'image/jpeg');
      const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg').split(';')[0] || (type === 'video' ? 'mp4' : 'jpg');
      const fileResponse = await fetch(a.uri);
      if (!fileResponse.ok) throw new Error('Could not read the selected media from this device.');
      const fileData = await fileResponse.arrayBuffer();
      if (fileData.byteLength > 50 * 1024 * 1024) throw new Error('Photo or video must be 50 MB or smaller.');
      const storagePath = `${userId}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
      const { error: uploadError } = await client.storage.from('usay-media').upload(storagePath, fileData, {
        contentType: mimeType,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploadedStoragePath = storagePath;

      const { data: signed, error: signedError } = await client.storage.from('usay-media').createSignedUrl(storagePath, 60 * 60);
      if (signedError || !signed?.signedUrl) throw signedError || new Error('Could not create a media preview URL.');

      const { data: previous, error: previousError } = await client.from('profile_media')
        .select('storage_path').eq('user_id', userId).eq('kind', kind).eq('position', targetPosition).maybeSingle();
      if (previousError) throw previousError;

      const mediaRecord = {
        user_id: userId,
        kind,
        position: targetPosition,
        storage_path: storagePath,
        media_type: type as 'image' | 'video',
        original_name: a.fileName ?? null,
        updated_at: new Date().toISOString(),
      };
      if (previous?.storage_path) {
        // Compare-and-swap the exact row we inspected. If another device changed
        // this slot meanwhile, do not overwrite its newer media.
        const { data: replacedRow, error: replaceError } = await client.from('profile_media')
          .update(buildProfileMediaUpdate(mediaRecord)).eq('user_id', userId).eq('kind', kind)
          .eq('position', targetPosition).eq('storage_path', previous.storage_path)
          .select('id').maybeSingle();
        if (replaceError) throw replaceError;
        if (!replacedRow) throw new Error('This gallery slot changed on another device. Refresh your profile and try again.');
      } else {
        // Insert-only for an empty slot: a concurrent upload must hit the unique
        // slot constraint instead of silently replacing another device's upload.
        const { data: insertedRow, error: insertError } = await client.from('profile_media')
          .insert(mediaRecord).select('id').maybeSingle();
        if (insertError) throw insertError;
        if (!insertedRow) throw new Error('Your media could not be saved. Please refresh and try again.');
      }
      mediaMetadataSaved = true;

      if (previous?.storage_path) {
        const { error: cleanupError } = await client.storage.from('usay-media').remove([previous.storage_path]);
        if (cleanupError) console.warn('Previous profile media cleanup failed:', cleanupError.message);
      }
      await refreshOwnMediaGallery(client, userId, kind);
      Alert.alert('Uploaded', 'Your media is now saved to your MEEi account.');
    } catch (error: any) {
      if (mediaMetadataSaved) {
        Alert.alert('Media saved', 'Your media was saved, but the gallery could not refresh. Reopen your profile to see the latest version.');
      } else {
        Alert.alert('Upload failed', error?.message || 'Please try again.');
      }
    } finally {
      if (uploadedStoragePath && !mediaMetadataSaved) {
        try {
          const client = supabase;
          if (client) {
            const { error: cleanupError } = await client.storage.from('usay-media').remove([uploadedStoragePath]);
            if (cleanupError) console.warn('Failed profile upload left an orphaned storage file:', cleanupError.message);
          }
        } catch (cleanupError: any) {
          console.warn('Failed profile upload cleanup threw an error:', cleanupError?.message || cleanupError);
        }
      }
      mediaUploadLocks.current.delete(galleryLockKey);
      setUploadingMediaKinds(old => ({ ...old, [kind]: false }));
    }
  };

  const removeMedia = async (kind: 'cover' | 'post', index: number) => {
    const client = supabase;
    const media = kind === 'cover' ? covers[index] : posts[index];
    if (!client || !media) return;

    const galleryLockKey = `${kind}:gallery`;
    const hasGalleryMutation = Array.from(mediaUploadLocks.current).some(key => key.startsWith(`${kind}:`));
    if (hasGalleryMutation) {
      Alert.alert('Gallery update in progress', 'Please wait for the current media update to finish.');
      return;
    }
    mediaUploadLocks.current.add(galleryLockKey);
    try {
      const { data: authData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      const userId = authData.session?.user.id;
      if (!userId) {
        Alert.alert('Session expired', 'Please sign in again before removing media.');
        return;
      }
      if (!isProfileSessionOwner(userId, currentUserId) || profileLoadStatus !== 'ready') {
        if (userId !== currentUserId) setProfileLoadAttempt(value => value + 1);
        throw new Error('Your signed-in account or profile changed. Please wait for your profile to refresh before removing media.');
      }

      // Remove the owned metadata row first; storage cleanup must never run before this succeeds.
      if (!media.storagePath) throw new Error('This media item has no saved storage reference. Refresh your profile and try again.');
      const { data: deletedRow, error: deleteError } = await client.from('profile_media').delete()
        .eq('user_id', userId).eq('kind', kind).eq('storage_path', media.storagePath)
        .select('id').maybeSingle();
      if (deleteError) throw deleteError;
      if (!deletedRow) throw new Error('This media item was already changed. Refresh your profile and try again.');

      let storageCleanupFailed = false;
      if (media.storagePath) {
        const { error: storageError } = await client.storage.from('usay-media').remove([media.storagePath]);
        if (storageError) {
          storageCleanupFailed = true;
          console.warn('Removed profile media metadata but storage cleanup failed:', storageError.message);
        }
      }

      const currentItems = kind === 'cover' ? covers : posts;
      const next = currentItems.filter((_, i) => i !== index);
      if (kind === 'cover') setCovers(next);
      else setPosts(next);

      // Do not compact across an item whose preview failed: its database row
      // still occupies a slot even though the media cannot currently be opened.
      if (next.some(item => item.unavailable)) {
        const cleanupNote = storageCleanupFailed
          ? ' Its old storage file could not be cleaned up.'
          : '';
        Alert.alert(
          'Media removed',
          'The selected item was removed. Other saved items were left in their existing slots because one or more previews are unavailable.' + cleanupNote
        );
        return;
      }

      // Compact positions from left to right so each destination slot is already free.
      for (let position = 0; position < next.length; position++) {
        const item = next[position];
        if (!item.storagePath) continue;
        const { error: reorderError } = await client.from('profile_media')
          .update({ position, updated_at: new Date().toISOString() })
          .eq('user_id', userId).eq('kind', kind).eq('storage_path', item.storagePath);
        if (reorderError) {
          console.warn('Profile media position update failed:', reorderError.message);
          try {
            await refreshOwnMediaGallery(client, userId, kind);
          } catch (refreshError: any) {
            console.warn('Profile media gallery refresh failed:', refreshError?.message || refreshError);
            Alert.alert('Gallery needs refresh', 'The media was removed, but the latest gallery could not be loaded. Please reopen your profile before making another change.');
          }
          Alert.alert('Gallery update warning', 'The media was removed, but some positions could not be compacted. The gallery has been reloaded; please retry after checking it.');
          break;
        }
      }

      if (storageCleanupFailed) {
        Alert.alert('Media removed', 'The media was removed from your profile, but its old storage file could not be cleaned up.');
      }
    } catch (error: any) {
      Alert.alert('Could not remove media', error?.message || 'Please try again.');
    } finally {
      mediaUploadLocks.current.delete(galleryLockKey);
    }
  };

  const openWebsite = () => {
    const url = website.startsWith('http') ? website : `https://${website}`;
    import('react-native').then(({ Linking }) => Linking.openURL(url).catch(() => Alert.alert('Website', 'This website link could not be opened.')));
  };

  const MediaTile = ({ media, onPress, onRemove, label, uploading = false }: {
    media?: Media; onPress: () => void; onRemove?: () => void; label: string; uploading?: boolean;
  }) => (
    <Pressable disabled={uploading} onPress={media && !media.unavailable ? () => setViewer(media) : onPress} style={s.tile}>
      {media?.unavailable
        ? <View style={s.videoTile}><Ionicons name="alert-circle-outline" size={26} color={C.cyan} /><Text style={s.videoText}>PREVIEW UNAVAILABLE</Text></View>
        : media?.type === 'image'
          ? <Image source={{ uri: media.uri }} style={s.tileImage} />
          : media?.type === 'video'
            ? <View style={s.videoTile}><Ionicons name="play-circle" size={30} color={C.cyan} /><Text style={s.videoText}>VIDEO</Text></View>
            : <><Ionicons name="add-circle-outline" size={25} color={C.cyan} /><Text style={s.tileLabel}>{label}</Text></>}
      {media && onRemove && !uploading ? <Pressable onPress={onRemove} style={s.remove}><Ionicons name="close" size={14} color="#fff" /></Pressable> : null}
      {uploading && <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 12, backgroundColor: 'rgba(8,18,30,0.72)', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        <ActivityIndicator size="small" color="#FFFFFF" />
        <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>Uploading…</Text>
      </View>}
    </Pressable>
  );

  const PublishedPostTile = ({ post, onPress, onLike, onComments }: { post: PublishedPost; onPress: () => void; onLike: () => void; onComments: () => void }) => (
    <View style={s.publishedTile}>
      <Pressable disabled={!!post.media.unavailable} onPress={onPress}>
        {post.media.unavailable
          ? <View style={[s.publishedVideo, { backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="alert-circle-outline" size={28} color={C.muted}/>
              <Text style={[s.videoText, { color: C.muted }]}>PREVIEW UNAVAILABLE</Text>
            </View>
          : post.media.type === 'image'
            ? <Image source={{ uri: post.media.uri }} style={s.publishedImage} />
            : <View style={s.publishedVideo}><Ionicons name="play-circle" size={34} color="#FFFFFF"/><Text style={s.videoText}>VIDEO</Text></View>}
      </Pressable>
      {!!post.caption && <Text style={s.publishedCaption} numberOfLines={2}>{post.caption}</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={onLike} disabled={likeBusyIds.includes(post.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 }}>
          <Ionicons name={post.viewer_liked ? 'heart' : 'heart-outline'} size={17} color={post.viewer_liked ? '#E34B69' : C.muted}/>
          <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700' }}>{post.like_count.toLocaleString()}</Text>
        </Pressable>
        <Pressable onPress={onComments} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 }}>
          <Ionicons name="chatbubble-outline" size={16} color={C.muted}/>
          <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700' }}>{post.comment_count.toLocaleString()}</Text>
        </Pressable>
      </View>
    </View>
  );

  const Profile = () => (
    <ScrollView contentContainerStyle={s.profileScroll} showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScroll={(event) => {
      const y = event.nativeEvent.contentOffset.y;
      if (coverRevealed && y < lastProfileScrollY.current - 3) animateCoverReveal(false);
      lastProfileScrollY.current = y;
    }}>
      <View style={s.top}><Text style={s.pageTitle}>MEEi</Text></View>
      <Animated.View style={[s.identity, { paddingTop: coverRevealProgress.interpolate({ inputRange: [0, 1], outputRange: [92, 282] }) }]}>
        <Animated.View style={[s.coverBackdrop, { height: coverRevealProgress.interpolate({ inputRange: [0, 1], outputRange: [235, 450] }) }]}>
          {covers[0]?.type === 'image' && !covers[0]?.unavailable ? <Image source={{uri:covers[0].uri}} style={s.coverBackdropImage}/> :
            covers[0]?.type === 'video' && !covers[0]?.unavailable ? <ProfileCoverVideo uri={covers[0].uri} /> :
            <View style={s.coverBackdropEmpty}/>}
          <View style={s.coverBackdropShade}/>
          {isOwnProfile && <Pressable disabled={uploadingMediaKinds.cover} onPress={() => chooseMedia('cover')} style={s.coverEdit}>{uploadingMediaKinds.cover ? <ActivityIndicator size="small" color="#FFFFFF"/> : <Ionicons name="camera" size={15} color="#FFFFFF"/>}</Pressable>}
          {isOwnProfile && uploadingMediaKinds.cover && <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 18, alignItems: 'center' }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(8,18,30,0.76)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 }}><ActivityIndicator size="small" color="#FFFFFF"/><Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Uploading cover…</Text></View></View>}
          {!!covers.length && <Pressable onPress={() => setCoverExpanded(true)} style={s.coverViewTap}/>}
        </Animated.View>
        <Animated.View {...avatarPan.panHandlers}>
        <Pressable disabled={uploadingMediaKinds.avatar} onPress={() => isOwnProfile ? chooseMedia('avatar') : undefined} style={s.avatarWrap}>
          {avatar && !avatar.unavailable ? <Image source={{uri:avatar.uri}} style={s.avatar} /> : <View style={s.avatarFallback}><Ionicons name="person" size={38} color={C.cyan}/></View>}
          {isOwnProfile && <View style={s.camera}>{uploadingMediaKinds.avatar ? <ActivityIndicator size="small" color="#FFFFFF"/> : <Ionicons name="camera" size={13} color="#fff"/>}</View>}
          {isOwnProfile && uploadingMediaKinds.avatar && <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 60, backgroundColor: 'rgba(8,18,30,0.58)', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color="#FFFFFF"/><Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700', marginTop: 5 }}>Uploading</Text></View>}
        </Pressable>
        </Animated.View>
        <View style={s.nameLine}><Text style={s.name}>{name}</Text></View>
        <Text style={s.username}>{username.replace(/[@#]/g, '')}</Text>
        {accountType === 'business' && <View style={s.businessTag}><Ionicons name="briefcase-outline" size={13} color={C.cyan}/><Text style={s.businessTagText}>Professional Business Account</Text></View>}
        <Text style={s.bio}>{bio}</Text>
        {accountType === 'business' && !!businessName && <View style={s.businessInfo}><Text style={s.businessName}>{businessName}</Text>{!!businessCategory && <Text style={s.personBio}>{businessCategory}</Text>}{!!businessDescription && <Text style={s.infoText}>{businessDescription}</Text>}</View>}
        {!!website && <Pressable onPress={openWebsite} style={s.websiteLine}><Ionicons name="link" color={C.cyan} size={15}/><Text style={s.website}>{website}</Text></Pressable>}
         
      </Animated.View>
      <View style={s.profileBody}>
        {!!followRequests.length && <View style={s.section}>
          <View style={s.sectionHeading}><Text style={s.sectionTitle}>Follow Requests</Text><Text style={s.coverCount}>{followRequests.length}</Text></View>
          {followRequests.map(request => <View key={request.follower_id} style={s.personRow}>
            <View style={s.personDetails}><Text style={s.personName}>{request.display_name}</Text><Text style={s.personUsername}>{request.username.replace(/[@#]/g, '')}</Text></View>
            <Pressable disabled={followRequestBusyIds.includes(request.follower_id)} onPress={() => void respondToFollowRequest(request.follower_id, false)} style={[s.followButton, s.followingButton]}><Text style={s.followingButtonText}>Decline</Text></Pressable>
            <Pressable disabled={followRequestBusyIds.includes(request.follower_id)} onPress={() => void respondToFollowRequest(request.follower_id, true)} style={s.followButton}><Text style={s.followButtonText}>Accept</Text></Pressable>
          </View>)}
        </View>}
        <View style={s.stats}>
          <View style={s.stat}><Text style={s.statNum}>{followingCount.toLocaleString()}</Text><Text style={s.statLabel}>Following</Text></View>
          <View style={s.stat}><Text style={s.statNum}>{followerCount.toLocaleString()}</Text><Text style={s.statLabel}>Followers</Text></View>
          <View style={s.stat}><Text style={s.statNum}>{likesCount.toLocaleString()}</Text><Text style={s.statLabel}>Likes</Text></View>
        </View>
        <View style={s.actions}>
          {isOwnProfile ? <>
            <Pressable style={s.primary} onPress={() => setEditing(true)}><Ionicons name="create-outline" color="#fff" size={17}/><Text style={s.primaryText}>Edit Profile</Text></Pressable>
            <Pressable style={s.secondary} onPress={() => Alert.alert('Message notification sound', 'Choose whether new messages play your natural bird sound.', [
              { text: 'Sound On', onPress: () => { void setMessageNotificationSound(true); } },
              { text: 'Sound Off', onPress: () => { void setMessageNotificationSound(false); } },
              { text: 'Appearance', onPress: () => Alert.alert('Appearance', 'Choose how MEEi looks on this device.', [
                { text: 'System', onPress: () => setAppearanceMode('system') },
                { text: 'Light', onPress: () => setAppearanceMode('light') },
                { text: 'Dark', onPress: () => setAppearanceMode('dark') },
              ]) },
              { text: 'Blocked Accounts', onPress: () => { setBlockedAccountsVisible(true); void loadBlockedAccounts(); } },
              { text: 'Policies & Terms', onPress: () => setLegalVisible(true) },
              { text: 'Sign out', style: 'destructive', onPress: () => {
                if (supabase) supabase.auth.signOut().catch(error => Alert.alert('Sign out failed', error.message));
              }},
              { text: 'Cancel', style: 'cancel' },
            ])}><Ionicons name="settings-outline" color={C.text} size={17}/><Text style={s.secondaryText}>Settings · {themeMode === 'system' ? 'System' : themeMode === 'dark' ? 'Dark' : 'Light'}</Text></Pressable>
          </> : <>
            <Pressable style={s.primary} onPress={() => Alert.alert('Follow', 'Follow action will work after account and backend connection.')}><Ionicons name="person-add-outline" color="#fff" size={17}/><Text style={s.primaryText}>Follow</Text></Pressable>
            <Pressable style={s.secondary} onPress={() => Alert.alert('Message', 'Messaging will work after chat backend connection.')}><Ionicons name="chatbubble-ellipses-outline" color={C.text} size={17}/><Text style={s.secondaryText}>Message</Text></Pressable>
          </>}
        </View>
        <View style={s.section}>
          <View style={s.sectionHeading}><Text style={s.sectionTitle}>Posts</Text><Text style={s.coverCount}>{ownPublishedPosts.length}</Text></View>
          {ownPublishedPosts.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9 }}>
            {ownPublishedPosts.map(post => <PublishedPostTile key={post.id} post={post} onPress={() => setViewer(post.media)} onLike={() => void togglePublishedPostLike(post, false)} onComments={() => openPostComments(post)}/>)}
          </ScrollView> : <Text style={s.hint}>Your published photos and videos will appear here.</Text>}
        </View>
        {!!posts.length && <View style={s.section}>
          <View style={s.sectionHeading}><Text style={s.sectionTitle}>Featured media</Text><Text style={s.coverCount}>{posts.length}/3</Text></View>
          <View style={s.mediaRow}>{[0,1,2].map(i => <MediaTile key={i} label="Add media" media={posts[i]} onPress={() => chooseMedia('post', i)} onRemove={posts[i] ? () => removeMedia('post', i) : undefined} uploading={uploadingMediaKinds.post}/>)}</View>
        </View>}
        <View style={s.section}>
          <Text style={s.sectionTitle}>About</Text>
          {!!occupation && <View style={s.infoLine}><Ionicons name="briefcase-outline" color={C.cyan} size={18}/><Text style={s.infoText}>{occupation}</Text></View>}
          <View style={s.infoLine}><Ionicons name="time-outline" color={C.cyan} size={18}/><Text style={s.infoText}>{activity}</Text></View>
        </View>
        <Text style={s.footerNote}>Profile details and uploaded media are synced with your MEEi account.</Text>
      </View>
    </ScrollView>
  );

  const OtherProfileScreen = () => {
    if (!selectedProfile) return null;
    const following = followedUserIds.includes(selectedProfile.id);
    const pending = pendingFollowIds.includes(selectedProfile.id);
    const busy = followBusyIds.includes(selectedProfile.id);
    const openOtherWebsite = () => {
      const raw = selectedProfile.website_url || '';
      if (!raw) return;
      const url = raw.startsWith('http') ? raw : `https://${raw}`;
      import('react-native').then(({ Linking }) => Linking.openURL(url).catch(() => Alert.alert('Website', 'This website link could not be opened.')));
    };
    return <ScrollView contentContainerStyle={s.profileScroll} showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScroll={(event) => {
      const y = event.nativeEvent.contentOffset.y;
      if (coverRevealed && y < lastProfileScrollY.current - 3) animateCoverReveal(false);
      lastProfileScrollY.current = y;
    }}>
      <View style={[s.top, { justifyContent: 'space-between' }]}>
        <Pressable onPress={() => setSelectedProfile(null)} style={{ padding: 8 }}><Ionicons name="arrow-back" size={24} color={C.text}/></Pressable>
        <Text style={s.pageTitle}>MEEi</Text><View style={{ width: 40 }}/>
      </View>
      <View style={s.identity}>
<Animated.View style={[s.coverBackdrop, { height: coverRevealProgress.interpolate({ inputRange: [0, 1], outputRange: [190, 420] }) }]}>
          {otherProfileMedia.covers[0] && !otherProfileMedia.covers[0].unavailable && !!otherProfileMedia.covers[0].uri
            ? otherProfileMedia.covers[0].type === 'image'
              ? <Image source={{uri:otherProfileMedia.covers[0].uri}} style={s.coverBackdropImage}/>
              : <ProfileCoverVideo uri={otherProfileMedia.covers[0].uri} />
            : <View style={s.coverBackdropEmpty}/>}
          <View style={s.coverBackdropShade}/>
          {!!otherProfileMedia.covers.length && <Pressable onPress={() => setOtherCoverExpanded(true)} style={s.coverViewTap}/>}
        </Animated.View>
        <Animated.View {...avatarPan.panHandlers} style={{ transform: [{ translateY: avatarDrag }] }}>
        <Pressable onPress={() => otherProfileMedia.avatar && !otherProfileMedia.avatar.unavailable && !!otherProfileMedia.avatar.uri && setViewer(otherProfileMedia.avatar)} style={s.avatarWrap}>
          {otherProfileMedia.avatar && !otherProfileMedia.avatar.unavailable && !!otherProfileMedia.avatar.uri
            ? <Image source={{uri:otherProfileMedia.avatar.uri}} style={s.avatar}/>
            : <View style={s.avatarFallback}><Ionicons name="person" size={38} color={C.cyan}/></View>}
        </Pressable>
        </Animated.View>
        <View style={s.nameLine}><Text style={s.name}>{selectedProfile.display_name}</Text></View>
        <Text style={s.username}>{selectedProfile.username.replace(/[@#]/g, '')}</Text>
        {selectedProfile.is_private && <View style={s.businessTag}><Ionicons name="lock-closed-outline" size={13} color={C.cyan}/><Text style={s.businessTagText}>Private Account</Text></View>}
        {selectedProfile.account_type === 'business' && <View style={s.businessTag}><Ionicons name="briefcase-outline" size={13} color={C.cyan}/><Text style={s.businessTagText}>Professional Business Account</Text></View>}
        {!!selectedProfile.bio && <Text style={s.bio}>{selectedProfile.bio}</Text>}
        {selectedProfile.account_type === 'business' && !!selectedProfile.business_name && <View style={s.businessInfo}><Text style={s.businessName}>{selectedProfile.business_name}</Text>{!!selectedProfile.business_category && <Text style={s.personBio}>{selectedProfile.business_category}</Text>}{!!selectedProfile.business_description && <Text style={s.infoText}>{selectedProfile.business_description}</Text>}</View>}
        {!!selectedProfile.website_url && <Pressable onPress={openOtherWebsite} style={s.websiteLine}><Ionicons name="link" color={C.cyan} size={15}/><Text style={s.website}>{selectedProfile.website_url}</Text></Pressable>}
      </View>
      <View style={s.profileBody}>
        <View style={s.stats}>
          <View style={s.stat}><Text style={s.statNum}>{otherFollowingCount.toLocaleString()}</Text><Text style={s.statLabel}>Following</Text></View>
          <View style={s.stat}><Text style={s.statNum}>{otherFollowerCount.toLocaleString()}</Text><Text style={s.statLabel}>Followers</Text></View>
          <View style={s.stat}><Text style={s.statNum}>{otherLikesCount.toLocaleString()}</Text><Text style={s.statLabel}>Likes</Text></View>
        </View>
        <View style={s.actions}>
          <Pressable disabled={busy} style={[s.primary, (following || pending) && s.followingButton]} onPress={() => toggleFollow(selectedProfile)}><Ionicons name={following ? 'checkmark' : pending ? 'time-outline' : 'person-add-outline'} color={following || pending ? C.cyan : '#fff'} size={17}/><Text style={[s.primaryText, (following || pending) && { color: C.cyan }]}>{busy ? 'Please wait…' : following ? 'Following' : pending ? 'Requested · Cancel' : 'Follow'}</Text></Pressable>
          {(!selectedProfile.is_private || following) && <Pressable style={s.secondary} onPress={() => void openChat(selectedProfile)}><Ionicons name="chatbubble-ellipses-outline" color={C.text} size={17}/><Text style={s.secondaryText}>Message</Text></Pressable>}
          <Pressable style={[s.secondary, { borderColor: C.danger }]} onPress={() => blockProfile(selectedProfile)}><Ionicons name="ban-outline" color={C.danger} size={17}/><Text style={[s.secondaryText, { color: C.danger }]}>Block</Text></Pressable>
        </View>
        {selectedProfile.is_private && !following ? <View style={s.section}>
          <Ionicons name="lock-closed" size={26} color={C.cyan}/>
          <Text style={s.sectionTitle}>This account is private</Text>
          <Text style={s.hint}>{pending ? 'Your follow request is waiting for approval.' : 'Follow this account and wait for approval to see its posts, cover media and profile details.'}</Text>
        </View> : <>
          <View style={s.section}>
            <View style={s.sectionHeading}><Text style={s.sectionTitle}>Posts</Text><Text style={s.coverCount}>{otherPublishedPosts.length}</Text></View>
            {loadingOtherProfile ? <Text style={s.hint}>Loading posts…</Text> : otherPublishedPosts.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9 }}>
              {otherPublishedPosts.map(post => <PublishedPostTile key={post.id} post={post} onPress={() => setViewer(post.media)} onLike={() => void togglePublishedPostLike(post, true)} onComments={() => openPostComments(post)}/>)}
            </ScrollView> : <Text style={s.hint}>No published posts yet.</Text>}
          </View>
          {!!otherProfileMedia.posts.length && <View style={s.section}>
            <Text style={s.sectionTitle}>Featured media</Text>
            <View style={s.mediaRow}>{otherProfileMedia.posts.map((media, i) => <MediaTile key={i} label="Post" media={media} onPress={() => setViewer(media)}/>)}</View>
          </View>}
          <View style={s.section}>
            <Text style={s.sectionTitle}>About</Text>
            {!!selectedProfile.profession_category && <View style={s.infoLine}><Ionicons name="briefcase-outline" color={C.cyan} size={18}/><Text style={s.infoText}>{selectedProfile.profession_category}</Text></View>}
            {!!selectedProfile.activity_status && <View style={s.infoLine}><Ionicons name="time-outline" color={C.cyan} size={18}/><Text style={s.infoText}>{selectedProfile.activity_status}</Text></View>}
          </View>
        </>}
      </View>
    </ScrollView>;
  };


  const PublicFeedScreen = () => {
    const [viewportHeight, setViewportHeight] = useState(0);
    const [feedScrollY, setFeedScrollY] = useState(0);
    const [feedPostTops, setFeedPostTops] = useState<Record<string, number>>({});
    const [videoVisibility, setVideoVisibility] = useState<Record<string, number>>({});
    const reportVideoVisibility = useCallback((id: string, ratio: number) => {
      setVideoVisibility(previous => {
        if (previous[id] === ratio) return previous;
        if (ratio <= 0) {
          if (!(id in previous)) return previous;
          const next = { ...previous };
          delete next[id];
          return next;
        }
        return { ...previous, [id]: ratio };
      });
    }, []);
    const activeVideoId = selectActiveVideo(videoVisibility);
    return <ScrollView
      contentContainerStyle={s.feedScroll}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onLayout={event => setViewportHeight(event.nativeEvent.layout.height)}
      onScroll={event => setFeedScrollY(event.nativeEvent.contentOffset.y)}
    >
      <View style={s.feedHeader}>
        <View><Text style={s.pageTitle}>MEEi</Text><Text style={s.searchSubtitle}>Your community, your feed</Text></View>
        <Pressable style={s.searchHeaderIcon} onPress={() => setTab('Search')}><Ionicons name="search" size={20} color={C.cyan}/></Pressable>
      </View>
      <View style={s.feedComposer}>
        <View style={s.personAvatar}><Ionicons name="person" size={21} color={C.cyan}/></View>
        <Pressable style={{flex:1}} onPress={() => setCreateMenuVisible(true)}><Text style={s.personUsername}>Share something with your community…</Text></Pressable>
        <Pressable onPress={() => setCreateMenuVisible(true)}><Ionicons name="images-outline" size={22} color={C.cyan}/></Pressable>
      </View>
      {loadingFeed ? <View style={s.searchEmpty}><Text style={s.hint}>Loading your feed…</Text></View> :
        feedPosts.length === 0 ? <View style={s.searchEmpty}><Ionicons name="newspaper-outline" size={38} color={C.cyan}/><Text style={s.sectionTitle}>Your feed is ready</Text><Text style={s.hint}>Public posts from creators will appear here.</Text><Pressable onPress={() => setTab('Search')} style={[s.primary,{paddingHorizontal:22,flex:0}]}><Text style={s.primaryText}>Discover creators</Text></Pressable></View> :
        feedPosts.map(post => <View
          key={post.id}
          style={s.feedPost}
          onLayout={event => setFeedPostTops(old => ({ ...old, [post.id]: event.nativeEvent.layout.y }))}
        >
          <View style={s.feedPostHeader}>
            <Pressable style={{flexDirection:'row',alignItems:'center',gap:10,flex:1}} onPress={() => setSelectedProfile(post.author)}>
              <View style={s.personAvatar}>{post.authorAvatar?.type === 'image' ? <Image source={{uri:post.authorAvatar.uri}} style={{width:'100%',height:'100%',borderRadius:24}}/> : <Ionicons name="person" size={21} color={C.cyan}/>}</View>
              <View style={{flex:1,gap:2}}><Text style={s.personName}>{post.author.display_name}</Text><Text style={s.personUsername}>@{post.author.username.replace(/[@#]/g,'')} · {new Date(post.created_at).toLocaleDateString()}</Text>{post.author.account_type === 'business' && <Text style={s.personBio}>{post.author.business_name || post.author.business_category || 'Business account'}</Text>}</View>
            </Pressable>
            {!followedUserIds.includes(post.author.id) && <Pressable disabled={followBusyIds.includes(post.author.id)} onPress={() => void toggleFollow(post.author)} style={[s.feedFollowButton, pendingFollowIds.includes(post.author.id) && s.followingButton]}><Text style={[s.feedFollowText, pendingFollowIds.includes(post.author.id) && s.followingButtonText]}>{followBusyIds.includes(post.author.id) ? '…' : pendingFollowIds.includes(post.author.id) ? 'Requested' : 'Follow'}</Text></Pressable>}
            <Pressable onPress={() => Alert.alert('Post options', 'Choose an action for this post.', [
              { text: 'Not interested', onPress: () => setFeedPosts(old => old.filter(item => item.id !== post.id)) },
              { text: 'Report', onPress: () => setReportPost(post) },
              { text: 'Cancel', style: 'cancel' },
            ])} style={{padding:8}}><Ionicons name="ellipsis-horizontal" size={21} color={C.text}/></Pressable>
          </View>
          {!!post.caption && <Text style={s.feedCaption}>{post.caption}</Text>}
          {post.media.unavailable
            ? <View style={[s.feedMedia, { minHeight: 180, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="alert-circle-outline" size={30} color={C.muted}/>
                <Text style={[s.videoText, { color: C.muted }]}>PREVIEW UNAVAILABLE</Text>
              </View>
            : post.post_type === 'video' ? <FeedVideoMedia
                id={post.id}
                uri={post.media.uri}
                onPress={() => setViewer(post.media)}
                postTop={feedPostTops[post.id] ?? -1}
                scrollY={feedScrollY}
                viewportHeight={viewportHeight}
                active={activeVideoId === post.id}
                onVisibilityChange={reportVideoVisibility}
              /> :
                <Pressable onPress={() => setViewer(post.media)}><Image source={{uri:post.media.uri}} style={s.feedMedia} resizeMode="cover"/></Pressable>}
          <View style={s.feedActions}>
            <Pressable onPress={() => void togglePublishedPostLike(post,false)} style={s.feedAction}><Ionicons name={post.viewer_liked?'heart':'heart-outline'} size={23} color={post.viewer_liked?'#E64D72':C.text}/><Text style={s.feedActionText}>{post.like_count}</Text></Pressable>
            <Pressable onPress={() => openPostComments(post)} style={s.feedAction}><Ionicons name="chatbubble-outline" size={21} color={C.text}/><Text style={s.feedActionText}>{post.comment_count}</Text></Pressable>
            <Pressable onPress={() => void Share.share({message: (post.caption || 'Check out this post on MEEi') + ' · MEEi'})} style={s.feedAction}><Ionicons name="paper-plane-outline" size={21} color={C.text}/><Text style={s.feedActionText}>Share</Text></Pressable>
            <View style={{flex:1}}/>
            <Pressable disabled={savedPostBusyIds.includes(post.id)} onPress={() => void toggleSavedPost(post.id)} accessibilityRole="button" accessibilityLabel={savedPostIds.includes(post.id) ? 'Remove saved post' : 'Save post'} style={{padding:6}}><Ionicons name={savedPostIds.includes(post.id) ? 'bookmark' : 'bookmark-outline'} size={21} color={savedPostIds.includes(post.id) ? C.pink : C.text}/></Pressable>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 }}>
            <Pressable onPress={() => setReactionPostId(post.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 14, backgroundColor: '#F4F9FD' }}>
              <Text style={{ fontSize: 15 }}>{postReactionSummaries[post.id]?.mine || '😊'}</Text>
              <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700' }}>React</Text>
            </Pressable>
            {Object.entries(postReactionSummaries[post.id]?.counts || {}).sort((a,b) => b[1]-a[1]).slice(0,4).map(([emoji,count]) => <Pressable key={emoji} onPress={() => setReactionPostId(post.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 13, backgroundColor: postReactionSummaries[post.id]?.mine === emoji ? '#E7F4FF' : '#F7F9FB', borderWidth: postReactionSummaries[post.id]?.mine === emoji ? 1 : 0, borderColor: '#9DD6F4' }}><Text style={{ fontSize: 14 }}>{emoji}</Text><Text style={{ color: C.muted, fontSize: 10, fontWeight: '700' }}>{count}</Text></Pressable>)}
          </View>
        </View>)}
    </ScrollView>;
  };

  const DiscoverScreen = () => {
    const [viewportHeight, setViewportHeight] = useState(0);
    const [scrollY, setScrollY] = useState(0);
    const [reelsGridTop, setReelsGridTop] = useState(0);
    const [videoVisibility, setVideoVisibility] = useState<Record<string, number>>({});
    const reportVideoVisibility = useCallback((id: string, ratio: number) => {
      setVideoVisibility(previous => {
        if (previous[id] === ratio) return previous;
        if (ratio <= 0) {
          if (!(id in previous)) return previous;
          const next = { ...previous };
          delete next[id];
          return next;
        }
        return { ...previous, [id]: ratio };
      });
    }, []);
    const activeVideoId = selectActiveVideo(videoVisibility);
    const query = profileSearch.trim().replace(/^[@#]+/, '').toLowerCase();
    const filteredProfiles = publicProfiles.filter(profile =>
      (!query ||
        profile.username.replace(/[@#]/g, '').toLowerCase().includes(query) ||
        profile.display_name.toLowerCase().includes(query) ||
        (profile.profession_category || '').toLowerCase().includes(query)) &&
      (searchCategory !== 'Creators' || /(creator|influencer|youtub|content)/i.test(profile.profession_category || ''))
    );
    const filteredVideos = publicVideos;
    const categories: SearchCategory[] = ['Reels', 'People', 'Videos', 'Trending', 'Funny', 'Vlogs', 'Cinema', 'Creators'];
    const openSearchVideo = (video: SearchVideo) => {
      const uri = videoUrls[video.id];
      if (!uri) {
        Alert.alert('Video unavailable', 'This video could not be opened right now.');
        return;
      }
      void supabase?.rpc('record_public_post_view', { target_post_id: video.id });
      setViewer({ uri, type: 'video', storagePath: video.media_path });
    };
    const peopleMode = searchCategory === 'People' || searchCategory === 'Creators';
    return <ScrollView
      contentContainerStyle={s.discoverScroll}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      onLayout={event => setViewportHeight(event.nativeEvent.layout.height)}
      onScroll={event => setScrollY(event.nativeEvent.contentOffset.y)}
    >
      <View style={s.searchHeader}>
        <View><Text style={s.pageTitle}>MEEi</Text><Text style={s.searchSubtitle}>Discover something new</Text></View>
        <View style={s.searchHeaderIcon}><Ionicons name="sparkles" size={20} color={C.cyan}/></View>
      </View>
      <View style={s.searchBox}>
        <Ionicons name="search" size={19} color={C.muted}/>
        <TextInput value={profileSearch} onChangeText={setProfileSearch} placeholder={peopleMode ? (searchCategory === 'Creators' ? 'Search creators by name or profession' : 'Search username, nickname or profession') : 'Search Reels, people and videos'} placeholderTextColor={C.muted} style={s.searchInput} returnKeyType="search"/>
        {!!profileSearch && <Pressable onPress={() => setProfileSearch('')}><Ionicons name="close-circle" size={19} color={C.muted}/></Pressable>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.searchCategories}>
        {categories.map(category => <Pressable key={category} onPress={() => { setSearchCategory(category); setProfileSearch(''); }} style={[s.searchCategory, searchCategory === category && s.searchCategoryActive]}>
          <Text style={[s.searchCategoryText, searchCategory === category && s.searchCategoryTextActive]}>{category}</Text>
        </Pressable>)}
      </ScrollView>
      {peopleMode ? <>
        <Text style={s.hint}>{searchCategory === 'Creators' ? 'Find creators by their public profession.' : 'Find people by username, nickname or profession.'}</Text>
        {loadingProfiles ? <Text style={s.hint}>Loading people…</Text> : filteredProfiles.length === 0 ? <Text style={s.hint}>{searchCategory === 'Creators' ? 'No creator profiles found yet.' : 'No people found. Try another search.'}</Text> : filteredProfiles.map(profile => {
          const following = followedUserIds.includes(profile.id);
          const busy = followBusyIds.includes(profile.id);
          return <View key={profile.id} style={s.personRow}>
            <Pressable onPress={() => setSelectedProfile(profile)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={s.personAvatar}>{discoverAvatars[profile.id]?.type === 'image' ? <Image source={{ uri: discoverAvatars[profile.id].uri }} style={{ width: '100%', height: '100%', borderRadius: 24 }} /> : <Ionicons name="person" size={22} color={C.cyan}/>}</View>
              <View style={s.personDetails}><Text style={s.personName}>{profile.display_name}</Text><Text style={s.personUsername}>{profile.username.replace(/[@#]/g, '')}</Text>{!!profile.profession_category && <Text style={s.personBio}>{profile.profession_category}</Text>}</View>
            </Pressable>
            <Pressable disabled={busy} onPress={() => toggleFollow(profile)} style={[s.followButton, (following || pendingFollowIds.includes(profile.id)) && s.followingButton]}><Text style={[s.followButtonText, (following || pendingFollowIds.includes(profile.id)) && s.followingButtonText]}>{busy ? '...' : following ? 'Following' : pendingFollowIds.includes(profile.id) ? 'Requested' : 'Follow'}</Text></Pressable>
          </View>;
        })}
      </> : <>
        <View style={s.reelsSectionHeading}>
          <Text style={s.sectionTitle}>{searchCategory === 'Reels' ? 'Explore Reels' : searchCategory === 'Trending' ? 'Trending now' : 'Explore ' + searchCategory}</Text>
          <Text style={s.reelsCount}>{filteredVideos.length} videos</Text>
        </View>
        {loadingVideos || (filteredVideos.length > 0 && Object.keys(videoUrls).length === 0) ? <View style={s.searchEmpty}><Text style={s.hint}>Finding videos for you…</Text></View> :
          filteredVideos.length === 0 ? <View style={s.searchEmpty}><Ionicons name="videocam-outline" size={34} color={C.cyan}/><Text style={s.sectionTitle}>Nothing here yet</Text><Text style={s.hint}>Public {searchCategory.toLowerCase()} will appear here as creators share them.</Text></View> :
          <View style={s.reelsGrid} onLayout={event => setReelsGridTop(event.nativeEvent.layout.y)}>
            {filteredVideos.slice(0, 12).map(video => <SearchReelTile
              key={video.id}
              id={video.id}
              uri={videoUrls[video.id]}
              caption={video.caption || 'MEEi video'}
              views={video.view_count || 0}
              onPress={() => openSearchVideo(video)}
              gridTop={reelsGridTop}
              scrollY={scrollY}
              viewportHeight={viewportHeight}
              active={activeVideoId === video.id}
              onVisibilityChange={reportVideoVisibility}
            />)}
          </View>}
      </>}
    </ScrollView>;
  };


  const LongVideosScreen = () => {
    const videos = publicVideos.filter(video => video.content_category === 'videos' || video.content_category === 'cinema');
    return <ScrollView contentContainerStyle={s.longVideosScroll}>
      <View style={s.feedHeader}><View><Text style={s.pageTitle}>Videos</Text><Text style={s.searchSubtitle}>Long-form videos from MEEi creators</Text></View><View style={s.searchHeaderIcon}><Ionicons name="play" size={20} color={C.cyan}/></View></View>
      <View style={s.searchBox}><Ionicons name="search" size={19} color={C.muted}/><TextInput value={profileSearch} onChangeText={setProfileSearch} placeholder="Search long videos, topics or creators" placeholderTextColor={C.muted} style={s.searchInput}/>{!!profileSearch && <Pressable onPress={()=>setProfileSearch('')}><Ionicons name="close-circle" size={19} color={C.muted}/></Pressable>}</View>
      {loadingVideos ? <View style={s.searchEmpty}><Text style={s.hint}>Finding videos…</Text></View> : videos.length === 0 ? <View style={s.searchEmpty}><Ionicons name="film-outline" size={38} color={C.cyan}/><Text style={s.sectionTitle}>No long videos yet</Text><Text style={s.hint}>Public long-form videos will appear here.</Text></View> :
        videos.map(video=><Pressable key={video.id} onPress={()=>{const uri=videoUrls[video.id];if(uri){void supabase?.rpc('record_public_post_view',{target_post_id:video.id});setViewer({uri,type:'video',storagePath:video.media_path});}}} style={s.longVideoCard}>
          {videoUrls[video.id] ? <LongVideoPreview uri={videoUrls[video.id]}/> : <View style={s.longVideoThumbFallback}><Ionicons name="play-circle" size={42} color="#FFFFFF"/></View>}
          <View style={{flex:1,gap:5}}><Text style={s.personName} numberOfLines={2}>{video.caption || 'MEEi video'}</Text><Text style={s.personUsername}>{video.view_count.toLocaleString()} views · {new Date(video.created_at).toLocaleDateString()}</Text><Text style={s.personBio}>MEEi creator video</Text></View>
        </Pressable>)}
    </ScrollView>;
  };

  const LiveScreen = () => {
    const activeCountries = new Map(liveCreators.map(creator => [creator.country_code, creator.country_name] as const));
    const countryFlag = (code: string) => /^[A-Z]{2}$/.test(code)
      ? String.fromCodePoint(...code.split('').map(char => 127397 + char.charCodeAt(0)))
      : '🌐';
    const prettyCountryName = (name: string) => name.split(/([ -])/).map(part =>
      part === ' ' || part === '-' ? part : part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part
    ).join('');
    const countriesByCode = MEEI_COUNTRY_CODES.map(code => ({
      code,
      name: prettyCountryName(activeCountries.get(code) || getCountryDisplayName(code, 'en')),
    }));
    const ownCountry = countriesByCode.find(country => country.code === homeCountryCode) || { code: homeCountryCode, name: prettyCountryName(homeCountryName) };
    const featuredCodes = ['IN','RU','US','CO','PK','PH','NP','BR'];
    const featuredCountries = [
      ownCountry,
      ...featuredCodes.filter(code => code !== ownCountry.code).map(code => countriesByCode.find(country => country.code === code)).filter(Boolean),
    ].filter((country, index, all) => all.findIndex(item => item?.code === country?.code) === index).slice(0, 8) as {code:string;name:string}[];
    const allCountries = [ownCountry, ...countriesByCode.filter(country => country.code !== ownCountry.code).sort((a,b) => a.name.localeCompare(b.name))];
    const continentCodes: Record<string, string[]> = {
      ASIA: 'AE AF AM AZ BD BH BN BT CC CN CX CY GE HK ID IL IN IO IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA RU SA SG SY TH TJ TL TM TR TW UZ VN YE'.split(' '),
      EUROPE: 'AD AL AT AX BA BE BG BY CH CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA'.split(' '),
      AFRICA: 'AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SH SL SD SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW'.split(' '),
      'NORTH AMERICA': 'AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI'.split(' '),
      'SOUTH AMERICA': 'AR BO BR CL CO EC FK GF GY PE PY SR UY VE'.split(' '),
      OCEANIA: 'AS AU CK FJ FM GU HM KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TL TO TV UM VU WF WS'.split(' '),
      ANTARCTICA: 'AQ BV GS TF'.split(' '),
    };
    const groupedCountries = Object.entries(continentCodes).map(([continent, codes]) => ({
      continent,
      countries: allCountries.filter(country => codes.includes(country.code)),
    })).filter(group => group.countries.length > 0);
    const filteredGroups = groupedCountries.map(group => ({
      ...group,
      countries: group.countries.filter(country => country.name.toLowerCase().includes(liveCountrySearch.trim().toLowerCase())),
    })).filter(group => group.countries.length > 0);
    const worldwideCreators = [...liveCreators].sort((a,b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    const visibleCreators = liveCreators.filter(creator => creator.country_code === liveCountry);
    const renderCreatorGrid = (creators: LiveCreator[]) => creators.length === 0
      ? <View style={s.liveEmpty}><View style={s.liveEmptyIcon}><Ionicons name="radio-outline" size={38} color={C.cyan}/></View><Text style={s.sectionTitle}>No creators live right now</Text><Text style={s.hint}>Live creators will appear here when they start broadcasting.</Text></View>
      : <View style={s.liveGrid}>{creators.map(creator => {
          const uri = liveMediaUrls[creator.session_id];
          return <Pressable key={creator.session_id} onPress={() => {
            setLiveJoinSessionId(creator.session_id);
            setLiveStudioVisible(true);
          }} style={s.liveCard}>
            {uri ? <Image source={{ uri }} style={s.liveCardImage} resizeMode="cover"/> : <View style={s.liveCardFallback}><Ionicons name="person" size={34} color="#FFFFFF"/></View>}
            <View style={s.liveCardShade}/>
            <View style={s.liveBadge}><View style={s.liveBadgeDot}/><Text style={s.liveBadgeText}>LIVE</Text></View>
            <View style={s.liveCardInfo}><Text style={s.liveCardName} numberOfLines={1}>{creator.display_name}</Text><Text style={s.liveCardMeta} numberOfLines={1}>{countryFlag(creator.country_code)}  {prettyCountryName(creator.country_name)}</Text>{!!creator.title && <Text style={s.liveCardTitle} numberOfLines={1}>{creator.title}</Text>}</View>
          </Pressable>;
        })}</View>;
    if (liveCountryPage === 'all') return <ScrollView contentContainerStyle={s.liveScroll} keyboardShouldPersistTaps="handled">
      <View style={s.liveHeader}>
        <Pressable onPress={() => { setLiveCountryPage('explore'); setLiveCountrySearch(''); }} style={{flexDirection:'row',alignItems:'center',gap:8}}><Ionicons name="arrow-back" size={22} color={C.text}/><Text style={s.liveExploreTitle}>ALL COUNTRIES</Text></Pressable>
        <Text style={s.liveExploreMeta}>World regions</Text>
      </View>
      <View style={s.searchBox}><Ionicons name="search" size={18} color={C.muted}/><TextInput value={liveCountrySearch} onChangeText={setLiveCountrySearch} placeholder="Search country" placeholderTextColor={C.muted} style={s.searchInput}/>{!!liveCountrySearch && <Pressable onPress={()=>setLiveCountrySearch('')}><Ionicons name="close-circle" size={18} color={C.muted}/></Pressable>}</View>
      {filteredGroups.map(group => <View key={group.continent} style={{gap:10,marginTop:7}}>
        <Text style={s.liveContinentTitle}>{group.continent}</Text>
        <View style={s.liveAllCountriesGrid}>{group.countries.map(country => <Pressable key={country.code} onPress={() => { setLiveCountry(country.code); setLiveCountryPage('country'); }} style={s.liveAllCountryItem}><Text style={s.liveAllCountryFlag}>{countryFlag(country.code)}</Text><Text style={s.liveAllCountryName}>{country.name}</Text></Pressable>)}</View>
      </View>)}
      {filteredGroups.length === 0 && <Text style={s.hint}>No countries match your search.</Text>}
    </ScrollView>;
    if (liveCountryPage === 'country') return <ScrollView contentContainerStyle={s.liveScroll}>
      <View style={s.liveHeader}>
        <Pressable onPress={() => setLiveCountryPage('explore')} style={{flexDirection:'row',alignItems:'center',gap:8}}><Ionicons name="arrow-back" size={22} color={C.text}/><Text style={s.liveExploreTitle}>{countryFlag(liveCountry)}  {allCountries.find(country=>country.code===liveCountry)?.name || liveCountry}</Text></Pressable>
        <Pressable onPress={() => setLiveCountryPage('all')}><Text style={s.liveMoreText}>MORE  ›</Text></Pressable>
      </View>
      {loadingLiveCreators ? <View style={s.searchEmpty}><Text style={s.hint}>Finding creators who are live…</Text></View> : renderCreatorGrid(visibleCreators)}
    </ScrollView>;
    return <ScrollView contentContainerStyle={s.liveScroll}>
      <View style={s.liveHeader}>
        <Text style={s.liveMainTitle}>MEEi LIVE HOSTS</Text>
      </View>
      <View style={s.liveSectionHeader}><Text style={s.liveSectionTitle}>Countries & regions</Text><Pressable onPress={() => setLiveCountryPage('all')}><Text style={s.liveMoreText}>MORE  ›</Text></Pressable></View>
      <View style={s.liveFeaturedGrid}>{featuredCountries.map(country => <Pressable key={country.code} onPress={() => {setLiveCountry(country.code);setLiveCountryPage('country');}} style={s.liveFeaturedCountry}><Text style={s.liveFeaturedFlag}>{countryFlag(country.code)}</Text><Text style={s.liveFeaturedName}>{country.name}</Text></Pressable>)}</View>
      <View style={s.liveSectionHeader}><Text style={s.liveSectionTitle}>Trending</Text><Ionicons name="options-outline" size={22} color={C.text}/></View>
      {loadingLiveCreators ? <View style={s.searchEmpty}><Text style={s.hint}>Finding creators who are live…</Text></View> : renderCreatorGrid(worldwideCreators)}
    </ScrollView>;
  };

    const CreateScreen = () => (
    <ScrollView contentContainerStyle={s.discoverScroll} keyboardShouldPersistTaps="handled">
      <Text style={s.pageTitle}>Create</Text>
      <Text style={s.hint}>Share a photo or video with your MEEi community.</Text>
      <Pressable onPress={() => void chooseCreateMedia()} style={s.createPicker}>
        {createMedia?.type === 'image' ? <Image source={{ uri: createMedia.uri }} style={s.createPreview} resizeMode="cover" /> :
          createMedia?.type === 'video' ? <View style={s.createVideoPreview}><Ionicons name="play-circle" size={48} color="#FFFFFF"/><Text style={s.primaryText}>VIDEO SELECTED</Text></View> :
          <><Ionicons name="cloud-upload-outline" size={34} color={C.cyan}/><Text style={s.sectionTitle}>Choose photo or video</Text><Text style={s.hint}>Up to 50 MB · Videos up to 60 seconds</Text></>}
      </Pressable>
      {createMedia && <Pressable onPress={() => setCreateMedia(null)} style={s.createRemove}><Ionicons name="close-circle" size={18} color={C.muted}/><Text style={s.personUsername}>Remove selected media</Text></Pressable>}
      <View style={s.field}>
        <Text style={s.fieldLabel}>Caption</Text>
        <TextInput value={createCaption} onChangeText={setCreateCaption} placeholder="Write something about your post…" placeholderTextColor={C.muted} style={[s.input, { minHeight: 100, textAlignVertical: 'top' }]} multiline maxLength={2000}/>
        <Text style={s.hint}>{createCaption.length}/2000</Text>
      </View>
      {createMedia?.type === 'video' && <>
        <Text style={s.fieldLabel}>Video category</Text>
        <View style={s.activityGrid}>
          {([{label:'Videos',value:'videos'},{label:'Reels',value:'reels'},{label:'Funny',value:'funny'},{label:'Vlogs',value:'vlogs'},{label:'Cinema',value:'cinema'}] as const).map(item =>
            <Pressable key={item.value} onPress={() => setCreateCategory(item.value)} style={[s.activityChip, createCategory === item.value && s.activityActive]}>
              <Text style={[s.activityText, createCategory === item.value && { color: C.cyan }]}>{item.label}</Text>
            </Pressable>
          )}
        </View>
      </>}
      <Text style={s.fieldLabel}>Who can see this post?</Text>
      <View style={s.activityGrid}>
        {([{label:'Public',value:'public'},{label:'Followers',value:'followers'},{label:'Only me',value:'private'}] as const).map(item =>
          <Pressable key={item.value} onPress={() => setCreateVisibility(item.value)} style={[s.activityChip, createVisibility === item.value && s.activityActive]}>
            <Text style={[s.activityText, createVisibility === item.value && { color: C.cyan }]}>{item.label}</Text>
          </Pressable>
        )}
      </View>
      <Pressable disabled={!createMedia || publishingPost} onPress={() => void publishPost()} style={[s.primary, { opacity: !createMedia || publishingPost ? 0.55 : 1 }]}>
        {publishingPost ? <Text style={s.primaryText}>Publishing…</Text> : <Text style={s.primaryText}>Publish post</Text>}
      </Pressable>
      <Text style={s.hint}>Public videos can appear in Search categories. Your profile privacy and post visibility rules still apply.</Text>
    </ScrollView>
  );

  const InboxScreen = () => (
    <View style={[s.simple, activeChat && { backgroundColor: '#F4F7FA', paddingHorizontal: 12, paddingTop: 8 }]}>
      {activeChat ? <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => { setActiveChat(null); setChatMessages([]); void loadInbox(); }} style={{ padding: 6 }}>
            <Ionicons name="arrow-back" size={23} color={C.text}/>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>{activeChat.otherUser.display_name}</Text>
            <Text style={s.personUsername}>{activeChat.otherUser.username.replace(/[@#]/g, '')}</Text>
          </View>
          <Pressable onPress={() => Alert.alert('Translate messages to', 'Choose your reading language.', [{ text: 'Hindi', onPress: () => { setTranslationLanguage('hi'); setTranslatedMessages({}); setVisibleTranslations([]); } }, { text: 'English', onPress: () => { setTranslationLanguage('en'); setTranslatedMessages({}); setVisibleTranslations([]); } }, { text: 'Cancel', style: 'cancel' }])}><Ionicons name="language-outline" size={21} color={C.cyan}/></Pressable>
          <Pressable onPress={() => setActiveChat(null)}><Ionicons name="close" size={21} color={C.muted}/></Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingVertical: 12 }} keyboardShouldPersistTaps="handled">
          {chatLoading && chatMessages.length === 0 ? <Text style={s.hint}>Loading messages…</Text> :
            chatMessages.length === 0 ? <Text style={[s.hint, { textAlign: 'center', marginTop: 30 }]}>Say hello and start the conversation.</Text> :
            chatMessages.map(message => {
              const mine = message.sender_id === currentUserId;
              return <View key={message.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '84%', backgroundColor: mine ? '#DDF1FF' : '#FFFFFF', borderTopLeftRadius: 17, borderTopRightRadius: 17, borderBottomLeftRadius: mine ? 17 : 5, borderBottomRightRadius: mine ? 5 : 17, paddingHorizontal: 13, paddingVertical: 9, gap: 5, borderWidth: 1, borderColor: mine ? '#C8E7FA' : '#E8EDF1' }}>
                {message.message_type === 'voice' ? (message.audio_url ? <VoiceMessageBubble uri={message.audio_url} transcript={message.transcript || message.body} mine={mine}/> : <Text style={{ color: C.muted, fontSize: 12 }}>Voice message unavailable</Text>) : <Text style={{ color: C.text, fontSize: 14 }}>{message.body}</Text>}
                <Pressable disabled={translatingMessageIds.includes(message.id)} onPress={() => void translateMessage({ ...message, body: message.message_type === 'voice' ? (message.transcript || message.body) : message.body })} style={{ alignSelf: 'flex-start', paddingVertical: 3 }}><Text style={{ color: C.cyan, fontSize: 11, fontWeight: '700' }}>{translatingMessageIds.includes(message.id) ? 'Translating…' : visibleTranslations.includes(message.id) ? 'Hide translation' : 'Translate to ' + (translationLanguage === 'hi' ? 'Hindi' : 'English')}</Text></Pressable>
                {visibleTranslations.includes(message.id) && !!translatedMessages[message.id] && <Text style={{ color: C.text, fontSize: 14, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6 }}>{translatedMessages[message.id]}</Text>}
                <Text style={{ color: C.muted, fontSize: 9, marginTop: 4, textAlign: 'right' }}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{mine && message.read_at ? ' · Seen' : ''}</Text>
              </View>;
            })}
        </ScrollView>
        {emojiPickerVisible && <ChatEmojiPicker onSelect={emoji => setChatDraft(old => old + emoji)}/>}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 10, borderTopWidth: 1, borderColor: '#E5EBF0', backgroundColor: '#F4F7FA' }}>
          <Pressable onPress={() => setEmojiPickerVisible(old => !old)} accessibilityRole="button" accessibilityLabel={emojiPickerVisible ? 'Close emoji picker' : 'Open emoji picker'} style={{ width: 42, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: emojiPickerVisible ? '#E7F4FF' : '#FFFFFF', borderWidth: 1, borderColor: '#E2E9EF' }}>
            <Ionicons name={emojiPickerVisible ? 'close' : 'happy-outline'} size={22} color={C.cyan}/>
          </Pressable>
          <TextInput value={chatDraft} onChangeText={setChatDraft} placeholder="Message" placeholderTextColor={C.muted} multiline style={[s.input, { flex: 1, maxHeight: 110, minHeight: 44, paddingVertical: 10, borderRadius: 24, backgroundColor: '#FFFFFF', borderColor: '#E2E9EF', paddingHorizontal: 16 }]}/>
          <Pressable disabled={voiceSending} onLongPress={() => Alert.alert('Voice recognition language', 'Choose the language you will speak.', [{ text: 'Hindi', onPress: () => setVoiceLanguage('hi-IN') }, { text: 'English', onPress: () => setVoiceLanguage('en-IN') }, { text: 'Cancel', style: 'cancel' }])} onPress={() => voiceRecording ? stopVoiceRecording() : void startVoiceRecording()} style={[s.secondary, { width: 44, minHeight: 44, padding: 0, opacity: voiceSending ? 0.55 : 1 }]}><Ionicons name={voiceRecording ? 'stop-circle' : 'mic-outline'} size={19} color={voiceRecording ? '#D33' : C.cyan}/></Pressable>
          <Pressable disabled={!chatDraft.trim() || chatSending} onPress={() => void sendChatMessage()} style={[s.primary, { flex: 0, width: 48, minHeight: 44, opacity: !chatDraft.trim() || chatSending ? 0.55 : 1 }]}>
            <Ionicons name="send" size={18} color="#FFFFFF"/>
          </Pressable>
        </View>
        {(voiceRecording || voiceStopPending || voiceSending) && <Text style={[s.hint, { paddingTop: 6 }]}>{voiceRecording ? 'Recording… ' + (voiceTranscript || 'Speak now') : voiceSending ? 'Sending voice message…' : 'Finishing recording…'}</Text>}
      </> : <>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={s.pageTitle}>Inbox</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Pressable onPress={toggleContactDiscoverability} accessibilityRole="button" accessibilityLabel={contactDiscoverable ? 'Turn off phone discoverability' : 'Let contacts find me'}>
              <Ionicons name={contactDiscoverable ? 'eye' : 'eye-off-outline'} size={21} color={contactDiscoverable ? C.success : C.muted}/>
            </Pressable>
            <Pressable disabled={contactSyncing} onPress={confirmContactSync} accessibilityRole="button" accessibilityLabel="Find people from contacts">
              <Ionicons name={contactSyncing ? 'hourglass-outline' : 'people-outline'} size={22} color={C.cyan}/>
            </Pressable>
            <Pressable onPress={() => void loadInbox()}><Ionicons name="refresh" size={21} color={C.cyan}/></Pressable>
          </View>
        </View>
        {contactSyncing && <Text style={s.hint}>Securely matching your contacts…</Text>}
        {contactSyncDone && <View style={{ paddingVertical: 10, gap: 7 }}>
          <Text style={s.sectionTitle}>People from your contacts</Text>
          {contactMatches.length ? contactMatches.map(profile => (
            <Pressable key={profile.id} onPress={() => void openChat(profile)} style={s.personRow}>
              <View style={s.personAvatar}><Ionicons name="person" size={22} color={C.cyan}/></View>
              <View style={s.personDetails}>
                <Text style={s.personName}>{profile.display_name}</Text>
                <Text style={s.personUsername}>{profile.username.replace(/[@#]/g, '')}</Text>
              </View>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={C.cyan}/>
            </Pressable>
          )) : <Text style={s.hint}>No discoverable MEEi contacts found yet.</Text>}
        </View>}
        {chatLoading ? <Text style={s.hint}>Loading conversations…</Text> :
          chatThreads.length === 0 ? <View style={{ paddingTop: 25, gap: 8 }}>
            <Text style={s.sectionTitle}>No messages yet</Text>
            <Text style={s.hint}>Open someone’s profile and tap Message to start a private chat.</Text>
          </View> :
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            {chatThreads.map(thread => <Pressable key={thread.id} onPress={() => void openChat(thread.otherUser)} style={s.personRow}>
              <View style={s.personAvatar}><Ionicons name="person" size={22} color={C.cyan}/></View>
              <View style={s.personDetails}>
                <Text style={s.personName}>{thread.otherUser.display_name}</Text>
                <Text style={s.personUsername}>{thread.otherUser.username.replace(/[@#]/g, '')}</Text>
              </View>
              {!!thread.unread_count && <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.cyan, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{thread.unread_count > 99 ? '99+' : thread.unread_count}</Text></View>}
              <Ionicons name="chevron-forward" size={18} color={C.muted}/>
            </Pressable>)}
          </ScrollView>}
      </>}
    </View>
  );

  const SimpleScreen = ({ title, subtitle }: {title:string;subtitle:string}) => (
    <View style={s.simple}><Text style={s.pageTitle}>{title}</Text><View style={s.card}><Text style={s.sectionTitle}>{subtitle}</Text><Text style={s.hint}>This section will be connected to MEEi accounts and services in the next build step.</Text></View></View>
  );

  if (profileLoadStatus !== 'ready') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
        <StatusBar barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={C.bg}/>
        {profileLoadStatus === 'loading' ? (
          <><ActivityIndicator size="large" color={C.cyan}/><Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>Loading your MEEi profile…</Text></>
        ) : (
          <><Text style={{ color: C.text, fontSize: 19, fontWeight: '900', textAlign: 'center' }}>Profile unavailable</Text><Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>{profileLoadError || 'Your profile could not be loaded.'}</Text><Pressable accessibilityRole="button" onPress={() => setProfileLoadAttempt(value => value + 1)} style={{ backgroundColor: C.pink, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 13 }}><Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Retry</Text></Pressable></>
        )}
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg}/>
      <LiveBroadcastModal visible={liveStudioVisible} sessionId={liveJoinSessionId} creatorName={name} onClose={() => { setLiveStudioVisible(false); setLiveJoinSessionId(null); }} />
      <View style={{flex:1}}>
        {selectedProfile ? <OtherProfileScreen/> : tab === 'Profile' ? <Profile/> :
          tab === 'Home' || tab === 'Public' ? <PublicFeedScreen/> :
          tab === 'Search' ? <DiscoverScreen/> :
          tab === 'Videos' ? (LONG_VIDEOS_PUBLIC_ENABLED ? <LongVideosScreen/> : <Profile/>) :
          tab === 'Live' ? <LiveScreen/> :
          tab === 'Create' ? <CreateScreen/> :
          <InboxScreen/>}
      </View>
      <View style={s.nav}>
        {(['Home','Search','Live', ...(LONG_VIDEOS_PUBLIC_ENABLED ? ['Videos' as const] : [])] as const).map((item) => {
          const icons = { Home: 'home-outline', Search: 'search-outline', Live: 'radio-outline', Videos: 'play-circle-outline' } as const;
          return <Pressable key={item} style={s.navItem} onPress={() => { setSelectedProfile(null); setTab(item); }}>
            <Ionicons name={icons[item]} size={21} color={tab === item ? C.pink : C.muted}/>
            <Text style={[s.navLabel, tab === item && {color:C.pink}]}>{item === 'Home' ? 'Feed' : item === 'Videos' ? 'Videos' : item}</Text>
          </Pressable>;
        })}
        <Pressable accessibilityRole="button" accessibilityLabel="Create" style={s.navCreateItem} onPress={() => setCreateMenuVisible(true)}>
          <View style={s.navCreateButton}><Ionicons name="add" size={29} color="#FFFFFF"/></View>
          <Text style={s.navLabel}>Create</Text>
        </Pressable>
        {(['Inbox','Profile'] as Tab[]).map((item) => <Pressable key={item} style={s.navItem} onPress={() => { setSelectedProfile(null); setTab(item); }}>
          <Ionicons name={item === 'Inbox' ? 'mail-outline' : 'person-outline'} size={21} color={tab === item ? C.pink : C.muted}/>
          <Text style={[s.navLabel, tab === item && {color:C.pink}]}>{item}</Text>
        </Pressable>)}
      </View>
      <Modal visible={blockedAccountsVisible} animationType="slide" onRequestClose={() => setBlockedAccountsVisible(false)}>
        <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? 28 : 54 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <Pressable onPress={() => setBlockedAccountsVisible(false)} style={{ padding: 6 }}><Ionicons name="arrow-back" size={24} color={C.text}/></Pressable>
            <Text style={s.pageTitle}>Blocked Accounts</Text>
            <View style={{ width: 36 }}/>
          </View>
          <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }}>
            <Text style={s.hint}>Blocked accounts cannot see your profile or posts, follow you, message you, or appear in your Live discovery. Unblocking does not automatically restore previous follows.</Text>
            {blockedAccountsLoading ? <Text style={s.hint}>Loading blocked accounts…</Text> :
              blockedAccounts.length === 0 ? <View style={{ alignItems: 'center', paddingVertical: 48, gap: 10 }}><Ionicons name="shield-checkmark-outline" size={42} color={C.cyan}/><Text style={s.sectionTitle}>No blocked accounts</Text><Text style={s.hint}>Accounts you block will appear here.</Text></View> :
              blockedAccounts.map(account => <View key={account.user_id} style={[s.personRow, { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border }]}>
                <View style={s.personDetails}><Text style={s.personName}>{account.display_name || account.username}</Text><Text style={s.personUsername}>@{account.username.replace(/[@#]/g, '')}</Text></View>
                <Pressable disabled={unblockingUserId === account.user_id} onPress={() => void unblockAccount(account)} style={[s.followButton, s.followingButton]}><Text style={s.followingButtonText}>{unblockingUserId === account.user_id ? 'Please wait…' : 'Unblock'}</Text></Pressable>
              </View>)}
          </ScrollView>
        </View>
      </Modal>
      <Modal visible={!!reportPost} transparent animationType="fade" onRequestClose={() => setReportPost(null)}>
        <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 20 }}>
          <View style={[s.card, { maxHeight: '82%', padding: 18 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={s.sectionTitle}>Report post</Text>
              <Pressable onPress={() => setReportPost(null)} accessibilityRole="button" accessibilityLabel="Close report form" style={{ padding: 6 }}>
                <Ionicons name="close" size={22} color={C.text}/>
              </Pressable>
            </View>
            <Text style={s.hint}>Choose the reason that best describes the issue. Your report is private.</Text>
            <ScrollView style={{ marginTop: 10 }} keyboardShouldPersistTaps="handled">
              {([
                ['spam', 'Spam or misleading'],
                ['harassment', 'Harassment or bullying'],
                ['hate', 'Hate or hateful conduct'],
                ['violence', 'Violence or dangerous acts'],
                ['nudity', 'Nudity or sexual content'],
                ['scam', 'Scam or fraud'],
                ['copyright', 'Copyright concern'],
                ['other', 'Other'],
              ] as const).map(([reason, label]) => (
                <Pressable key={reason} disabled={!reportPost || reportBusyIds.includes(reportPost.id)} onPress={() => {
                  const target = reportPost;
                  setReportPost(null);
                  if (target) void submitPostReport(target, reason);
                }} style={{ paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.border }}>
                  <Text style={s.infoText}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {reportPost && reportBusyIds.includes(reportPost.id) && <Text style={s.hint}>Submitting report…</Text>}
          </View>
        </View>
      </Modal>
      <Modal visible={legalVisible} animationType="slide" onRequestClose={() => setLegalVisible(false)}>
        <View style={{ flex:  1, backgroundColor: C.bg }}>
          <View style={{ paddingTop: Platform.OS === 'ios' ? 52 : 18, paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View><Text style={s.pageTitle}>Policies & Terms</Text><Text style={s.hint}>MEEi community and account rules</Text></View>
            <Pressable onPress={() => setLegalVisible(false)} style={{ padding: 8 }}><Ionicons name="close" size={25} color={C.text}/></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 36, gap: 18 }}>
            <Text style={s.hint}>Draft for review · Last updated: 25 November 2026 · These terms must be reviewed by qualified legal counsel before public launch.</Text>
            <View style={s.card}>
              <Text style={s.sectionTitle}>1. Acceptance and eligibility</Text>
              <Text style={s.infoText}>By creating an account or using MEEi, you agree to these Terms, our Privacy Policy and Community Guidelines. You must meet the minimum age required by applicable law and the age shown at sign-up. Do not use MEEi if you are not legally permitted to do so. You are responsible for accurate account information and keeping your login credentials secure.</Text>
            </View>
            <View style={s.card}>
              <Text style={s.sectionTitle}>2. Respectful community and prohibited conduct</Text>
              <Text style={s.infoText}>Do not post, stream, send or promote illegal content, threats, harassment, hate, bullying, sexual exploitation, child sexual abuse material, non-consensual intimate imagery, impersonation, scams, spam, malware, violence or content that infringes another person’s rights. Do not stalk, dox, manipulate, exploit or deceive other users. Do not use MEEi to arrange unlawful activity or evade safety controls.</Text>
            </View>
            <View style={s.card}>
              <Text style={s.sectionTitle}>3. Live streaming, chat and moderation</Text>
              <Text style={s.infoText}>Creators are responsible for their streams and must have the rights and permissions needed for people and material shown. MEEi may review reports, remove content, restrict features, mute, suspend or terminate accounts where reasonably necessary for safety, legal compliance or these rules. Creators and moderators must use moderation tools responsibly. Blocking, muting or kicking a viewer does not replace reporting urgent threats to the relevant authorities.</Text>
            </View>
            <View style={s.card}>
              <Text style={s.sectionTitle}>4. User content and permissions</Text>
              <Text style={s.infoText}>You retain ownership of content you create. You grant MEEi a non-exclusive, worldwide, royalty-free licence to host, store, reproduce, process, display and distribute that content only as needed to operate, secure, improve and promote the service, subject to your settings and applicable law. You confirm you have the necessary rights and consent. You can delete content, but copies may remain temporarily in backups, recipients’ devices or where retention is legally required.</Text>
            </View>
            <View style={s.card}>
              <Text style={s.sectionTitle}>5. Privacy and personal information</Text>
              <Text style={s.infoText}>MEEi processes account details, profile content, messages, device and usage information, safety reports and transaction records to provide and protect the service. We do not display private contact details publicly by default. Payment card data should be handled by the payment provider and not stored by MEEi. We may share necessary information with service providers, payment partners, authorities or others where required by law or to protect users and the service. The final Privacy Policy must identify the actual data collected, purposes, retention periods, grievance contact and user rights.</Text>
            </View>
            <View style={s.card}>
              <Text style={s.sectionTitle}>6. Diamonds, gifts and payments</Text>
              <Text style={s.infoText}>Diamonds and virtual gifts are digital features, not cash, deposits, securities or property, and cannot be withdrawn, transferred or exchanged for money unless MEEi expressly enables this in writing and applicable law permits it. Prices, applicable taxes, pack contents and payment terms will be shown before purchase. Payments are processed by authorised payment partners using their supported card, UPI and authentication flows. Never share your card PIN, UPI PIN or bank OTP with another person or with MEEi support.</Text>
              <Text style={[s.infoText, { marginTop: 8 }]}>After a successful payment, diamonds will be credited only after server-side confirmation from the payment provider. Failed, pending, duplicate or reversed payments will be handled according to the provider’s status and applicable law. Digital purchases are generally final once delivered, except where a refund, cancellation or remedy is required by applicable law, payment-network rules or a verified billing error. Nothing here removes your right to raise a genuine bank or payment-provider dispute. MEEi may submit transaction and delivery evidence to contest fraudulent or inaccurate claims.</Text>
              <Text style={[s.infoText, { marginTop: 8 }]}>MEEi’s in-app purchase complaint window for a user-initiated transaction is limited to a rolling 30-day period from the transaction date; this is not a calendar month. When MEEi receives a payment dispute or chargeback notice, it may immediately place a temporary hold on Beans in the wallets of every creator who received gifts funded by that payer’s transactions during the 30 days immediately before the dispute notice. The hold will be limited to the Beans attributable to those gifts and will remain only while the related review is active. Unrelated wallet balances remain available. If some attributable Beans have already been spent or are unavailable, MEEi may record the outstanding amount for review and apply any recovery only as permitted by applicable law and the Creator Terms. Once the review is completed, MEEi will release the hold or make an evidence-based adjustment consistent with the outcome.</Text>
              <Text style={[s.infoText, { marginTop: 8 }]}>The 30-day period describes MEEi’s in-app complaint window and the transaction look-back used for this temporary creator-Bean hold. It does not shorten, waive or restrict any statutory consumer rights, card-network deadlines, or a user’s right to contact their bank, card issuer or payment provider about an eligible transaction outside that period. MEEi will assess such external notices under applicable law and payment-provider rules.</Text>
              <Text style={[s.infoText, { marginTop: 8 }]}>Free gifts may have daily limits and may change or reset. MEEi may change virtual-item prices, availability or features prospectively. Do not buy diamonds for another person unless you have verified the correct username. MEEi cannot guarantee recovery of gifts sent to the wrong account.</Text>
            </View>
            <View style={s.card}>
              <Text style={s.sectionTitle}>7. Creator earnings and payouts</Text>
              <Text style={s.infoText}>Any creator rewards, balances, eligibility criteria, fees, tax treatment, minimum payout and payout schedule will be governed by separate creator terms shown before participation. Earnings may be held for security checks, refunds, reversals, chargebacks, suspected fraud or legal compliance. No creator payout is guaranteed unless it has been approved under the applicable payout rules.</Text>
            </View>
            <View style={s.card}>
              <Text style={s.sectionTitle}>8. Account security, suspension and closure</Text>
              <Text style={s.infoText}>Keep your account secure and tell us promptly if you suspect unauthorised access. Do not sell, rent or share accounts. MEEi may apply warnings, feature limits, temporary suspension or account termination for serious or repeated violations, subject to applicable law and any required notice or appeal process. You may stop using MEEi and request account deletion through the available account controls or support channel.</Text>
            </View>
            <View style={s.card}>
              <Text style={s.sectionTitle}>9. Third-party services and availability</Text>
              <Text style={s.infoText}>MEEi may rely on third-party hosting, streaming, app stores, payment providers and networks. Their terms may also apply. We work to keep MEEi available and secure but do not promise uninterrupted or error-free service. Features may change, be paused or be discontinued for maintenance, safety, legal or business reasons.</Text>
            </View>
            <View style={s.card}>
              <Text style={s.sectionTitle}>10. Disclaimers and liability</Text>
              <Text style={s.infoText}>To the extent permitted by law, MEEi is provided on an as-available basis. We are not responsible for users’ statements, off-platform conduct, third-party services or content you choose to access. Nothing in these terms excludes liability that cannot legally be excluded, including rights and remedies available to consumers under applicable law.</Text>
            </View>
            <View style={s.card}>
              <Text style={s.sectionTitle}>11. Changes and governing law</Text>
              <Text style={s.infoText}>We may update these terms and will provide notice where required. Continued use after an effective update means you accept the revised terms to the extent permitted by law. The governing law, courts, registered business details and dispute-resolution process must be completed with MEEi’s actual legal entity and reviewed by counsel before launch; mandatory consumer protections remain unaffected.</Text>
            </View>
            <View style={s.card}>
              <Text style={s.sectionTitle}>12. Contact and grievance support</Text>
              <Text style={s.infoText}>For safety reports, privacy requests, account issues, payment disputes or complaints, use the in-app Help/Report option. Before launch, MEEi must publish its verified legal entity name, registered address, support email, grievance officer name and contact details, and response timelines required by applicable law. Do not rely on placeholder contact details.</Text>
            </View>
            <View style={s.card}>
              <Text style={s.sectionTitle}>Community Guidelines — quick rules</Text>
              <Text style={s.infoText}>Be respectful. Get consent before sharing someone’s image, voice or personal information. Keep children safe. No harassment, hate, threats, scams, impersonation or illegal content. Respect copyright. Do not manipulate gifts, diamonds, creator rewards or payment systems. Report harmful behaviour and cooperate with safety reviews.</Text>
            </View>
            <Text style={s.hint}>Important: This is an initial product-policy draft, not legal advice. Before release, have an India-qualified lawyer review it and complete MEEi’s real company, grievance, privacy, retention, refund and jurisdiction details. App behaviour must match the published policy.</Text>
          </ScrollView>
        </View>
      </Modal>
      <Modal visible={createMenuVisible} transparent animationType="slide" onRequestClose={() => setCreateMenuVisible(false)}>
        <Pressable style={s.createMenuBackdrop} onPress={() => setCreateMenuVisible(false)}>
          <Pressable style={s.createMenuSheet} onPress={() => {}}>
            <View style={s.createMenuHandle}/>
            <View style={s.createMenuHeader}>
              <View><Text style={s.sectionTitle}>Create on MEEi</Text><Text style={s.hint}>Share a moment or start a live session</Text></View>
              <Pressable onPress={() => setCreateMenuVisible(false)}><Ionicons name="close-circle" size={25} color={C.muted}/></Pressable>
            </View>
            <Pressable style={s.createMenuOption} onPress={() => { setCreateMenuVisible(false); setCreateCategory('reels'); setCreateMedia(null); setCreateCaption(''); setSelectedProfile(null); setTab('Create'); }}>
              <View style={[s.createMenuIcon,{backgroundColor:'#EAF5FF'}]}><Ionicons name="videocam" size={23} color={C.cyan}/></View>
              <View style={s.createMenuText}><Text style={s.createMenuTitle}>Create Reel</Text><Text style={s.createMenuSubtitle}>Make and publish a short video</Text></View>
              <Ionicons name="chevron-forward" size={18} color={C.muted}/>
            </Pressable>
            <Pressable style={s.createMenuOption} onPress={() => { setCreateMenuVisible(false); setLiveJoinSessionId(null); setLiveStudioVisible(true); }}>
              <View style={[s.createMenuIcon,{backgroundColor:'#FFF0F0'}]}><Ionicons name="radio" size={23} color="#E34D59"/></View>
              <View style={s.createMenuText}><Text style={s.createMenuTitle}>Go Live</Text><Text style={s.createMenuSubtitle}>Start a live video with your audience</Text></View>
              <Ionicons name="chevron-forward" size={18} color={C.muted}/>
            </Pressable>
            <Pressable style={s.createMenuOption} onPress={() => { setCreateMenuVisible(false); setCreateCategory('videos'); setCreateMedia(null); setCreateCaption(''); setSelectedProfile(null); setTab('Create'); }}>
              <View style={[s.createMenuIcon,{backgroundColor:'#EAFBF3'}]}><Ionicons name="images" size={23} color="#239B68"/></View>
              <View style={s.createMenuText}><Text style={s.createMenuTitle}>Create Post</Text><Text style={s.createMenuSubtitle}>Share a photo or a longer video</Text></View>
              <Ionicons name="chevron-forward" size={18} color={C.muted}/>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
        <View style={s.modalShade}><ScrollView style={s.editSheet} contentContainerStyle={{paddingBottom:28}}>
          <View style={s.modalTop}><Text style={s.sectionTitle}>Edit Profile</Text><Pressable onPress={() => setEditing(false)}><Ionicons name="close" size={24} color={C.text}/></Pressable></View>
          <Text style={s.fieldLabel}>Account type</Text>
          <View style={s.activityGrid}>
            <Pressable onPress={() => setAccountType('personal')} style={[s.activityChip,accountType==='personal'&&s.activityActive]}><Text style={[s.activityText,accountType==='personal'&&{color:C.cyan}]}>Personal</Text></Pressable>
            <Pressable onPress={() => setAccountType('business')} style={[s.activityChip,accountType==='business'&&s.activityActive]}><Text style={[s.activityText,accountType==='business'&&{color:C.cyan}]}>Professional / Business</Text></Pressable>
          </View>
          {accountType === 'business' && <>
            <Text style={s.hint}>Switch to a professional business account for a business-focused public profile. This is free and does not grant a paid verification badge.</Text>
            {[[businessName,setBusinessName,'Business name'],[businessCategory,setBusinessCategory,'Business category'],[businessDescription,setBusinessDescription,'Business description']].map(([value,setter,label]:any) =>
              <View key={label} style={s.field}><Text style={s.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={setter} placeholder={label} placeholderTextColor={C.muted} style={s.input} multiline={label==='Business description'} /></View>
            )}
          </>}
          {[[name,setName,'Display name'],[username,setUsername,'Username'],[bio,setBio,'Bio'],[website,setWebsite,'Website'],[occupation,setOccupation,'Occupation']].map(([value,setter,label]:any) =>
            <View key={label} style={s.field}><Text style={s.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={setter} placeholder={label} placeholderTextColor={C.muted} style={s.input} multiline={label==='Bio'} /></View>
          )}
          <Text style={s.hint}>Username: 3–25 lowercase letters, numbers or underscores. Bio: up to 300 characters.</Text>
          <View style={s.field}>
            <Text style={s.fieldLabel}>Home country / registered country</Text>
            <Text style={s.hint}>This is your profile country. Live discovery country filters do not change it.</Text>
            <TextInput value={homeCountrySearch} onChangeText={setHomeCountrySearch} placeholder={homeCountryName || 'Search country'} placeholderTextColor={C.muted} style={s.input}/>
            <View style={s.activityGrid}>
              {MEEI_COUNTRY_CODES.map(code => ({code,name:getCountryDisplayName(code,'en')}))
                .filter(country => !homeCountrySearch.trim() || country.name.toLowerCase().includes(homeCountrySearch.trim().toLowerCase()) || country.code.toLowerCase() === homeCountrySearch.trim().toLowerCase())
                .slice(0,8)
                .map(country => <Pressable key={country.code} onPress={() => {setHomeCountryCode(country.code);setHomeCountryName(country.name);setHomeCountrySearch('');}} style={[s.activityChip,homeCountryCode===country.code&&s.activityActive]}><Text style={[s.activityText,homeCountryCode===country.code&&{color:C.cyan}]}>{country.name}</Text></Pressable>)}
            </View>
            <Text style={s.hint}>Selected: {homeCountryName}</Text>
          </View>
          <Text style={s.fieldLabel}>Account privacy</Text>
          <View style={s.activityGrid}>
            <Pressable onPress={() => setIsPrivateAccount(false)} style={[s.activityChip,!isPrivateAccount&&s.activityActive]}><Text style={[s.activityText,!isPrivateAccount&&{color:C.cyan}]}>Public account</Text></Pressable>
            <Pressable onPress={() => setIsPrivateAccount(true)} style={[s.activityChip,isPrivateAccount&&s.activityActive]}><Text style={[s.activityText,isPrivateAccount&&{color:C.cyan}]}>Private account</Text></Pressable>
          </View>
          <Text style={s.hint}>{isPrivateAccount ? 'New followers must be approved before they can view your private content.' : 'Anyone signed in can discover and follow your public profile.'}</Text>
          <Text style={s.fieldLabel}>Activity status</Text>
          <View style={s.activityGrid}>{['Available','Busy','Work','Drive','Gym','School','College'].map(x=><Pressable key={x} onPress={()=>setActivity(x)} style={[s.activityChip,activity===x&&s.activityActive]}><Text style={[s.activityText,activity===x&&{color:C.cyan}]}>{x}</Text></Pressable>)}</View>
          <Pressable style={[s.primary, savingProfile && { opacity: 0.6 }]} disabled={savingProfile} onPress={saveProfile}><Text style={s.primaryText}>{savingProfile ? 'Saving…' : 'Save profile'}</Text></Pressable>
        </ScrollView></View>
      </Modal>
      <Modal visible={coverExpanded} transparent animationType="fade" onRequestClose={()=>setCoverExpanded(false)}>
        <View style={s.coverViewer}>
          <Pressable style={s.coverViewerClose} onPress={() => setCoverExpanded(false)}><Ionicons name="close" size={26} color="#FFFFFF"/></Pressable>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {covers.map((m, i) => <View key={i} style={{width, height:'100%', alignItems:'center', justifyContent:'center'}}>
              <CoverMediaSlide media={m} />
            </View>)}
          </ScrollView>
        </View>
      </Modal>
      <Modal visible={otherCoverExpanded} transparent animationType="fade" onRequestClose={()=>setOtherCoverExpanded(false)}>
        <View style={s.coverViewer}>
          <Pressable style={s.coverViewerClose} onPress={() => setOtherCoverExpanded(false)}><Ionicons name="close" size={26} color="#FFFFFF"/></Pressable>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {otherProfileMedia.covers.map((m, i) => <View key={i} style={{width, height:'100%', alignItems:'center', justifyContent:'center'}}><CoverMediaSlide media={m}/></View>)}
          </ScrollView>
        </View>
      </Modal>
      <Modal visible={!!commentPost} transparent animationType="slide" onRequestClose={()=>setCommentPost(null)}>
        <View style={s.commentsBackdrop}>
          <View style={s.commentsSheet}>
            <View style={s.commentsHeader}>
              <Text style={s.sectionTitle}>Comments</Text>
              <Pressable onPress={() => setCommentPost(null)}><Ionicons name="close" size={24} color={C.text}/></Pressable>
            </View>
            {!!commentPost?.caption && <Text style={s.commentsPostCaption} numberOfLines={2}>{commentPost.caption}</Text>}
            <ScrollView style={s.commentsList} contentContainerStyle={{ gap: 13, paddingVertical: 10 }} keyboardShouldPersistTaps="handled">
              {commentsLoading ? <Text style={s.hint}>Loading comments…</Text> : postComments.length ? postComments.map(comment => (
                <View key={comment.id} style={s.commentRow}>
                  <View style={s.commentAvatar}><Text style={s.commentAvatarText}>{(comment.display_name || 'U').slice(0,1).toUpperCase()}</Text></View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.commentAuthor}>{comment.display_name} <Text style={s.commentUsername}>{comment.username.replace(/[@#]/g, '')}</Text></Text>
                    <Text style={s.commentBody}>{comment.body}</Text>
                  </View>
                </View>
              )) : <Text style={s.hint}>No comments yet. Be the first to comment.</Text>}
            </ScrollView>
            <View style={s.commentComposer}>
              <TextInput value={commentDraft} onChangeText={setCommentDraft} placeholder="Write a comment…" placeholderTextColor={C.muted} multiline maxLength={2000} style={s.commentInput}/>
              <Pressable onPress={() => void sendPostComment()} disabled={!commentDraft.trim() || commentSending} style={[s.commentSend, (!commentDraft.trim() || commentSending) && { opacity: 0.45 }]}>
                <Ionicons name="send" size={18} color="#FFFFFF"/>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <PostReactionPicker visible={!!reactionPostId} onClose={() => setReactionPostId(null)} onSelect={emoji => { if (reactionPostId) void togglePostReaction(reactionPostId, emoji); }}/>
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={()=>setViewer(null)}>
        <View style={s.viewer}><Pressable style={s.viewerClose} onPress={()=>setViewer(null)}><Ionicons name="close" size={26} color="#fff"/></Pressable>
          {viewer?.type === 'image' && !viewer.unavailable && !!viewer.uri
            ? <Image source={{uri:viewer.uri}} resizeMode="contain" style={{width:'100%',height:'82%'}}/>
            : viewer ? <CoverMediaSlide media={viewer}/> : null}
        </View>
      </Modal>
    </View>
  );
}

let s: any;
const createStyles = (palette: typeof LIGHT_C) => {
  const C = palette;
  return StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg}, scroll:{padding:16,paddingBottom:22,gap:14},
  discoverScroll:{padding:20,paddingTop:54,paddingBottom:30,gap:14},
  feedScroll:{paddingHorizontal:14,paddingTop:48,paddingBottom:28,gap:14},
  feedHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  feedComposer:{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderRadius:16,backgroundColor:C.panel,borderWidth:1,borderColor:C.border},
  feedPost:{backgroundColor:C.panel,borderRadius:18,borderWidth:1,borderColor:C.border,padding:12,gap:10},
  feedPostHeader:{flexDirection:'row',alignItems:'center',gap:8},feedFollowButton:{paddingHorizontal:12,paddingVertical:7,borderRadius:10,backgroundColor:'#EAF5FF'},feedFollowText:{color:C.cyan,fontSize:11,fontWeight:'800'},feedCaption:{color:C.text,fontSize:13,lineHeight:19},
  feedMedia:{width:'100%',height:340,borderRadius:13,backgroundColor:'#EAF5FF'},
  feedActions:{flexDirection:'row',alignItems:'center',gap:17,paddingTop:2},feedAction:{flexDirection:'row',alignItems:'center',gap:5,paddingVertical:5},feedActionText:{color:C.text,fontSize:11,fontWeight:'700'},
  longVideosScroll:{padding:18,paddingTop:50,paddingBottom:30,gap:14},
  longVideoCard:{flexDirection:'row',alignItems:'center',gap:12,padding:10,borderRadius:16,borderWidth:1,borderColor:C.border,backgroundColor:C.panel},
  longVideoThumb:{width:132,height:90,borderRadius:11,backgroundColor:'#EAF5FF'},longVideoThumbFallback:{width:132,height:90,borderRadius:11,backgroundColor:'#78B9DD',alignItems:'center',justifyContent:'center'},
  searchHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  searchSubtitle:{color:C.muted,fontSize:12,marginTop:3},
  searchHeaderIcon:{width:42,height:42,borderRadius:21,backgroundColor:'#EAF5FF',alignItems:'center',justifyContent:'center'},
  reelsSectionHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:2},
  reelsCount:{color:C.muted,fontSize:11,fontWeight:'700'},
  reelsGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:10},
  reelTile:{width:'48.7%',aspectRatio:.72,borderRadius:14,overflow:'hidden',backgroundColor:'#79B9DD'},
  reelTileVideo:{width:'100%',height:'100%'},
  reelTileFallback:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#79B9DD'},
  reelTileShade:{...StyleSheet.absoluteFillObject,backgroundColor:'transparent'},
  reelTilePlay:{position:'absolute',top:9,right:9,width:25,height:25,borderRadius:13,backgroundColor:'#0006',alignItems:'center',justifyContent:'center'},
  reelTileInfo:{position:'absolute',left:9,right:8,bottom:9,gap:4},
  reelTileCaption:{color:'#FFFFFF',fontSize:11,fontWeight:'800',textShadowColor:'#0009',textShadowRadius:5},
  reelTileViews:{flexDirection:'row',alignItems:'center',gap:4},
  reelTileViewsText:{color:'#FFFFFF',fontSize:10,fontWeight:'700'},
  searchEmpty:{minHeight:180,alignItems:'center',justifyContent:'center',gap:8},
  liveScroll:{padding:18,paddingTop:54,paddingBottom:30,gap:16},
  liveMainTitle:{color:C.text,fontSize:27,fontWeight:'900',letterSpacing:0.4},
  liveExploreTitle:{color:C.text,fontSize:20,fontWeight:'900',letterSpacing:0.3},
  liveExploreMeta:{color:C.muted,fontSize:11,fontWeight:'600'},
  liveSectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:4},
  liveSectionTitle:{color:C.text,fontSize:16,fontWeight:'800'},
  liveMoreText:{color:C.text,fontSize:13,fontWeight:'700'},
  liveFeaturedGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:17,marginTop:3},
  liveFeaturedCountry:{width:'23%',alignItems:'center',gap:7,paddingVertical:5},
  liveFeaturedFlag:{fontSize:34},
  liveFeaturedName:{color:C.text,fontSize:12,fontWeight:'600',textAlign:'center'},
  liveContinentTitle:{color:C.text,fontSize:16,fontWeight:'900',letterSpacing:1.1,marginTop:5},
  liveAllCountriesGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:12},
  liveAllCountryItem:{width:'31%',minHeight:70,alignItems:'center',justifyContent:'center',gap:5,padding:7,borderRadius:12,backgroundColor:C.panel2,borderWidth:1,borderColor:C.border},
  liveAllCountryFlag:{fontSize:25},
  liveAllCountryName:{color:C.text,fontSize:11,fontWeight:'600',textAlign:'center'},
  liveHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  livePulse:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10,paddingVertical:7,borderRadius:16,backgroundColor:'#FFF0F1'},
  livePulseDot:{width:7,height:7,borderRadius:4,backgroundColor:'#E54862'},
  livePulseText:{color:'#D93650',fontSize:9,fontWeight:'900',letterSpacing:.7},
  liveCountries:{gap:8,paddingVertical:2},
  liveCountryChip:{paddingHorizontal:14,paddingVertical:9,borderRadius:18,borderWidth:1,borderColor:C.border,backgroundColor:C.panel},
  liveCountryChipActive:{backgroundColor:'#EAF5FF',borderColor:'#9DD6F4'},
  liveCountryText:{color:C.muted,fontSize:11,fontWeight:'700'},
  liveCountryTextActive:{color:C.cyan},
  liveEmpty:{minHeight:300,alignItems:'center',justifyContent:'center',gap:10,paddingHorizontal:24},
  liveEmptyIcon:{width:78,height:78,borderRadius:39,backgroundColor:'#EAF5FF',alignItems:'center',justifyContent:'center',marginBottom:4},
  liveGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:12},
  liveCard:{width:'48.5%',aspectRatio:.78,borderRadius:16,overflow:'hidden',backgroundColor:'#76B8DA'},
  liveCardImage:{width:'100%',height:'100%'},
  liveCardFallback:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#6FAFD0'},
  liveCardShade:{...StyleSheet.absoluteFillObject,backgroundColor:'#061A2B30'},
  liveBadge:{position:'absolute',top:9,left:9,flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:8,paddingVertical:5,borderRadius:7,backgroundColor:'#E33F56'},
  liveBadgeDot:{width:5,height:5,borderRadius:3,backgroundColor:'#FFFFFF'},
  liveBadgeText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},
  liveCardInfo:{position:'absolute',left:10,right:8,bottom:10,gap:3},
  liveCardName:{color:'#FFFFFF',fontSize:13,fontWeight:'900'},
  liveCardMeta:{color:'#FFFFFF',fontSize:9,fontWeight:'700'},
  liveCardTitle:{color:'#FFFFFF',fontSize:10,textShadowColor:'#000A',textShadowRadius:4},
  searchBox:{minHeight:48,borderWidth:1,borderColor:C.border,borderRadius:14,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:9,backgroundColor:C.panel2},
  searchInput:{flex:1,color:C.text,fontSize:14,paddingVertical:10},searchCategories:{gap:8,paddingVertical:3},
  searchCategory:{paddingHorizontal:15,paddingVertical:9,borderRadius:20,borderWidth:1,borderColor:C.border,backgroundColor:C.panel},
  searchCategoryActive:{backgroundColor:'#EAF5FF',borderColor:'#9DD6F4'},searchCategoryText:{color:C.muted,fontSize:12,fontWeight:'700'},searchCategoryTextActive:{color:C.cyan},
  videoSearchRow:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:10,borderBottomWidth:1,borderBottomColor:C.border},
  videoSearchThumb:{width:78,height:88,borderRadius:12,backgroundColor:'#7BBCE0',alignItems:'center',justifyContent:'center'},
  searchComingSoon:{alignItems:'center',justifyContent:'center',paddingVertical:45,gap:10},
  personRow:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:12,borderBottomWidth:1,borderBottomColor:C.border},
  personAvatar:{width:46,height:46,borderRadius:23,backgroundColor:'#EAF5FF',alignItems:'center',justifyContent:'center'},
  personDetails:{flex:1,gap:2},personName:{color:C.text,fontSize:14,fontWeight:'800'},personUsername:{color:C.muted,fontSize:11},personBio:{color:'#526B7D',fontSize:11},
  followButton:{minWidth:84,paddingHorizontal:12,paddingVertical:9,borderRadius:10,backgroundColor:C.pink,alignItems:'center'},
  followingButton:{backgroundColor:'#EAF5FF',borderWidth:1,borderColor:'#CDE8FA'},
  followButtonText:{color:'#FFFFFF',fontSize:11,fontWeight:'800'},followingButtonText:{color:C.cyan},
  profileScroll:{paddingBottom:24,gap:0}, profileBody:{paddingHorizontal:16,gap:16},
  coverCarousel:{height:190,width:'100%',backgroundColor:C.panel2},
  coverSlide:{height:190,alignItems:'center',justifyContent:'center',backgroundColor:C.panel2,overflow:'hidden'},
  coverImage:{width:'100%',height:'100%',resizeMode:'cover'},
  coverVideo:{width:'100%',height:'100%',alignItems:'center',justifyContent:'center',backgroundColor:'#6FAFD0',gap:6},
  coverVideoText:{color:'#FFFFFF',fontSize:10,fontWeight:'900',letterSpacing:1},
  coverEmpty:{backgroundColor:'#EAF5FF',gap:8},coverEmptyText:{color:C.cyan,fontSize:12,fontWeight:'800'},
  coverRemove:{position:'absolute',top:12,right:14,width:30,height:30,borderRadius:15,backgroundColor:'#0008',alignItems:'center',justifyContent:'center'},
  dragHint:{color:C.muted,fontSize:10,marginTop:9},section:{backgroundColor:C.panel,borderRadius:18,padding:14,gap:12,borderWidth:1,borderColor:C.border},
  sectionHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  coverViewer:{flex:1,backgroundColor:'#03050A',justifyContent:'center'},
  coverViewerClose:{position:'absolute',top:48,right:18,zIndex:3,width:42,height:42,borderRadius:22,backgroundColor:'#263442',alignItems:'center',justifyContent:'center'},
  top:{height:104,flexDirection:'row',alignItems:'center',justifyContent:'center',paddingHorizontal:16},
  pageTitle:{color:C.text,fontSize:30,fontWeight:'900',fontFamily:'serif',letterSpacing:2.8},switchText:{color:C.cyan,fontSize:11,fontWeight:'700'},
  card:{backgroundColor:C.panel,borderRadius:22,borderWidth:1,borderColor:C.border,padding:15,gap:12},
  coverHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  eyebrow:{color:C.cyan,fontSize:9,fontWeight:'900',letterSpacing:1.5},sectionTitle:{color:C.text,fontSize:16,fontWeight:'900'},
  mutedSmall:{color:C.muted,fontSize:11,marginTop:3},coverCount:{color:C.cyan,fontWeight:'800',fontSize:12},
  businessTag:{flexDirection:'row',alignItems:'center',gap:5,marginTop:5,paddingHorizontal:10,paddingVertical:5,borderRadius:12,backgroundColor:'#EAF5FF'},businessTagText:{color:C.cyan,fontSize:10,fontWeight:'800'},businessInfo:{alignItems:'center',gap:4,marginTop:7,maxWidth:'90%'},businessName:{color:C.text,fontSize:15,fontWeight:'900'},
  commentsBackdrop:{flex:1,backgroundColor:'#0007',justifyContent:'flex-end'},commentsSheet:{height:'72%',backgroundColor:C.panel,borderTopLeftRadius:22,borderTopRightRadius:22,paddingHorizontal:18,paddingTop:16,paddingBottom:20},commentsHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingBottom:10,borderBottomWidth:1,borderBottomColor:C.border},commentsPostCaption:{color:C.muted,fontSize:12,paddingTop:9},commentsList:{flex:1},commentRow:{flexDirection:'row',alignItems:'flex-start',gap:10},commentAvatar:{width:32,height:32,borderRadius:16,backgroundColor:'#EAF5FF',alignItems:'center',justifyContent:'center'},commentAvatarText:{color:C.cyan,fontSize:13,fontWeight:'800'},commentAuthor:{color:C.text,fontSize:12,fontWeight:'800'},commentUsername:{color:C.muted,fontSize:10,fontWeight:'500'},commentBody:{color:C.text,fontSize:13,lineHeight:18},commentComposer:{flexDirection:'row',alignItems:'center',gap:9,borderTopWidth:1,borderTopColor:C.border,paddingTop:10},commentInput:{flex:1,minHeight:42,maxHeight:92,borderWidth:1,borderColor:C.border,borderRadius:16,paddingHorizontal:13,paddingVertical:9,color:C.text,fontSize:13},commentSend:{width:40,height:40,borderRadius:20,backgroundColor:C.cyan,alignItems:'center',justifyContent:'center'},
  mediaRow:{flexDirection:'row',gap:8},publishedTile:{width:118,gap:5},publishedImage:{width:118,height:132,borderRadius:12,backgroundColor:'#EAF5FF'},publishedVideo:{width:118,height:132,borderRadius:12,backgroundColor:'#6FAFD0',alignItems:'center',justifyContent:'center',gap:4},publishedCaption:{color:C.muted,fontSize:10,lineHeight:14},tile:{flex:1,aspectRatio:.9,borderRadius:13,borderWidth:1,borderColor:'#D8EAF7',borderStyle:'dashed',backgroundColor:C.panel2,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  tileImage:{width:'100%',height:'100%'},tileLabel:{color:C.muted,fontSize:10,marginTop:5,fontWeight:'700'},
  videoTile:{alignItems:'center',justifyContent:'center',gap:4},videoText:{color:C.cyan,fontSize:9,fontWeight:'900'},
  remove:{position:'absolute',top:5,right:5,width:23,height:23,borderRadius:12,backgroundColor:'#0009',alignItems:'center',justifyContent:'center'},
  hint:{color:C.muted,fontSize:10,lineHeight:15},identity:{alignItems:'center',paddingTop:76,paddingBottom:20,position:'relative',overflow:'hidden'},
  coverBackdrop:{position:'absolute',top:0,left:0,right:0,height:190,backgroundColor:'#B9E2F8',overflow:'hidden'},
  coverBackdropImage:{width:'100%',height:'100%',resizeMode:'cover'},
  coverBackdropVideo:{width:'100%',height:'100%',backgroundColor:'#70B6D8',alignItems:'center',justifyContent:'center'},
  coverBackdropEmpty:{flex:1,backgroundColor:'#D9F0FF'},
  coverBackdropShade:{...StyleSheet.absoluteFillObject,backgroundColor:'#173A4A18'},
  coverEdit:{position:'absolute',right:14,top:10,width:30,height:30,borderRadius:16,backgroundColor:'#173A4A99',alignItems:'center',justifyContent:'center',zIndex:2},
  coverViewTap:{position:'absolute',left:0,top:0,width:'80%',height:'100%'},
  avatarWrap:{width:98,height:98,borderRadius:50,borderWidth:4,borderColor:C.panel,padding:2,marginBottom:10,backgroundColor:C.panel},
  avatar:{width:'100%',height:'100%',borderRadius:44},avatarFallback:{flex:1,borderRadius:44,backgroundColor:C.panel2,alignItems:'center',justifyContent:'center'},
  camera:{position:'absolute',right:-1,bottom:0,width:27,height:27,borderRadius:14,backgroundColor:C.pink,borderWidth:2,borderColor:C.panel,alignItems:'center',justifyContent:'center'},
  nameLine:{flexDirection:'row',alignItems:'center',gap:6},name:{color:C.text,fontSize:21,fontWeight:'900'},
  verified:{width:17,height:17,borderRadius:9,backgroundColor:C.cyan,alignItems:'center',justifyContent:'center'},
  username:{color:C.muted,fontSize:12,marginTop:4},bio:{color:'#526B7D',fontSize:12,lineHeight:18,textAlign:'center',marginTop:8,maxWidth:310},
  websiteLine:{flexDirection:'row',alignItems:'center',gap:6,marginTop:8},website:{color:C.cyan,fontSize:12,fontWeight:'700'},
  stats:{flexDirection:'row',borderTopWidth:1,borderBottomWidth:1,borderColor:C.border,paddingVertical:14},
  stat:{flex:1,alignItems:'center'},statNum:{color:C.text,fontSize:17,fontWeight:'900'},statLabel:{color:C.muted,fontSize:10,marginTop:4},
  actions:{flexDirection:'row',gap:9},primary:{flex:1,minHeight:44,borderRadius:13,backgroundColor:C.pink,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7},
  primaryText:{color:'#fff',fontWeight:'800',fontSize:13},secondary:{flex:1,minHeight:44,borderRadius:13,backgroundColor:C.panel2,borderWidth:1,borderColor:C.border,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7},
  secondaryText:{color:C.text,fontSize:13,fontWeight:'800'},infoLine:{flexDirection:'row',alignItems:'center',gap:10},infoText:{color:'#526B7D',fontSize:12},
  footerNote:{color:C.muted,fontSize:10,lineHeight:15,paddingHorizontal:3},nav:{height:72,backgroundColor:C.panel,borderTopWidth:1,borderColor:C.border,flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingTop:2,paddingBottom:6},
  navItem:{flex:1,alignItems:'center',justifyContent:'center',gap:3,paddingBottom:8},navCreateItem:{flex:1,alignItems:'center',justifyContent:'center',gap:2,paddingBottom:3},navCreateButton:{width:45,height:42,borderRadius:15,backgroundColor:C.pink,alignItems:'center',justifyContent:'center',marginTop:-15,shadowColor:C.pink,shadowOpacity:0.24,shadowRadius:7,elevation:4},navLabel:{fontSize:9,color:C.muted,fontWeight:'700'},
  createMenuBackdrop:{flex:1,backgroundColor:'#0008',justifyContent:'flex-end'},createMenuSheet:{backgroundColor:C.panel,borderTopLeftRadius:25,borderTopRightRadius:25,paddingHorizontal:20,paddingTop:12,paddingBottom:30,gap:5},createMenuHandle:{width:42,height:4,borderRadius:3,backgroundColor:'#D8E1E8',alignSelf:'center',marginBottom:10},createMenuHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},createMenuOption:{flexDirection:'row',alignItems:'center',gap:13,paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#F0F3F5'},createMenuIcon:{width:46,height:46,borderRadius:15,alignItems:'center',justifyContent:'center'},createMenuText:{flex:1,gap:3},createMenuTitle:{color:C.text,fontSize:14,fontWeight:'900'},createMenuSubtitle:{color:C.muted,fontSize:11},
  simple:{flex:1,backgroundColor:C.bg,padding:20,paddingTop:55,gap:18},modalShade:{flex:1,backgroundColor:'#000B',justifyContent:'flex-end'},
  editSheet:{maxHeight:'90%',backgroundColor:C.panel,borderTopLeftRadius:24,borderTopRightRadius:24,padding:20},
  modalTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:16},
  field:{gap:6,marginBottom:13},fieldLabel:{color:C.cyan,fontSize:11,fontWeight:'800'},
  input:{backgroundColor:C.panel2,borderWidth:1,borderColor:C.border,borderRadius:12,padding:12,color:C.text,minHeight:44},
  activityGrid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginVertical:12},activityChip:{paddingHorizontal:12,paddingVertical:8,borderRadius:18,borderWidth:1,borderColor:C.border,backgroundColor:C.panel2},
  activityActive:{borderColor:C.cyan},activityText:{color:C.muted,fontSize:11,fontWeight:'700'},
  viewer:{flex:1,backgroundColor:'#03050A',alignItems:'center',justifyContent:'center',padding:18},
  viewerClose:{position:'absolute',top:48,right:20,zIndex:2,width:42,height:42,borderRadius:22,backgroundColor:C.panel,alignItems:'center',justifyContent:'center'},
  videoPreview:{alignItems:'center',gap:12,padding:25},
  createPicker:{minHeight:220,borderWidth:1,borderColor:C.border,borderStyle:'dashed',borderRadius:18,backgroundColor:C.panel2,alignItems:'center',justifyContent:'center',gap:9,overflow:'hidden'},
  createPreview:{width:'100%',height:260},createVideoPreview:{width:'100%',height:220,backgroundColor:'#6FAFD0',alignItems:'center',justifyContent:'center',gap:8},
  createRemove:{flexDirection:'row',alignItems:'center',gap:6,alignSelf:'flex-end'}, 
  });
};
s = createStyles(LIGHT_C);
