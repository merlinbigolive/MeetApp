import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Image, Modal, Pressable, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, View, useWindowDimensions, Animated, PanResponder
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { supabase } from './supabase';

type Media = { uri: string; type: 'image' | 'video'; name?: string; size?: number; storagePath?: string };
type CloudMediaRow = { id: string; kind: 'avatar' | 'cover' | 'post'; position: number; storage_path: string; media_type: 'image' | 'video'; original_name: string | null; };
type Tab = 'Home' | 'Public' | 'Create' | 'Inbox' | 'Profile';
type SearchCategory = 'People' | 'Videos' | 'Reels' | 'Trending' | 'Funny' | 'Vlogs' | 'Cinema' | 'Creators';
type SearchVideo = { id: string; caption: string | null; media_path: string; created_at: string; user_id: string; content_category: string; like_count: number; view_count: number };
type PublicProfile = { id: string; username: string; display_name: string; bio: string | null; profession_category: string | null; website_url?: string | null; activity_status?: string | null };

const C = {
  bg: '#FFFFFF', panel: '#FFFFFF', panel2: '#FFFFFF', text: '#172B3A',
  muted: '#777777', pink: '#258FEA', cyan: '#43B8E8', border: '#EEEEEE'
};

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

export default function App() {
  const [tab, setTab] = useState<Tab>('Profile');
  const [name, setName] = useState('USay User');
  const [username, setUsername] = useState('your_username');
  const [bio, setBio] = useState('Creating connections, sharing ideas and meeting amazing people.');
  const [website, setWebsite] = useState('https://example.com');
  const [occupation, setOccupation] = useState('');
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
  const [profileSearch, setProfileSearch] = useState('');
  const [searchCategory, setSearchCategory] = useState<SearchCategory>('People');
  const [publicVideos, setPublicVideos] = useState<SearchVideo[]>([]);
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [followBusyIds, setFollowBusyIds] = useState<string[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<PublicProfile | null>(null);
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
      const { data, error } = await supabase
        .from('profiles')
        .select('username, display_name, bio, website_url, profession_category, activity_status')
        .eq('id', userId)
        .maybeSingle();
      if (!active || error || !data) return;
      setName(data.display_name || 'USay User');
      setUsername(data.username || 'your_username');
      setBio(data.bio || '');
      setWebsite(data.website_url || '');
      setOccupation(data.profession_category || '');

      const [followingResult, followerResult, likesResult] = await Promise.all([
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followed_id', userId),
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
      const [profilesResult, followsResult] = await Promise.all([
        supabase!.from('profiles').select('id, username, display_name, bio, profession_category, website_url, activity_status').neq('id', userId).order('created_at', { ascending: false }).limit(50),
        supabase!.from('follows').select('followed_id').eq('follower_id', userId),
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
      else setFollowedUserIds((followsResult.data || []).map(row => row.followed_id));
      setLoadingProfiles(false);
    };
    loadDiscoverProfiles();
    return () => { active = false; };
  }, [tab]);

  useEffect(() => {
    const videoCategories: SearchCategory[] = ['Videos', 'Reels', 'Trending', 'Funny', 'Vlogs', 'Cinema'];
    if (tab !== 'Public' || !videoCategories.includes(searchCategory) || !supabase) return;
    let active = true;
    const loadSearchVideos = async () => {
      setLoadingVideos(true);
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
    if (!selectedProfile || !supabase) return;
    let active = true;
    const loadOtherProfile = async () => {
      setLoadingOtherProfile(true);
      const [mediaResult, countsResult, likesResult] = await Promise.all([
        supabase!.from('profile_media').select('id, kind, position, storage_path, media_type, original_name').eq('user_id', selectedProfile.id).order('position', { ascending: true }),
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
  }, [selectedProfile?.id]);

  const toggleFollow = async (profile: PublicProfile) => {
    if (!supabase || followBusyIds.includes(profile.id)) return;
    const { data: authData, error: authError } = await supabase.auth.getSession();
    const userId = authData.session?.user.id;
    if (authError || !userId) {
      Alert.alert('Sign in required', 'Please sign in again to follow people.');
      return;
    }
    setFollowBusyIds(old => [...old, profile.id]);
    const isFollowing = followedUserIds.includes(profile.id);
    const result = isFollowing
      ? await supabase.from('follows').delete().eq('follower_id', userId).eq('followed_id', profile.id)
      : await supabase.from('follows').insert({ follower_id: userId, followed_id: profile.id });
    setFollowBusyIds(old => old.filter(id => id !== profile.id));
    if (result.error) {
      Alert.alert(isFollowing ? 'Unfollow failed' : 'Follow failed', result.error.message);
      return;
    }
    setFollowedUserIds(old => isFollowing ? old.filter(id => id !== profile.id) : [...old, profile.id]);
  };

  const saveProfile = async () => {
    const client = supabase;
    if (!client) {
      Alert.alert('Cloud not configured', 'Connect Supabase before saving profile changes.');
      return;
    }
    const cleanName = name.trim();
    const cleanUsername = username.trim().replace(/^@/, '').toLowerCase();
    const cleanWebsite = website.trim();
    if (!cleanName || cleanName.length > 40) {
      Alert.alert('Check display name', 'Enter a display name between 1 and 40 characters.');
      return;
    }
    if (!/^[a-z0-9_]{3,25}$/.test(cleanUsername)) {
      Alert.alert('Check username', 'Username must be 3–25 characters and use only lowercase letters, numbers, or underscores.');
      return;
    }
    if (bio.trim().length > 300) {
      Alert.alert('Bio too long', 'Your bio can contain up to 300 characters.');
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
      activity_status: activity.toLowerCase(),
      updated_at: new Date().toISOString(),
    }).eq('id', userId);
    if (error) {
      Alert.alert('Profile not saved', error.message);
      return;
    }
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
      Alert.alert('Permission needed', 'Allow USay to access your phone gallery.');
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
      Alert.alert('Uploaded', 'Your media is now saved to your USay account.');
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

  const Profile = () => (
    <ScrollView contentContainerStyle={s.profileScroll} showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScroll={(event) => {
      const y = event.nativeEvent.contentOffset.y;
      if (coverRevealed && y < lastProfileScrollY.current - 3) animateCoverReveal(false);
      lastProfileScrollY.current = y;
    }}>
      <View style={s.top}><Text style={s.pageTitle}>꒤ꇙꋬꌦ</Text></View>
      <Animated.View style={[s.identity, { paddingTop: coverRevealProgress.interpolate({ inputRange: [0, 1], outputRange: [76, 266] }) }]}>
        <Animated.View style={[s.coverBackdrop, { height: coverRevealProgress.interpolate({ inputRange: [0, 1], outputRange: [190, 420] }) }]}>
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
        <Text style={s.username}>@{username.replace(/^@/, '')}</Text>
        <Text style={s.bio}>{bio}</Text>
        {!!website && <Pressable onPress={openWebsite} style={s.websiteLine}><Ionicons name="link" color={C.cyan} size={15}/><Text style={s.website}>{website}</Text></Pressable>}
         
      </Animated.View>
      <View style={s.profileBody}>
        <View style={s.stats}>
          <View style={s.stat}><Text style={s.statNum}>{followingCount.toLocaleString()}</Text><Text style={s.statLabel}>Following</Text></View>
          <View style={s.stat}><Text style={s.statNum}>{followerCount.toLocaleString()}</Text><Text style={s.statLabel}>Followers</Text></View>
          <View style={s.stat}><Text style={s.statNum}>{likesCount.toLocaleString()}</Text><Text style={s.statLabel}>Likes</Text></View>
        </View>
        <View style={s.actions}>
          {isOwnProfile ? <>
            <Pressable style={s.primary} onPress={() => setEditing(true)}><Ionicons name="create-outline" color="#fff" size={17}/><Text style={s.primaryText}>Edit Profile</Text></Pressable>
            <Pressable style={s.secondary} onPress={() => Alert.alert('Account settings', 'Choose an account action.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => {
                if (supabase) supabase.auth.signOut().catch(error => Alert.alert('Sign out failed', error.message));
              }},
            ])}><Ionicons name="settings-outline" color={C.text} size={17}/><Text style={s.secondaryText}>Settings</Text></Pressable>
          </> : <>
            <Pressable style={s.primary} onPress={() => Alert.alert('Follow', 'Follow action will work after account and backend connection.')}><Ionicons name="person-add-outline" color="#fff" size={17}/><Text style={s.primaryText}>Follow</Text></Pressable>
            <Pressable style={s.secondary} onPress={() => Alert.alert('Message', 'Messaging will work after chat backend connection.')}><Ionicons name="chatbubble-ellipses-outline" color={C.text} size={17}/><Text style={s.secondaryText}>Message</Text></Pressable>
          </>}
        </View>
        <View style={s.section}>
          <View style={s.sectionHeading}><Text style={s.sectionTitle}>Posts</Text><Text style={s.coverCount}>{posts.length}/3</Text></View>
          <View style={s.mediaRow}>{[0,1,2].map(i => <MediaTile key={i} label="Add post" media={posts[i]} onPress={() => chooseMedia('post', i)} onRemove={posts[i] ? () => removeMedia('post', i) : undefined}/>)}</View>
        </View>
        <View style={s.section}>
          <Text style={s.sectionTitle}>About</Text>
          {!!occupation && <View style={s.infoLine}><Ionicons name="briefcase-outline" color={C.cyan} size={18}/><Text style={s.infoText}>{occupation}</Text></View>}
          <View style={s.infoLine}><Ionicons name="time-outline" color={C.cyan} size={18}/><Text style={s.infoText}>{activity}</Text></View>
        </View>
        <Text style={s.footerNote}>Profile details and uploaded media are synced with your USay account.</Text>
      </View>
    </ScrollView>
  );

  const OtherProfileScreen = () => {
    if (!selectedProfile) return null;
    const following = followedUserIds.includes(selectedProfile.id);
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
        <Text style={s.pageTitle}>꒤ꇙꋬꌦ</Text><View style={{ width: 40 }}/>
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
        <Text style={s.username}>@{selectedProfile.username}</Text>
        {!!selectedProfile.bio && <Text style={s.bio}>{selectedProfile.bio}</Text>}
        {!!selectedProfile.website_url && <Pressable onPress={openOtherWebsite} style={s.websiteLine}><Ionicons name="link" color={C.cyan} size={15}/><Text style={s.website}>{selectedProfile.website_url}</Text></Pressable>}
      </View>
      <View style={s.profileBody}>
        <View style={s.stats}>
          <View style={s.stat}><Text style={s.statNum}>{otherFollowingCount.toLocaleString()}</Text><Text style={s.statLabel}>Following</Text></View>
          <View style={s.stat}><Text style={s.statNum}>{otherFollowerCount.toLocaleString()}</Text><Text style={s.statLabel}>Followers</Text></View>
          <View style={s.stat}><Text style={s.statNum}>{otherLikesCount.toLocaleString()}</Text><Text style={s.statLabel}>Likes</Text></View>
        </View>
        <View style={s.actions}>
          <Pressable disabled={busy} style={[s.primary, following && s.followingButton]} onPress={() => toggleFollow(selectedProfile)}><Ionicons name={following ? 'checkmark' : 'person-add-outline'} color={following ? C.cyan : '#fff'} size={17}/><Text style={[s.primaryText, following && { color: C.cyan }]}>{busy ? 'Please wait…' : following ? 'Following' : 'Follow'}</Text></Pressable>
          <Pressable style={s.secondary} onPress={() => Alert.alert('Messages', 'Chat and messaging are not connected yet.')}><Ionicons name="chatbubble-ellipses-outline" color={C.text} size={17}/><Text style={s.secondaryText}>Message</Text></Pressable>
        </View>
        <View style={s.section}>
          <View style={s.sectionHeading}><Text style={s.sectionTitle}>Posts</Text><Text style={s.coverCount}>{otherProfileMedia.posts.length}/3</Text></View>
          {loadingOtherProfile ? <Text style={s.hint}>Loading profile media…</Text> : <View style={s.mediaRow}>{[0,1,2].map(i => <MediaTile key={i} label="Post" media={otherProfileMedia.posts[i]} onPress={() => otherProfileMedia.posts[i] && setViewer(otherProfileMedia.posts[i])}/>)}</View>}
        </View>
        <View style={s.section}>
          <Text style={s.sectionTitle}>About</Text>
          {!!selectedProfile.profession_category && <View style={s.infoLine}><Ionicons name="briefcase-outline" color={C.cyan} size={18}/><Text style={s.infoText}>{selectedProfile.profession_category}</Text></View>}
          {!!selectedProfile.activity_status && <View style={s.infoLine}><Ionicons name="time-outline" color={C.cyan} size={18}/><Text style={s.infoText}>{selectedProfile.activity_status}</Text></View>}
        </View>
      </View>
    </ScrollView>;
  };

  const DiscoverScreen = () => {
    const query = profileSearch.trim().toLowerCase();
    const filteredProfiles = publicProfiles.filter(profile =>
      (!query ||
        profile.username.toLowerCase().includes(query) ||
        profile.display_name.toLowerCase().includes(query) ||
        (profile.profession_category || '').toLowerCase().includes(query)) &&
      (searchCategory !== 'Creators' || /(creator|influencer|youtub|content)/i.test(profile.profession_category || ''))
    );
    const filteredVideos = publicVideos.filter(video => (video.caption || '').toLowerCase().includes(query));
    const categories: SearchCategory[] = ['People', 'Videos', 'Reels', 'Trending', 'Funny', 'Vlogs', 'Cinema', 'Creators'];
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
      <Text style={s.pageTitle}>Search</Text>
      <View style={s.searchBox}>
        <Ionicons name="search" size={19} color={C.muted}/>
        <TextInput value={profileSearch} onChangeText={setProfileSearch} placeholder={peopleMode ? (searchCategory === 'Creators' ? 'Search creators by name or profession' : 'Search username, nickname or profession') : 'Search ' + searchCategory.toLowerCase()} placeholderTextColor={C.muted} style={s.searchInput} returnKeyType="search"/>
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
              <View style={s.personDetails}><Text style={s.personName}>{profile.display_name}</Text><Text style={s.personUsername}>@{profile.username}</Text>{!!profile.profession_category && <Text style={s.personBio}>{profile.profession_category}</Text>}</View>
            </Pressable>
            <Pressable disabled={busy} onPress={() => toggleFollow(profile)} style={[s.followButton, following && s.followingButton]}><Text style={[s.followButtonText, following && s.followingButtonText]}>{busy ? '...' : following ? 'Following' : 'Follow'}</Text></Pressable>
          </View>;
        })}
      </> : <>
        <Text style={s.hint}>{searchCategory === 'Trending' ? 'Popular public videos, ranked by likes and views.' : 'Public ' + searchCategory.toLowerCase() + ' from USay.'}</Text>
        {loadingVideos ? <Text style={s.hint}>Loading {searchCategory.toLowerCase()}…</Text> : filteredVideos.length === 0 ? <Text style={s.hint}>No {searchCategory.toLowerCase()} found yet.</Text> : filteredVideos.map(video => <Pressable key={video.id} style={s.videoSearchRow} onPress={() => openSearchVideo(video)}>
          <View style={s.videoSearchThumb}><Ionicons name="play-circle" size={36} color="#FFFFFF"/></View>
          <View style={s.personDetails}><Text style={s.personName} numberOfLines={2}>{video.caption || 'Public video'}</Text><Text style={s.personUsername}>{video.like_count || 0} likes · {video.view_count || 0} views · {new Date(video.created_at).toLocaleDateString()}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={C.muted}/>
        </Pressable>)}
      </>}
    </ScrollView>;
  };

  const SimpleScreen = ({ title, subtitle }: {title:string;subtitle:string}) => (
    <View style={s.simple}><Text style={s.pageTitle}>{title}</Text><View style={s.card}><Text style={s.sectionTitle}>{subtitle}</Text><Text style={s.hint}>This section will be connected to USay accounts and services in the next build step.</Text></View></View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg}/>
      <View style={{flex:1}}>
        {selectedProfile ? <OtherProfileScreen/> : tab === 'Profile' ? <Profile/> :
          tab === 'Home' ? <SimpleScreen title="USay" subtitle="Your people, one place."/> :
          tab === 'Public' ? <DiscoverScreen/> :
          tab === 'Create' ? <SimpleScreen title="Create" subtitle="Share a photo, video or update."/> :
          <SimpleScreen title="Inbox" subtitle="Your chats and calls."/>}
      </View>
      <View style={s.nav}>
        {(['Home','Public','Create','Inbox','Profile'] as Tab[]).map((item, i) => {
          const icons = ['home-outline','search-outline','add-circle-outline','mail-outline','person-outline'] as const;
          return <Pressable key={item} style={s.navItem} onPress={() => { setSelectedProfile(null); setTab(item); }}>
            <Ionicons name={icons[i]} size={21} color={tab === item ? C.pink : C.muted}/>
            <Text style={[s.navLabel, tab === item && {color:C.pink}]}>{item === 'Public' ? 'Search' : item}</Text>
          </Pressable>;
        })}
      </View>
      <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
        <View style={s.modalShade}><ScrollView style={s.editSheet} contentContainerStyle={{paddingBottom:28}}>
          <View style={s.modalTop}><Text style={s.sectionTitle}>Edit Profile</Text><Pressable onPress={() => setEditing(false)}><Ionicons name="close" size={24} color={C.text}/></Pressable></View>
          {[[name,setName,'Display name'],[username,setUsername,'Username'],[bio,setBio,'Bio'],[website,setWebsite,'Website'],[occupation,setOccupation,'Occupation']].map(([value,setter,label]:any) =>
            <View key={label} style={s.field}><Text style={s.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={setter} placeholder={label} placeholderTextColor={C.muted} style={s.input} multiline={label==='Bio'} /></View>
          )}
          <Text style={s.hint}>Username: 3–25 lowercase letters, numbers or underscores. Bio: up to 300 characters.</Text>
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
  mediaRow:{flexDirection:'row',gap:8},tile:{flex:1,aspectRatio:.9,borderRadius:13,borderWidth:1,borderColor:'#D8EAF7',borderStyle:'dashed',backgroundColor:C.panel2,alignItems:'center',justifyContent:'center',overflow:'hidden'},
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
  navItem:{flex:1,alignItems:'center',justifyContent:'center',gap:3,paddingBottom:8},navLabel:{fontSize:9,color:C.muted,fontWeight:'700'},
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
});
