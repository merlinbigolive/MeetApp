import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Image, Modal, Pressable, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, View, useWindowDimensions, Animated, PanResponder
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { supabase } from './supabase';

type Media = { uri: string; type: 'image' | 'video'; name?: string; size?: number };
type Tab = 'Home' | 'Public' | 'Create' | 'Inbox' | 'Profile';

const C = {
  bg: '#FFFFFF', panel: '#FFFFFF', panel2: '#FFFFFF', text: '#172B3A',
  muted: '#777777', pink: '#258FEA', cyan: '#43B8E8', border: '#EEEEEE'
};

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
  const [editing, setEditing] = useState(false);
  const [viewer, setViewer] = useState<Media | null>(null);
  const [coverExpanded, setCoverExpanded] = useState(false);
  const avatarDrag = useRef(new Animated.Value(0)).current;
  const avatarPan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_: any, g: any) => g.dy > 8,
    onPanResponderMove: (_: any, g: any) => avatarDrag.setValue(Math.max(0, Math.min(g.dy, 120))),
    onPanResponderRelease: (_: any, g: any) => {
      Animated.spring(avatarDrag, { toValue: 0, useNativeDriver: true }).start();
      if (g.dy > 55 && covers.length) setCoverExpanded(true);
    },
  }), [avatarDrag, covers.length]);
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
      if (data.activity_status) {
        const status = data.activity_status.toLowerCase();
        setActivity(status.charAt(0).toUpperCase() + status.slice(1));
      }
    };
    loadCloudProfile();
    return () => { active = false; };
  }, []);

  const saveProfile = async () => {
    if (supabase) {
      const { data: authData } = await supabase.auth.getSession();
      const userId = authData.session?.user.id;
      if (userId) {
        const { error } = await supabase.from('profiles').update({
          display_name: name.trim(),
          username: username.trim().replace(/^@/, ''),
          bio: bio.trim(),
          website_url: website.trim() || null,
          profession_category: occupation.trim() || null,
          activity_status: activity.toLowerCase(),
          updated_at: new Date().toISOString(),
        }).eq('id', userId);
        if (error) {
          Alert.alert('Profile not saved', error.message);
          return;
        }
      }
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
    if (type === 'video' && (typeof a.fileSize !== 'number' || a.fileSize > 1024 * 1024)) {
      Alert.alert('Video size limit', 'Please choose a video that is 1 MB or smaller. If its size cannot be checked, choose a photo instead.');
      return;
    }
    const media: Media = { uri: a.uri, type, name: a.fileName ?? undefined, size: a.fileSize ?? undefined };
    if (kind === 'avatar') setAvatar(media);
    if (kind === 'cover') setCovers(old => index === undefined
      ? [...old, media].slice(0, 3)
      : old.map((m, i) => i === index ? media : m));
    if (kind === 'post') setPosts(old => index === undefined
      ? [...old, media].slice(0, 3)
      : old.map((m, i) => i === index ? media : m));
  };

  const removeMedia = (kind: 'cover' | 'post', index: number) => {
    if (kind === 'cover') setCovers(old => old.filter((_, i) => i !== index));
    else setPosts(old => old.filter((_, i) => i !== index));
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
    <ScrollView contentContainerStyle={s.profileScroll} showsVerticalScrollIndicator={false}>
      <View style={s.top}><Text style={s.pageTitle}>꒤ꇙꋬꌦ</Text></View>
      <View style={s.identity}>
        <View style={s.coverBackdrop}>
          {covers[0]?.type === 'image' ? <Image source={{uri:covers[0].uri}} style={s.coverBackdropImage}/> :
            covers[0]?.type === 'video' ? <View style={s.coverBackdropVideo}><Ionicons name="play-circle" size={28} color="#FFFFFF"/></View> :
            <View style={s.coverBackdropEmpty}/>}
          <View style={s.coverBackdropShade}/>
          {isOwnProfile && <Pressable onPress={() => chooseMedia('cover')} style={s.coverEdit}><Ionicons name="camera" size={15} color="#FFFFFF"/></Pressable>}
          {!!covers.length && <Pressable onPress={() => setCoverExpanded(true)} style={s.coverViewTap}/>}
        </View>
        <Animated.View {...avatarPan.panHandlers} style={{ transform: [{ translateY: avatarDrag }] }}>
        <Pressable onPress={() => isOwnProfile ? chooseMedia('avatar') : undefined} style={s.avatarWrap}>
          {avatar ? <Image source={{uri:avatar.uri}} style={s.avatar} /> : <View style={s.avatarFallback}><Ionicons name="person" size={38} color={C.cyan}/></View>}
          {isOwnProfile && <View style={s.camera}><Ionicons name="camera" size={13} color="#fff"/></View>}
        </Pressable>
        </Animated.View>
        <View style={s.nameLine}><Text style={s.name}>{name}</Text><View style={s.verified}><Ionicons name="checkmark" size={12} color="#FFFFFF"/></View></View>
        <Text style={s.username}>@{username.replace(/^@/, '')}</Text>
        <Text style={s.bio}>{bio}</Text>
        {!!website && <Pressable onPress={openWebsite} style={s.websiteLine}><Ionicons name="link" color={C.cyan} size={15}/><Text style={s.website}>{website}</Text></Pressable>}
         
      </View>
      <View style={s.profileBody}>
        <View style={s.stats}>
          <View style={s.stat}><Text style={s.statNum}>128</Text><Text style={s.statLabel}>Following</Text></View>
          <View style={s.stat}><Text style={s.statNum}>2,450</Text><Text style={s.statLabel}>Followers</Text></View>
          <View style={s.stat}><Text style={s.statNum}>8,920</Text><Text style={s.statLabel}>Likes</Text></View>
        </View>
        <View style={s.actions}>
          {isOwnProfile ? <>
            <Pressable style={s.primary} onPress={() => setEditing(true)}><Ionicons name="create-outline" color="#fff" size={17}/><Text style={s.primaryText}>Edit Profile</Text></Pressable>
            <Pressable style={s.secondary} onPress={() => Alert.alert('Settings', 'Profile settings will be connected in the next backend step.')}><Ionicons name="settings-outline" color={C.text} size={17}/><Text style={s.secondaryText}>Settings</Text></Pressable>
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
        <Text style={s.footerNote}>Profile edits and media are currently stored on this device only. Cloud sync will be connected in the backend step.</Text>
      </View>
    </ScrollView>
  );

  const SimpleScreen = ({ title, subtitle }: {title:string;subtitle:string}) => (
    <View style={s.simple}><Text style={s.pageTitle}>{title}</Text><View style={s.card}><Text style={s.sectionTitle}>{subtitle}</Text><Text style={s.hint}>This section will be connected to USay accounts and services in the next build step.</Text></View></View>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg}/>
      <View style={{flex:1}}>
        {tab === 'Profile' ? <Profile/> :
          tab === 'Home' ? <SimpleScreen title="USay" subtitle="Your people, one place."/> :
          tab === 'Public' ? <SimpleScreen title="Public Feed" subtitle="Discover community posts."/> :
          tab === 'Create' ? <SimpleScreen title="Create" subtitle="Share a photo, video or update."/> :
          <SimpleScreen title="Inbox" subtitle="Your chats and calls."/>}
      </View>
      <View style={s.nav}>
        {(['Home','Public','Create','Inbox','Profile'] as Tab[]).map((item, i) => {
          const icons = ['home-outline','globe-outline','add-circle-outline','mail-outline','person-outline'] as const;
          return <Pressable key={item} style={s.navItem} onPress={() => setTab(item)}>
            <Ionicons name={icons[i]} size={21} color={tab === item ? C.pink : C.muted}/>
            <Text style={[s.navLabel, tab === item && {color:C.pink}]}>{item}</Text>
          </Pressable>;
        })}
      </View>
      <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
        <View style={s.modalShade}><ScrollView style={s.editSheet} contentContainerStyle={{paddingBottom:28}}>
          <View style={s.modalTop}><Text style={s.sectionTitle}>Edit Profile</Text><Pressable onPress={() => setEditing(false)}><Ionicons name="close" size={24} color={C.text}/></Pressable></View>
          {[[name,setName,'Display name'],[username,setUsername,'Username'],[bio,setBio,'Bio'],[website,setWebsite,'Website'],[occupation,setOccupation,'Occupation']].map(([value,setter,label]:any) =>
            <View key={label} style={s.field}><Text style={s.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={setter} placeholder={label} placeholderTextColor={C.muted} style={s.input} multiline={label==='Bio'} /></View>
          )}
          <Text style={s.fieldLabel}>Activity status</Text>
          <View style={s.activityGrid}>{['Available','Busy','Work','Drive','Gym','School','College'].map(x=><Pressable key={x} onPress={()=>setActivity(x)} style={[s.activityChip,activity===x&&s.activityActive]}><Text style={[s.activityText,activity===x&&{color:C.cyan}]}>{x}</Text></Pressable>)}</View>
          <Pressable style={s.primary} onPress={()=>setEditing(false)}><Text style={s.primaryText}>Save on this device</Text></Pressable>
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
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={()=>setViewer(null)}>
        <View style={s.viewer}><Pressable style={s.viewerClose} onPress={()=>setViewer(null)}><Ionicons name="close" size={26} color="#fff"/></Pressable>
          {viewer?.type === 'image' ? <Image source={{uri:viewer.uri}} resizeMode="contain" style={{width:'100%',height:'82%'}}/> :
            <View style={s.videoPreview}><Ionicons name="play-circle" size={60} color={C.cyan}/><Text style={s.sectionTitle}>Video selected</Text><Text style={s.hint}>Video playback preview will be enabled with the media player integration.</Text></View>}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg}, scroll:{padding:16,paddingBottom:22,gap:14},
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
