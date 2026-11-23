import React, { useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Replace this demo data with the signed-in user's profile or the profile
// returned by your API. Keep the layout the same for every user.
const PROFILE = {
  name: 'MeetApp User',
  username: 'your_username',
  bio: 'Creating connections, sharing ideas and meeting amazing people.',
  website: 'www.example.com',
  following: 128,
  followers: 2450,
  likes: 8920,
  verified: true,
  avatar: '',
};

const IS_OWN_PROFILE = true; // Set to false when viewing another user's profile.

const COLORS = {
  background: '#090B12',
  panel: '#121622',
  panelLight: '#191F2D',
  border: '#252C3B',
  text: '#F7F8FC',
  muted: '#929BAD',
  pink: '#FF356D',
  cyan: '#35D6D0',
};

type MediaSlotProps = {
  index: number;
  isVideo?: boolean;
};

function MediaSlot({ index, isVideo = false }: MediaSlotProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Profile media slot ${index + 1}`}
      style={({ pressed }) => [styles.mediaSlot, pressed && styles.pressed]}
    >
      <View style={styles.mediaPlus}>
        <Ionicons name={isVideo ? 'play' : 'add'} size={19} color={COLORS.text} />
      </View>
      <Text style={styles.slotLabel}>Media {index + 1}</Text>
      {isVideo ? <View style={styles.videoTag}><Text style={styles.videoTagText}>VIDEO</Text></View> : null}
    </Pressable>
  );
}

function CoverSlot({ index }: { index: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Cover gallery slot ${index + 1}`}
      style={({ pressed }) => [styles.coverSlot, pressed && styles.pressed]}
    >
      <Ionicons name="image-outline" size={22} color={COLORS.cyan} />
      <Text style={styles.coverSlotTitle}>Cover {index + 1}</Text>
      <Text style={styles.coverSlotHint}>Add photo/video</Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const [coverViewerVisible, setCoverViewerVisible] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'posts' | 'about'>('posts');

  const closeViewer = () => setCoverViewerVisible(false);

  // A downward swipe closes the full-screen cover viewer.
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > 90) closeViewer();
        },
      }),
    [],
  );

  const avatarPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openCoverViewer = () => setCoverViewerVisible(true);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.topBar}>
          <Pressable style={styles.topIcon} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={23} color={COLORS.text} />
          </Pressable>
          <Text style={styles.topTitle}>Profile</Text>
          <Pressable style={styles.topIcon} accessibilityLabel="More options">
            <Ionicons name="ellipsis-horizontal" size={23} color={COLORS.text} />
          </Pressable>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.coverHeader}>
            <View style={styles.coverHeaderText}>
              <Text style={styles.sectionEyebrow}>YOUR SPACE</Text>
              <Text style={styles.coverHeading}>Cover gallery</Text>
              <Text style={styles.coverSubheading}>Up to 3 photos or videos</Text>
            </View>
            <Pressable style={styles.coverViewButton} onPress={openCoverViewer}>
              <Ionicons name="expand-outline" size={15} color={COLORS.cyan} />
              <Text style={styles.coverViewText}>Preview</Text>
            </Pressable>
          </View>

          <View style={styles.coverSlotsRow}>
            <CoverSlot index={0} />
            <CoverSlot index={1} />
            <CoverSlot index={2} />
          </View>
          <Text style={styles.coverNote}>Touch and hold your profile photo to view your cover full screen.</Text>

          <View style={styles.identityBlock}>
            <Pressable
              onLongPress={openCoverViewer}
              delayLongPress={350}
              onPressIn={() => {
                avatarPressTimer.current = setTimeout(openCoverViewer, 650);
              }}
              onPressOut={() => {
                if (avatarPressTimer.current) clearTimeout(avatarPressTimer.current);
              }}
              style={styles.avatarOuter}
              accessibilityRole="button"
              accessibilityLabel="Hold to view cover gallery"
            >
              {PROFILE.avatar ? (
                <Image source={{ uri: PROFILE.avatar }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>M</Text>
                </View>
              )}
              <View style={styles.avatarCamera}>
                <Ionicons name="camera" size={13} color="#FFFFFF" />
              </View>
            </Pressable>

            <View style={styles.nameRow}>
              <Text style={styles.displayName}>{PROFILE.name}</Text>
              {PROFILE.verified ? (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark" size={12} color="#081015" />
                </View>
              ) : null}
            </View>
            <Text style={styles.username}>@{PROFILE.username}</Text>
            <Text style={styles.bio}>{PROFILE.bio}</Text>
            <Pressable style={styles.websiteRow}>
              <Ionicons name="link-outline" size={16} color={COLORS.cyan} />
              <Text style={styles.website}>{PROFILE.website}</Text>
              <Ionicons name="open-outline" size={13} color={COLORS.muted} />
            </Pressable>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{PROFILE.following.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{PROFILE.followers.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{PROFILE.likes.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Likes</Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            {IS_OWN_PROFILE ? (
              <>
                <Pressable style={styles.primaryAction}>
                  <Ionicons name="create-outline" size={17} color="#FFFFFF" />
                  <Text style={styles.primaryActionText}>Edit Profile</Text>
                </Pressable>
                <Pressable style={styles.secondaryAction}>
                  <Ionicons name="settings-outline" size={18} color={COLORS.text} />
                  <Text style={styles.secondaryActionText}>Settings</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable style={styles.primaryAction}>
                  <Ionicons name="person-add-outline" size={17} color="#FFFFFF" />
                  <Text style={styles.primaryActionText}>Follow</Text>
                </Pressable>
                <Pressable style={styles.secondaryAction}>
                  <Ionicons name="chatbubble-ellipses-outline" size={17} color={COLORS.text} />
                  <Text style={styles.secondaryActionText}>Message</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        <View style={styles.contentCard}>
          <View style={styles.contentHeader}>
            <Text style={styles.contentTitle}>Profile media</Text>
            <Text style={styles.contentCount}>3 SLOTS</Text>
          </View>
          <View style={styles.tabsRow}>
            <Pressable onPress={() => setSelectedTab('posts')} style={styles.tabButton}>
              <Ionicons name="grid-outline" size={17} color={selectedTab === 'posts' ? COLORS.cyan : COLORS.muted} />
              <Text style={[styles.tabText, selectedTab === 'posts' && styles.activeTabText]}>Posts</Text>
              {selectedTab === 'posts' ? <View style={styles.activeTabLine} /> : null}
            </Pressable>
            <Pressable onPress={() => setSelectedTab('about')} style={styles.tabButton}>
              <Ionicons name="person-circle-outline" size={18} color={selectedTab === 'about' ? COLORS.cyan : COLORS.muted} />
              <Text style={[styles.tabText, selectedTab === 'about' && styles.activeTabText]}>About</Text>
              {selectedTab === 'about' ? <View style={styles.activeTabLine} /> : null}
            </Pressable>
          </View>

          {selectedTab === 'posts' ? (
            <>
              <View style={styles.mediaGrid}>
                <MediaSlot index={0} />
                <MediaSlot index={1} isVideo />
                <MediaSlot index={2} />
              </View>
              <Text style={styles.mediaHint}>Add up to 3 photos or videos. Each video must be 1 MB or smaller.</Text>
            </>
          ) : (
            <View style={styles.aboutPanel}>
              <View style={styles.aboutRow}>
                <Ionicons name="briefcase-outline" size={18} color={COLORS.cyan} />
                <Text style={styles.aboutText}>Occupation not added</Text>
              </View>
              <View style={styles.aboutRow}>
                <Ionicons name="time-outline" size={18} color={COLORS.cyan} />
                <Text style={styles.aboutText}>Activity status: Available</Text>
              </View>
              <View style={styles.aboutRow}>
                <Ionicons name="globe-outline" size={18} color={COLORS.cyan} />
                <Text style={styles.aboutText}>{PROFILE.website}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.bottomSpace} />
      </ScrollView>

      <Modal
        visible={coverViewerVisible}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={closeViewer}
      >
        <View style={styles.viewer} {...panResponder.panHandlers}>
          <View style={styles.viewerTop}>
            <Text style={styles.viewerTitle}>Cover gallery</Text>
            <Pressable onPress={closeViewer} style={styles.viewerClose}>
              <Ionicons name="close" size={25} color={COLORS.text} />
            </Pressable>
          </View>
          <View style={styles.viewerEmpty}>
            <Ionicons name="images-outline" size={54} color={COLORS.cyan} />
            <Text style={styles.viewerEmptyTitle}>Your cover gallery</Text>
            <Text style={styles.viewerEmptyText}>Your cover photos and videos will appear here once you add them.</Text>
            <Text style={styles.swipeHint}>Swipe down to close</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  topBar: {
    height: 54, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  topIcon: {
    width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.panel,
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  profileCard: {
    backgroundColor: COLORS.panel, borderRadius: 24, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  coverHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  coverHeaderText: { flex: 1 },
  sectionEyebrow: { color: COLORS.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.8 },
  coverHeading: { color: COLORS.text, fontSize: 17, fontWeight: '800', marginTop: 4 },
  coverSubheading: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  coverViewButton: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1,
    borderColor: COLORS.cyan, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7,
  },
  coverViewText: { color: COLORS.cyan, fontSize: 11, fontWeight: '700' },
  coverSlotsRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  coverSlot: {
    flex: 1, minHeight: 84, borderRadius: 14, borderWidth: 1,
    borderStyle: 'dashed', borderColor: '#3A4658', backgroundColor: COLORS.panelLight,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  coverSlotTitle: { color: COLORS.text, fontSize: 11, fontWeight: '700', marginTop: 5 },
  coverSlotHint: { color: COLORS.muted, fontSize: 9, marginTop: 2 },
  coverNote: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 9 },
  identityBlock: { alignItems: 'center', paddingTop: 18 },
  avatarOuter: {
    width: 94, height: 94, borderRadius: 47, padding: 4,
    borderWidth: 2, borderColor: COLORS.pink, marginBottom: 10,
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 44, backgroundColor: COLORS.panelLight },
  avatarFallback: {
    flex: 1, borderRadius: 44, backgroundColor: '#252E42',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { color: COLORS.cyan, fontSize: 36, fontWeight: '900' },
  avatarCamera: {
    position: 'absolute', right: -1, bottom: 0, width: 27, height: 27,
    borderRadius: 14, backgroundColor: COLORS.pink, borderWidth: 2,
    borderColor: COLORS.panel, alignItems: 'center', justifyContent: 'center',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  displayName: { color: COLORS.text, fontSize: 21, fontWeight: '900' },
  verifiedBadge: {
    width: 17, height: 17, borderRadius: 9, backgroundColor: COLORS.cyan,
    alignItems: 'center', justifyContent: 'center',
  },
  username: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  bio: { color: '#D3D8E2', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 12, maxWidth: 290 },
  websiteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 },
  website: { color: COLORS.cyan, fontSize: 12, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    marginTop: 20, paddingVertical: 15, borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNumber: { color: COLORS.text, fontSize: 17, fontWeight: '900' },
  statLabel: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  statDivider: { width: 1, height: 28, backgroundColor: COLORS.border },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 15 },
  primaryAction: {
    flex: 1, height: 45, borderRadius: 14, backgroundColor: COLORS.pink,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  primaryActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  secondaryAction: {
    flex: 1, height: 45, borderRadius: 14, backgroundColor: COLORS.panelLight,
    borderWidth: 1, borderColor: COLORS.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  secondaryActionText: { color: COLORS.text, fontSize: 13, fontWeight: '800' },
  contentCard: {
    backgroundColor: COLORS.panel, borderRadius: 22, padding: 16,
    borderWidth: 1, borderColor: COLORS.border, marginTop: 14,
  },
  contentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  contentTitle: { color: COLORS.text, fontSize: 16, fontWeight: '900' },
  contentCount: { color: COLORS.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: COLORS.border, marginTop: 13 },
  tabButton: {
    flex: 1, height: 42, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 7, position: 'relative',
  },
  tabText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  activeTabText: { color: COLORS.cyan },
  activeTabLine: {
    position: 'absolute', bottom: -1, height: 2, width: 54,
    borderRadius: 2, backgroundColor: COLORS.cyan,
  },
  mediaGrid: { flexDirection: 'row', gap: 9, marginTop: 14 },
  mediaSlot: {
    flex: 1, aspectRatio: 0.86, borderRadius: 15, backgroundColor: COLORS.panelLight,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center',
  },
  mediaPlus: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#293346',
    alignItems: 'center', justifyContent: 'center',
  },
  slotLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700', marginTop: 8 },
  videoTag: {
    position: 'absolute', top: 8, right: 8, borderRadius: 5,
    backgroundColor: COLORS.pink, paddingHorizontal: 5, paddingVertical: 3,
  },
  videoTagText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },
  mediaHint: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 10 },
  aboutPanel: { paddingTop: 14, gap: 15 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aboutText: { color: '#D3D8E2', fontSize: 12 },
  bottomSpace: { height: 28 },
  pressed: { opacity: 0.72 },
  viewer: { flex: 1, backgroundColor: '#05070D', paddingHorizontal: 20, paddingTop: 42 },
  viewerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  viewerTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  viewerClose: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.panel,
    alignItems: 'center', justifyContent: 'center',
  },
  viewerEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  viewerEmptyTitle: { color: COLORS.text, fontSize: 19, fontWeight: '900', marginTop: 17 },
  viewerEmptyText: { color: COLORS.muted, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 8 },
  swipeHint: { color: COLORS.cyan, fontSize: 11, fontWeight: '700', marginTop: 28 },
});
