import React, { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import {
  Alert, Image, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Platform,
  Text, TextInput, View, useWindowDimensions, Animated, PanResponder
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { supabase } from './supabase';
import LiveBroadcastModal from './LiveBroadcastModal';

type Media = { uri: string; type: 'image' | 'video'; name?: string; size?: number; mimeType?: string; storagePath?: string };
type CloudMediaRow = { id: string; kind: 'avatar' | 'cover' | 'post'; position: number; storage_path: string; media_type: 'image' | 'video'; original_name: string | null; };
type Tab = 'Home' | 'Public' | 'Live' | 'Create' | 'Inbox' | 'Profile';
type SearchCategory = 'People' | 'Videos' | 'Reels' | 'Trending' | 'Funny' | 'Vlogs' | 'Cinema' | 'Creators';
type SearchVideo = { id: string; caption: string | null; media_path: string; created_at: string; user_id: string; content_category: string; like_count: number; view_count: number };
type LiveCreator = { session_id: string; user_id: string; username: string; display_name: string; profession_category: string | null; country_code: string; country_name: string; title: string; thumbnail_path: string | null; avatar_path: string | null; playback_url: string | null; started_at: string };
type PublishedPost = { id: string; post_type: 'photo' | 'video' | 'text'; caption: string | null; media_path: string | null; created_at: string; visibility: string; content_category: string | null; like_count: number; viewer_liked: boolean; comment_count: number; media: Media };
type PostComment = { id: string; post_id: string; user_id: string; body: string; created_at: string; username: string; display_name: string };
type PublicProfile = { id: string; username: string; display_name: string; bio: string | null; profession_category: string | null; website_url?: string | null; activity_status?: string | null; is_private?: boolean; account_type?: 'personal' | 'business'; business_name?: string | null; business_category?: string | null; business_description?: string | null };
type FollowRequest = { follower_id: string; username: string; display_name: string; requested_at: string };
type ChatMessage = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; read_at?: string | null; message_type?: 'text' | 'voice'; audio_path?: string | null; audio_url?: string | null; transcript?: string | null };
type ChatThread = { id: string; user_one_id: string; user_two_id: string; updated_at: string; unread_count?: number; otherUser: PublicProfile };

const CUCKOO_SOUND_FILE = 'cuckoo_default_natural.wav';
const CUCKOO_SOUND_CHANNEL = 'messages-cuckoo-sound';
const SILENT_MESSAGE_CHANNEL = 'messages-silent';
const NOTIFICATION_SOUND_KEY = '@cuckoo/message_notification_sound';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const C = {
  bg: '#FFFFFF', panel: '#FFFFFF', panel2: '#FFFFFF', text: '#172B3A',
  muted: '#777777', pink: '#258FEA', cyan: '#43B8E8', border: '#EEEEEE'
};

function SearchReelTile({ uri, caption, views, onPress }: { uri?: string; caption: string; views: number; onPress: () => void }) {
  const player = useVideoPlayer(uri || null, p => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    if (uri) player.play();
    return () => player.pause();
  }, [player, uri]);
  return <Pressable onPress={onPress} style={s.reelTile}>
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
  const player = useVideoPlayer(media.type === 'video' ? media.uri : null, p => { p.loop = true; });
  useEffect(() => {
    if (media.type === 'video') player.play();
    return () => { if (media.type === 'video') player.pause(); };
  }, [media.type, player]);
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

export default function App() {
  const [tab, setTab] = useState<Tab>('Profile');
  const [createMenuVisible, setCreateMenuVisible] = useState(false);
  const [legalVisible, setLegalVisible] = useState(false);
  const [liveStudioVisible, setLiveStudioVisible] = useState(false);
  const [liveJoinSessionId, setLiveJoinSessionId] = useState<string | null>(null);
  const [name, setName] = useState('MEEi User');
  const [username, setUsername] = useState('your_username');
  const [bio, setBio] = useState('Creating connections, sharing ideas and meeting amazing people.');
  const [website, setWebsite] = useState('https://example.com');
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
  const [ownPublishedPosts, setOwnPublishedPosts] = useState<PublishedPost[]>([]);
  const [otherPublishedPosts, setOtherPublishedPosts] = useState<PublishedPost[]>([]);
  const [commentPost, setCommentPost] = useState<PublishedPost | null>(null);
  const [postComments, setPostComments] = useState<PostComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentSending, setCommentSending] = useState(false);
  const [postsRefreshKey, setPostsRefreshKey] = useState(0);
  const [likedVideoIds, setLikedVideoIds] = useState<string[]>([]);
  const [likeBusyIds, setLikeBusyIds] = useState<string[]>([]);
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [liveCreators, setLiveCreators] = useState<LiveCreator[]>([]);
  const [liveMediaUrls, setLiveMediaUrls] = useState<Record<string, string>>({});
  const [liveCountry, setLiveCountry] = useState('ALL');
  const [loadingLiveCreators, setLoadingLiveCreators] = useState(false);
  const [followBusyIds, setFollowBusyIds] = useState<string[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<PublicProfile | null>(null);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [activeChat, setActiveChat] = useState<ChatThread | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
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
        const { error } = await supabaseClient.from('user_push_tokens').upsert({
          user_id: currentUserId,
          expo_push_token: tokenResult.data,
          sound_enabled: messageSoundEnabled,
          device_platform: Platform.OS,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'expo_push_token' });
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
        const { error } = await supabase.from('user_push_tokens').update({ sound_enabled: enabled }).eq('user_id', currentUserId);
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
    const loadCloudProfile = async () => {
      if (!supabase) return;
      const { data: authData } = await supabase.auth.getSession();
      const userId = authData.session?.user.id;
      if (!userId) return;
      setCurrentUserId(userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('username, display_name, bio, website_url, profession_category, activity_status, is_private, account_type, business_name, business_category, business_description')
        .eq('id', userId)
        .maybeSingle();
      if (!active || error || !data) return;
      setName(data.display_name || 'MEEi User');
      setUsername(data.username || 'your_username');
      setBio(data.bio || '');
      setWebsite(data.website_url || '');
      setOccupation(data.profession_category || '');
      setAccountType(data.account_type === 'business' ? 'business' : 'personal');
      setBusinessName(data.business_name || '');
      setBusinessCategory(data.business_category || '');
      setBusinessDescription(data.business_description || '');
      setIsPrivateAccount(!!data.is_private);

      const [followingResult, followerResult, likesResult] = await Promise.all([
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId).eq('status', 'accepted'),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followed_id', userId).eq('status', 'accepted'),
        supabase.rpc('get_profile_likes_count', { target_user_id: userId }),
      ]);
      if (!active) return;
      if (!followingResult.error) setFollowingCount(followingResult.count ?? 0);
      if (!followerResult.error) setFollowerCount(followerResult.count ?? 0);
      if (!likesResult.error) setLikesCount(Number(likesResult.data || 0));

      if (data.activity_status) {
        const status = data.activity_status.toLowerCase();
        setActivity(status.charAt(0).toUpperCase() + status.slice(1));
      }

      const { data: mediaRows, error: mediaError } = await supabase
        .from('profile_media')
        .select('id, kind, position, storage_path, media_type, original_name')
        .eq('user_id', userId)
        .order('position', { ascending: true });
      if (!active || mediaError || !mediaRows) return;
      const hydrated = await Promise.all((mediaRows as CloudMediaRow[]).map(async row => {
        const { data: signed, error: signedError } = await supabase!.storage
          .from('usay-media').createSignedUrl(row.storage_path, 60 * 60);
        if (signedError || !signed?.signedUrl) return null;
        return {
          row,
          media: {
            uri: signed.signedUrl,
            type: row.media_type,
            name: row.original_name || undefined,
            storagePath: row.storage_path,
          } as Media,
        };
      }));
      if (!active) return;
      const valid = hydrated.filter((item): item is NonNullable<typeof item> => item !== null);
      setAvatar(valid.find(item => item.row.kind === 'avatar')?.media || null);
      setCovers(valid.filter(item => item.row.kind === 'cover').map(item => item.media).slice(0, 3));
      setPosts(valid.filter(item => item.row.kind === 'post').map(item => item.media).slice(0, 3));
    };
    loadCloudProfile();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const loadOwnPublishedPosts = async () => {
      const { data: authData, error: authError } = await supabase!.auth.getSession();
      const userId = authData.session?.user.id;
      if (authError || !userId) return;
      const { data, error } = await supabase!.from('posts')
        .select('id, post_type, caption, media_path, created_at, visibility, content_category')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
      if (!active) return;
      if (error) {
        Alert.alert('Could not load your posts', error.message);
        return;
      }
      const rows = (data || []).filter((row: any) => !!row.media_path);
      const hydrated = await Promise.all(rows.map(async (row: any) => {
        const { data: signed, error: signedError } = await supabase!.storage.from('usay-media').createSignedUrl(row.media_path, 60 * 60);
        if (signedError || !signed?.signedUrl) return null;
        return { ...row, media: { uri: signed.signedUrl, type: row.post_type === 'video' ? 'video' : 'image', storagePath: row.media_path } as Media } as PublishedPost;
      }));
      const validPosts = hydrated.filter((post): post is PublishedPost => post !== null);
      if (!validPosts.length) {
        if (active) setOwnPublishedPosts([]);
        return;
      }
      const engagementResult = await supabase!.rpc('get_profile_post_engagement', { target_post_ids: validPosts.map(post => post.id) });
      if (!active) return;
      const commentCounts = await fetchPostCommentCounts(validPosts.map(post => post.id));
      if (!active) return;
      if (engagementResult.error) {
        Alert.alert('Could not load post likes', engagementResult.error.message);
        setOwnPublishedPosts(validPosts.map(post => ({ ...post, like_count: 0, viewer_liked: false, comment_count: commentCounts[post.id] || 0 })));
      } else {
        const engagementById = new Map<string, any>((engagementResult.data || []).map((item: any) => [item.post_id, item] as [string, any]));
        setOwnPublishedPosts(validPosts.map(post => {
          const engagement = engagementById.get(post.id) as any;
          return { ...post, like_count: Number(engagement?.like_count || 0), viewer_liked: !!engagement?.viewer_liked, comment_count: commentCounts[post.id] || 0 };
        }));
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
    if (tab !== 'Public' || !supabase) return;
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
  }, [tab, debouncedProfileSearch]);

  useEffect(() => {
    const videoCategories: SearchCategory[] = ['Videos', 'Reels', 'Trending', 'Funny', 'Vlogs', 'Cinema'];
    if (tab !== 'Public' || !videoCategories.includes(searchCategory) || !supabase) return;
    let active = true;
    const loadSearchVideos = async () => {
      setLoadingVideos(true);
      setVideoUrls({});
      const categoryFilter = searchCategory.toLowerCase();
      const { data, error } = await supabase!
        .rpc('get_public_search_posts', { category_filter: categoryFilter, search_text: null });
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
  }, [tab, searchCategory]);

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
  }, [tab]);

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
        const { data, error } = await supabase!.storage.from('usay-media').createSignedUrl(row.storage_path, 60 * 60);
        if (error || !data?.signedUrl) return null;
        return { kind: row.kind, position: row.position, media: { uri: data.signedUrl, type: row.media_type, name: row.original_name || undefined, storagePath: row.storage_path } as Media };
      }));
      if (!active) return;
      const valid = hydrated.filter((item): item is NonNullable<typeof item> => item !== null);
      setOtherProfileMedia({
        avatar: valid.find(item => item.kind === 'avatar')?.media || null,
        covers: valid.filter(item => item.kind === 'cover').sort((a,b) => a.position-b.position).map(item => item.media).slice(0,3),
        posts: valid.filter(item => item.kind === 'post').sort((a,b) => a.position-b.position).map(item => item.media).slice(0,3),
      });
      if (postsResult.error) Alert.alert('Could not load published posts', postsResult.error.message);
      const publishedRows = (postsResult.data || []).filter((row: any) => !!row.media_path);
      const publishedHydrated = await Promise.all(publishedRows.map(async (row: any) => {
        const { data: signed, error: signedError } = await supabase!.storage.from('usay-media').createSignedUrl(row.media_path, 60 * 60);
        if (signedError || !signed?.signedUrl) return null;
        return { ...row, media: { uri: signed.signedUrl, type: row.post_type === 'video' ? 'video' : 'image', storagePath: row.media_path } as Media } as PublishedPost;
      }));
      if (!active) return;
      const validPublishedPosts = publishedHydrated.filter((post): post is PublishedPost => post !== null);
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
  }, [selectedProfile?.id, followedUserIds]);

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
    setOwnPublishedPosts(old => old.map(item => item.id === post.id ? { ...item, comment_count: item.comment_count + 1 } : item));
    setOtherPublishedPosts(old => old.map(item => item.id === post.id ? { ...item, comment_count: item.comment_count + 1 } : item));
    void loadPostComments(post.id);
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
    setOwnPublishedPosts(old => old.map(updatePost));
    setOtherPublishedPosts(old => old.map(updatePost));
    if (isOtherProfile) setOtherLikesCount(count => Math.max(0, count + delta));
    else setLikesCount(count => Math.max(0, count + delta));
  };

  const loadInbox = async () => {
    if (!supabase) return;
    const { data: authData, error: authError } = await supabase.auth.getSession();
    const userId = authData.session?.user.id;
    if (authError || !userId) {
      Alert.alert('Sign in required', 'Please sign in again to view your messages.');
      return;
    }
    setCurrentUserId(userId);
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
    if (!client) {
      Alert.alert('Cloud not configured', 'Connect Supabase before saving profile changes.');
      return;
    }
    const cleanName = name.trim();
    const cleanUsername = username.trim().replace(/[@#]/g, '').toLowerCase();
    const cleanWebsite = website.trim();
    if (!cleanName || cleanName.length > 40) {
      Alert.alert('Check display name', 'Enter a display name between 1 and 40 characters.');
      return;
    }
    if (!/^[a-z0-9_]{3,25}$/.test(cleanUsername)) {
      Alert.alert('Check username', 'Username must be 3–25 characters and use only lowercase letters, numbers, or underscores.');
      return;
    }
    const normalizedUsername = cleanUsername.replace(/[^a-z0-9]/g, '');
    const reservedUsernames = new Set(['meei', 'meeiapp', 'meeiofficial', 'meeisvip', 'svipteam', 'meeimoderation', 'meeimoderationteam', 'moderation', 'moderationteam']);
    if (/^meei[0-9]+$/.test(normalizedUsername) || reservedUsernames.has(normalizedUsername)) {
      Alert.alert('Username reserved', 'This username is reserved for the official MEEi or Moderation Team account. Please choose another username.');
      return;
    }
    if (bio.trim().length > 300) {
      Alert.alert('Bio too long', 'Your bio can contain up to 300 characters.');
      return;
    }
    const cleanBusinessName = businessName.trim();
    const cleanBusinessCategory = businessCategory.trim();
    if (accountType === 'business' && (!cleanBusinessName || !cleanBusinessCategory)) {
      Alert.alert('Business details required', 'Enter your business name and category before switching to a professional business account.');
      return;
    }
    if (cleanBusinessName.length > 80 || cleanBusinessCategory.length > 60 || businessDescription.trim().length > 500) {
      Alert.alert('Business details too long', 'Business name: 80 characters, category: 60, description: 500.');
      return;
    }
    if (cleanWebsite && !/^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/[^\s]*)?$/i.test(cleanWebsite)) {
      Alert.alert('Check website', 'Enter a valid website address.');
      return;
    }
    const { data: authData, error: sessionError } = await client.auth.getSession();
    if (sessionError) {
      Alert.alert('Profile not saved', sessionError.message);
      return;
    }
    const userId = authData.session?.user.id;
    if (!userId) {
      Alert.alert('Sign in required', 'Please sign in again before saving your profile.');
      return;
    }
    const { error } = await client.from('profiles').update({
      display_name: cleanName,
      username: cleanUsername,
      bio: bio.trim(),
      website_url: cleanWebsite || null,
      profession_category: occupation.trim() || null,
      account_type: accountType,
      business_name: accountType === 'business' ? cleanBusinessName : null,
      business_category: accountType === 'business' ? cleanBusinessCategory : null,
      business_description: accountType === 'business' ? businessDescription.trim() || null : null,
      is_private: isPrivateAccount,
      activity_status: activity.toLowerCase(),
      updated_at: new Date().toISOString(),
    }).eq('id', userId);
    if (error) {
      Alert.alert('Profile not saved', error.message);
      return;
    }
    setUsername(cleanUsername);
    setEditing(false);
    Alert.alert('Profile saved', 'Your profile details have been saved.');
  };

  const chooseMedia = async (kind: 'avatar' | 'cover' | 'post', index?: number) => {
    if (kind === 'cover' && covers.length >= 3 && index === undefined) {
      Alert.alert('Cover gallery full', 'You can add up to 3 cover photos/videos.');
      return;
    }
    if (kind === 'post' && posts.length >= 3 && index === undefined) {
      Alert.alert('Posts gallery full', 'You can add up to 3 post media files.');
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow MEEi to access your phone gallery.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'avatar' ? ['images'] : ['images', 'videos'],
      allowsEditing: kind === 'avatar',
      aspect: kind === 'avatar' ? [1, 1] : undefined,
      quality: 0.85,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    const type = a.type === 'video' ? 'video' : 'image';
    if (type === 'video' && typeof a.fileSize === 'number' && a.fileSize > 50 * 1024 * 1024) {
      Alert.alert('Video size limit', 'Please choose a video that is 50 MB or smaller.');
      return;
    }
    const client = supabase;
    if (!client) {
      Alert.alert('Cloud not configured', 'Connect Supabase before uploading profile media.');
      return;
    }
    const { data: authData } = await client.auth.getSession();
    const userId = authData.session?.user.id;
    if (!userId) {
      Alert.alert('Sign in required', 'Please sign in before uploading profile media.');
      return;
    }
    try {
      const mimeType = a.mimeType || (type === 'video' ? 'video/mp4' : 'image/jpeg');
      const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg').split(';')[0] || (type === 'video' ? 'mp4' : 'jpg');
      const fileResponse = await fetch(a.uri);
      if (!fileResponse.ok) throw new Error('Could not read the selected media from this device.');
      const fileData = await fileResponse.arrayBuffer();
      const storagePath = `${userId}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
      const { error: uploadError } = await client.storage.from('usay-media').upload(storagePath, fileData, {
        contentType: mimeType,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const position = kind === 'avatar' ? 0 : (index ?? (kind === 'cover' ? covers.length : posts.length));
      const { data: previous } = await client.from('profile_media')
        .select('storage_path').eq('user_id', userId).eq('kind', kind).eq('position', position).maybeSingle();
      const { error: saveError } = await client.from('profile_media').upsert({
        user_id: userId,
        kind,
        position,
        storage_path: storagePath,
        media_type: type,
        original_name: a.fileName ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,kind,position' });
      if (saveError) {
        await client.storage.from('usay-media').remove([storagePath]);
        throw saveError;
      }
      if (previous?.storage_path) await client.storage.from('usay-media').remove([previous.storage_path]);
      const { data: signed, error: signedError } = await client.storage.from('usay-media').createSignedUrl(storagePath, 60 * 60);
      if (signedError || !signed?.signedUrl) throw signedError || new Error('Could not create a media preview URL.');
      const media: Media = { uri: signed.signedUrl, type, name: a.fileName ?? undefined, size: a.fileSize ?? undefined, storagePath };
      if (kind === 'avatar') setAvatar(media);
      if (kind === 'cover') setCovers(old => index === undefined
        ? [...old, media].slice(0, 3)
        : old.map((m, i) => i === index ? media : m));
      if (kind === 'post') setPosts(old => index === undefined
        ? [...old, media].slice(0, 3)
        : old.map((m, i) => i === index ? media : m));
      Alert.alert('Uploaded', 'Your media is now saved to your MEEi account.');
    } catch (error: any) {
      Alert.alert('Upload failed', error?.message || 'Please try again.');
    }
  };

  const removeMedia = async (kind: 'cover' | 'post', index: number) => {
    const client = supabase;
    const media = kind === 'cover' ? covers[index] : posts[index];
    if (!client || !media) return;
    const { data: authData } = await client.auth.getSession();
    const userId = authData.session?.user.id;
    if (!userId) return;
    const { error } = await client.from('profile_media').delete()
      .eq('user_id', userId).eq('kind', kind).eq('position', index);
    if (error) {
      Alert.alert('Could not remove media', error.message);
      return;
    }
    if (media.storagePath) await client.storage.from('usay-media').remove([media.storagePath]);
    if (kind === 'cover') {
      const next = covers.filter((_, i) => i !== index);
      setCovers(next);
      for (let position = 0; position < next.length; position++) {
        const item = next[position];
        const { error: reorderError } = await client.from('profile_media')
          .update({ position, updated_at: new Date().toISOString() })
          .eq('user_id', userId).eq('kind', 'cover').eq('storage_path', item.storagePath || '');
        if (reorderError) Alert.alert('Gallery update warning', reorderError.message);
      }
    } else {
      const next = posts.filter((_, i) => i !== index);
      setPosts(next);
      for (let position = 0; position < next.length; position++) {
        const item = next[position];
        const { error: reorderError } = await client.from('profile_media')
          .update({ position, updated_at: new Date().toISOString() })
          .eq('user_id', userId).eq('kind', 'post').eq('storage_path', item.storagePath || '');
        if (reorderError) Alert.alert('Gallery update warning', reorderError.message);
      }
    }
  };

  const openWebsite = () => {
    const url = website.startsWith('http') ? website : `https://${website}`;
    import('react-native').then(({ Linking }) => Linking.openURL(url).catch(() => Alert.alert('Website', 'This website link could not be opened.')));
  };

  const MediaTile = ({ media, onPress, onRemove, label }: {
    media?: Media; onPress: () => void; onRemove?: () => void; label: string;
  }) => (
    <Pressable onPress={media ? () => setViewer(media) : onPress} style={s.tile}>
      {media?.type === 'image'
        ? <Image source={{ uri: media.uri }} style={s.tileImage} />
        : media?.type === 'video'
          ? <View style={s.videoTile}><Ionicons name="play-circle" size={30} color={C.cyan} /><Text style={s.videoText}>VIDEO</Text></View>
          : <><Ionicons name="add-circle-outline" size={25} color={C.cyan} /><Text style={s.tileLabel}>{label}</Text></>}
      {media && onRemove ? <Pressable onPress={onRemove} style={s.remove}><Ionicons name="close" size={14} color="#fff" /></Pressable> : null}
    </Pressable>
  );

  const PublishedPostTile = ({ post, onPress, onLike, onComments }: { post: PublishedPost; onPress: () => void; onLike: () => void; onComments: () => void }) => (
    <View style={s.publishedTile}>
      <Pressable onPress={onPress}>
        {post.media.type === 'image'
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
          {covers[0]?.type === 'image' ? <Image source={{uri:covers[0].uri}} style={s.coverBackdropImage}/> :
            covers[0]?.type === 'video' ? <ProfileCoverVideo uri={covers[0].uri} /> :
            <View style={s.coverBackdropEmpty}/>}
          <View style={s.coverBackdropShade}/>
          {isOwnProfile && <Pressable onPress={() => chooseMedia('cover')} style={s.coverEdit}><Ionicons name="camera" size={15} color="#FFFFFF"/></Pressable>}
          {!!covers.length && <Pressable onPress={() => setCoverExpanded(true)} style={s.coverViewTap}/>}
        </Animated.View>
        <Animated.View {...avatarPan.panHandlers}>
        <Pressable onPress={() => isOwnProfile ? chooseMedia('avatar') : undefined} style={s.avatarWrap}>
          {avatar ? <Image source={{uri:avatar.uri}} style={s.avatar} /> : <View style={s.avatarFallback}><Ionicons name="person" size={38} color={C.cyan}/></View>}
          {isOwnProfile && <View style={s.camera}><Ionicons name="camera" size={13} color="#fff"/></View>}
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
              { text: 'Policies & Terms', onPress: () => setLegalVisible(true) },
              { text: 'Sign out', style: 'destructive', onPress: () => {
                if (supabase) supabase.auth.signOut().catch(error => Alert.alert('Sign out failed', error.message));
              }},
              { text: 'Cancel', style: 'cancel' },
            ])}><Ionicons name="settings-outline" color={C.text} size={17}/><Text style={s.secondaryText}>Settings · Sound {messageSoundEnabled ? 'On' : 'Off'}</Text></Pressable>
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
          <View style={s.mediaRow}>{[0,1,2].map(i => <MediaTile key={i} label="Add media" media={posts[i]} onPress={() => chooseMedia('post', i)} onRemove={posts[i] ? () => removeMedia('post', i) : undefined}/>)}</View>
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
          {otherProfileMedia.covers[0]?.type === 'image' ? <Image source={{uri:otherProfileMedia.covers[0].uri}} style={s.coverBackdropImage}/> :
            otherProfileMedia.covers[0]?.type === 'video' ? <ProfileCoverVideo uri={otherProfileMedia.covers[0].uri} /> : <View style={s.coverBackdropEmpty}/>}
          <View style={s.coverBackdropShade}/>
          {!!otherProfileMedia.covers.length && <Pressable onPress={() => setOtherCoverExpanded(true)} style={s.coverViewTap}/>}
        </Animated.View>
        <Animated.View {...avatarPan.panHandlers} style={{ transform: [{ translateY: avatarDrag }] }}>
        <Pressable onPress={() => otherProfileMedia.avatar && setViewer(otherProfileMedia.avatar)} style={s.avatarWrap}>
          {otherProfileMedia.avatar ? <Image source={{uri:otherProfileMedia.avatar.uri}} style={s.avatar}/> : <View style={s.avatarFallback}><Ionicons name="person" size={38} color={C.cyan}/></View>}
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

  const DiscoverScreen = () => {
    const query = profileSearch.trim().replace(/^[@#]+/, '').toLowerCase();
    const filteredProfiles = publicProfiles.filter(profile =>
      (!query ||
        profile.username.replace(/[@#]/g, '').toLowerCase().includes(query) ||
        profile.display_name.toLowerCase().includes(query) ||
        (profile.profession_category || '').toLowerCase().includes(query)) &&
      (searchCategory !== 'Creators' || /(creator|influencer|youtub|content)/i.test(profile.profession_category || ''))
    );
    const filteredVideos = publicVideos.filter(video => (video.caption || '').toLowerCase().includes(query));
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
    return <ScrollView contentContainerStyle={s.discoverScroll} keyboardShouldPersistTaps="handled">
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
          <View style={s.reelsGrid}>{filteredVideos.slice(0, 12).map(video => <SearchReelTile key={video.id} uri={videoUrls[video.id]} caption={video.caption || 'MEEi video'} views={video.view_count || 0} onPress={() => openSearchVideo(video)}/>)}</View>}
      </>}
    </ScrollView>;
  };

  const LiveScreen = () => {
    const countries = Array.from(new Map(liveCreators.map(creator => [creator.country_code, { code: creator.country_code, name: creator.country_name }] as const)).values()).sort((a,b) => a.name.localeCompare(b.name));
    const visibleCreators = liveCountry === 'ALL' ? liveCreators : liveCreators.filter(creator => creator.country_code === liveCountry);
    return <ScrollView contentContainerStyle={s.liveScroll}>
      <View style={s.liveHeader}>
        <View><Text style={s.pageTitle}>Live</Text><Text style={s.searchSubtitle}>Creators broadcasting now</Text></View>
        <View style={s.livePulse}><View style={s.livePulseDot}/><Text style={s.livePulseText}>LIVE NOW</Text></View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.liveCountries}>
        <Pressable onPress={() => setLiveCountry('ALL')} style={[s.liveCountryChip, liveCountry === 'ALL' && s.liveCountryChipActive]}><Text style={[s.liveCountryText, liveCountry === 'ALL' && s.liveCountryTextActive]}>All Countries</Text></Pressable>
        {countries.map(country => <Pressable key={country.code} onPress={() => setLiveCountry(country.code)} style={[s.liveCountryChip, liveCountry === country.code && s.liveCountryChipActive]}><Text style={[s.liveCountryText, liveCountry === country.code && s.liveCountryTextActive]}>{country.name}</Text></Pressable>)}
      </ScrollView>
      {loadingLiveCreators ? <View style={s.searchEmpty}><Text style={s.hint}>Finding creators who are live…</Text></View> :
        visibleCreators.length === 0 ? <View style={s.liveEmpty}><View style={s.liveEmptyIcon}><Ionicons name="radio-outline" size={38} color={C.cyan}/></View><Text style={s.sectionTitle}>No creators live right now</Text><Text style={s.hint}>{liveCountry === 'ALL' ? 'When a creator starts a real broadcast, they will appear here.' : 'No one is live from this country at the moment.'}</Text></View> :
        <View style={s.liveGrid}>{visibleCreators.map(creator => {
          const uri = liveMediaUrls[creator.session_id];
          return <Pressable key={creator.session_id} onPress={() => {
            setLiveJoinSessionId(creator.session_id);
            setLiveStudioVisible(true);
          }} style={s.liveCard}>
            {uri ? <Image source={{ uri }} style={s.liveCardImage} resizeMode="cover"/> : <View style={s.liveCardFallback}><Ionicons name="person" size={34} color="#FFFFFF"/></View>}
            <View style={s.liveCardShade}/>
            <View style={s.liveBadge}><View style={s.liveBadgeDot}/><Text style={s.liveBadgeText}>LIVE</Text></View>
            <View style={s.liveCardInfo}><Text style={s.liveCardName} numberOfLines={1}>{creator.display_name}</Text><Text style={s.liveCardMeta} numberOfLines={1}>{creator.username.replace(/[@#]/g, '')} · {creator.country_name}</Text>{!!creator.title && <Text style={s.liveCardTitle} numberOfLines={1}>{creator.title}</Text>}</View>
          </Pressable>;
        })}</View>}
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
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 10, borderTopWidth: 1, borderColor: '#E5EBF0', backgroundColor: '#F4F7FA' }}>
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
          <Pressable onPress={() => void loadInbox()}><Ionicons name="refresh" size={21} color={C.cyan}/></Pressable>
        </View>
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

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg}/>
      <LiveBroadcastModal visible={liveStudioVisible} sessionId={liveJoinSessionId} creatorName={name} onClose={() => { setLiveStudioVisible(false); setLiveJoinSessionId(null); }} />
      <View style={{flex:1}}>
        {selectedProfile ? <OtherProfileScreen/> : tab === 'Profile' ? <Profile/> :
          tab === 'Home' ? <SimpleScreen title="MEEi" subtitle="Your people, one place."/> :
          tab === 'Public' ? <DiscoverScreen/> :
          tab === 'Live' ? <LiveScreen/> :
          tab === 'Create' ? <CreateScreen/> :
          <InboxScreen/>}
      </View>
      <View style={s.nav}>
        {(['Home','Public','Live'] as Tab[]).map((item) => {
          const icons = { Home: 'home-outline', Public: 'search-outline', Live: 'radio-outline' } as const;
          return <Pressable key={item} style={s.navItem} onPress={() => { setSelectedProfile(null); setTab(item); }}>
            <Ionicons name={icons[item]} size={21} color={tab === item ? C.pink : C.muted}/>
            <Text style={[s.navLabel, tab === item && {color:C.pink}]}>{item === 'Public' ? 'Search' : item}</Text>
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
          <Text style={s.fieldLabel}>Account privacy</Text>
          <View style={s.activityGrid}>
            <Pressable onPress={() => setIsPrivateAccount(false)} style={[s.activityChip,!isPrivateAccount&&s.activityActive]}><Text style={[s.activityText,!isPrivateAccount&&{color:C.cyan}]}>Public account</Text></Pressable>
            <Pressable onPress={() => setIsPrivateAccount(true)} style={[s.activityChip,isPrivateAccount&&s.activityActive]}><Text style={[s.activityText,isPrivateAccount&&{color:C.cyan}]}>Private account</Text></Pressable>
          </View>
          <Text style={s.hint}>{isPrivateAccount ? 'New followers must be approved before they can view your private content.' : 'Anyone signed in can discover and follow your public profile.'}</Text>
          <Text style={s.fieldLabel}>Activity status</Text>
          <View style={s.activityGrid}>{['Available','Busy','Work','Drive','Gym','School','College'].map(x=><Pressable key={x} onPress={()=>setActivity(x)} style={[s.activityChip,activity===x&&s.activityActive]}><Text style={[s.activityText,activity===x&&{color:C.cyan}]}>{x}</Text></Pressable>)}</View>
          <Pressable style={s.primary} onPress={saveProfile}><Text style={s.primaryText}>Save profile</Text></Pressable>
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
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={()=>setViewer(null)}>
        <View style={s.viewer}><Pressable style={s.viewerClose} onPress={()=>setViewer(null)}><Ionicons name="close" size={26} color="#fff"/></Pressable>
          {viewer?.type === 'image' ? <Image source={{uri:viewer.uri}} resizeMode="contain" style={{width:'100%',height:'82%'}}/> :
            <CoverMediaSlide media={viewer!}/>}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg}, scroll:{padding:16,paddingBottom:22,gap:14},
  discoverScroll:{padding:20,paddingTop:54,paddingBottom:30,gap:14},
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
  liveHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  livePulse:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10,paddingVertical:7,borderRadius:16,backgroundColor:'#FFF0F1'},
  livePulseDot:{width:7,height:7,borderRadius:4,backgroundColor:'#E54862'},
  livePulseText:{color:'#D93650',fontSize:9,fontWeight:'900',letterSpacing:.7},
  liveCountries:{gap:8,paddingVertical:2},
  liveCountryChip:{paddingHorizontal:14,paddingVertical:9,borderRadius:18,borderWidth:1,borderColor:C.border,backgroundColor:'#FFFFFF'},
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
  searchBox:{minHeight:48,borderWidth:1,borderColor:C.border,borderRadius:14,paddingHorizontal:13,flexDirection:'row',alignItems:'center',gap:9,backgroundColor:'#F8FCFF'},
  searchInput:{flex:1,color:C.text,fontSize:14,paddingVertical:10},searchCategories:{gap:8,paddingVertical:3},
  searchCategory:{paddingHorizontal:15,paddingVertical:9,borderRadius:20,borderWidth:1,borderColor:C.border,backgroundColor:'#FFFFFF'},
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
  commentsBackdrop:{flex:1,backgroundColor:'#0007',justifyContent:'flex-end'},commentsSheet:{height:'72%',backgroundColor:'#FFFFFF',borderTopLeftRadius:22,borderTopRightRadius:22,paddingHorizontal:18,paddingTop:16,paddingBottom:20},commentsHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingBottom:10,borderBottomWidth:1,borderBottomColor:C.border},commentsPostCaption:{color:C.muted,fontSize:12,paddingTop:9},commentsList:{flex:1},commentRow:{flexDirection:'row',alignItems:'flex-start',gap:10},commentAvatar:{width:32,height:32,borderRadius:16,backgroundColor:'#EAF5FF',alignItems:'center',justifyContent:'center'},commentAvatarText:{color:C.cyan,fontSize:13,fontWeight:'800'},commentAuthor:{color:C.text,fontSize:12,fontWeight:'800'},commentUsername:{color:C.muted,fontSize:10,fontWeight:'500'},commentBody:{color:C.text,fontSize:13,lineHeight:18},commentComposer:{flexDirection:'row',alignItems:'center',gap:9,borderTopWidth:1,borderTopColor:C.border,paddingTop:10},commentInput:{flex:1,minHeight:42,maxHeight:92,borderWidth:1,borderColor:C.border,borderRadius:16,paddingHorizontal:13,paddingVertical:9,color:C.text,fontSize:13},commentSend:{width:40,height:40,borderRadius:20,backgroundColor:C.cyan,alignItems:'center',justifyContent:'center'},
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
  createMenuBackdrop:{flex:1,backgroundColor:'#0008',justifyContent:'flex-end'},createMenuSheet:{backgroundColor:'#FFFFFF',borderTopLeftRadius:25,borderTopRightRadius:25,paddingHorizontal:20,paddingTop:12,paddingBottom:30,gap:5},createMenuHandle:{width:42,height:4,borderRadius:3,backgroundColor:'#D8E1E8',alignSelf:'center',marginBottom:10},createMenuHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},createMenuOption:{flexDirection:'row',alignItems:'center',gap:13,paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#F0F3F5'},createMenuIcon:{width:46,height:46,borderRadius:15,alignItems:'center',justifyContent:'center'},createMenuText:{flex:1,gap:3},createMenuTitle:{color:C.text,fontSize:14,fontWeight:'900'},createMenuSubtitle:{color:C.muted,fontSize:11},
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
  createPicker:{minHeight:220,borderWidth:1,borderColor:'#B9DDF3',borderStyle:'dashed',borderRadius:18,backgroundColor:'#F4FAFF',alignItems:'center',justifyContent:'center',gap:9,overflow:'hidden'},
  createPreview:{width:'100%',height:260},createVideoPreview:{width:'100%',height:220,backgroundColor:'#6FAFD0',alignItems:'center',justifyContent:'center',gap:8},
  createRemove:{flexDirection:'row',alignItems:'center',gap:6,alignSelf:'flex-end'}, 
});
