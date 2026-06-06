import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
  Modal,
  Switch,
} from 'react-native';
import Svg, { Polyline as SvgPolyline, Circle as SvgCircle, Text as SvgText, Line } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import ImageCropPicker from 'react-native-image-crop-picker';
import { useTheme } from '../utils/ThemeContext';
import { useNav } from '../utils/NavigationContext';
import { useAuth } from '../utils/AuthContext';
import { upsertProfile } from '../utils/cloudSync';
import { supabase } from '../utils/supabase';
import { isUsernameAvailable, getFriendCounts, getFollowing, getFollowers, FriendProfile } from '../utils/friendsApi';
import { FONTS, SPACING, ACCENT_COLORS, AccentId, Climb, convertGrade, GRADE_DIFFICULTY } from '../utils/theme';
import { gradeToNum } from '../utils/gradeUtils';
import { getAllClimbs, getAllSessions, getPreferredDisplayGrades, savePreferredDisplayGrades } from '../utils/storage';


export default function AccountScreen() {
  const { colors, mode, accentId, setMode, setAccent } = useTheme();
  const { settingsOpen, closeSettings, navigate, screen, friendsOpen, viewFriendProfile } = useNav();
  const { user, profileName, avatarUrl, username, hometown, bio, isPrivate, signOut, deleteAccount, refreshProfile, syncNow } = useAuth();

  const [friendCounts, setFriendCounts] = useState<{ followers: number; following: number } | null>(null);
  const [followListModal, setFollowListModal] = useState<'following' | 'followers' | null>(null);
  const [followTab, setFollowTab] = useState<'following' | 'followers'>('following');
  const [followingList, setFollowingList] = useState<FriendProfile[]>([]);
  const [followersList, setFollowersList] = useState<FriendProfile[]>([]);
  const [followListLoading, setFollowListLoading] = useState(false);
  const [climbStats, setClimbStats] = useState<ClimbStatsData | null>(null); // defined below component
  const [editProfileVisible, setEditProfileVisible] = useState(false);

  // Editable field states (inside settings modal)
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(profileName ?? '');
  const [savingName, setSavingName] = useState(false);

  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameValue, setUsernameValue] = useState(username ?? '');
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const [editingHometown, setEditingHometown] = useState(false);
  const [hometownValue, setHometownValue] = useState(hometown ?? '');
  const [savingHometown, setSavingHometown] = useState(false);

  const [editingBio, setEditingBio] = useState(false);
  const [bioValue, setBioValue] = useState(bio ?? '');
  const [savingBio, setSavingBio] = useState(false);

  const [editingEmail, setEditingEmail] = useState(false);
  const [emailValue, setEmailValue] = useState(user?.email ?? '');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const [pendingAvatarUri, setPendingAvatarUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [preferredBoulder, setPreferredBoulder] = useState<'v-scale' | 'font'>('v-scale');
  const [preferredRope, setPreferredRope] = useState<'yds' | 'french' | 'british'>('yds');

  // Populate form fields whenever profile data changes
  useEffect(() => {
    if (user) {
      setNameValue(profileName ?? '');
      setUsernameValue(username ?? '');
      setHometownValue(hometown ?? '');
      setEmailValue(user.email ?? '');
    }
  }, [user, profileName, username, hometown]);

  // Realtime subscription: update follow counts the instant the DB row changes
  useEffect(() => {
    if (!user) return;

    // Initial fetch
    getFriendCounts(user.id).then(setFriendCounts).catch(() => {});

    // Subscribe to any UPDATE on this user's profile row
    const channel = supabase
      .channel(`profile-counts-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        () => {
          getFriendCounts(user.id).then(setFriendCounts).catch(() => {});
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  useEffect(() => {
    if (screen === 'account') {
      loadStats();
    }
  }, [screen]);

  async function loadStats() {
    const { boulder, rope } = await getPreferredDisplayGrades();
    const boulderSys = boulder as 'v-scale' | 'font';
    const ropeSys = rope as 'yds' | 'french' | 'british';
    setPreferredBoulder(boulderSys);
    setPreferredRope(ropeSys);

    const [climbs, sessions] = await Promise.all([getAllClimbs(), getAllSessions()]);
    const now = new Date();
    const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const monthAgo = thirtyDaysAgo.toISOString().slice(0, 10);

    const thisMonthClimbs = climbs.filter(c => c.date.slice(0, 10) >= monthAgo);
    const thisMonthSends = thisMonthClimbs.filter(c => c.outcome === 'send' || c.outcome === 'flash');
    const thisMonthSessionIds = new Set(thisMonthClimbs.map(c => c.sessionId));

    const sends = climbs.filter(c => c.outcome === 'send' || c.outcome === 'flash');

    const GRADED_TYPES = [
      { id: 'boulder',  label: 'Boulder' },
      { id: 'top_rope', label: 'Top Rope' },
      { id: 'sport',    label: 'Sport' },
      { id: 'trad',     label: 'Trad' },
    ] as const;

    const hardestByType: HardestByType[] = GRADED_TYPES.map(({ id, label }) => {
      const typeSends = sends.filter(c => c.type === id);
      if (typeSends.length === 0) return { label, grade: null, gradeSystem: null };
      const preferredSys = id === 'boulder' ? boulderSys : ropeSys;
      const best = typeSends
        .map(c => ({ converted: convertGrade(c.grade, c.gradeSystem, preferredSys) }))
        .sort((a, b) => {
          const da = GRADE_DIFFICULTY[preferredSys]?.[a.converted] ?? 0;
          const db = GRADE_DIFFICULTY[preferredSys]?.[b.converted] ?? 0;
          return db - da;
        })[0];
      return { label, grade: best?.converted ?? null, gradeSystem: preferredSys };
    });

    const sysCounts: Record<string, number> = {};
    sends.forEach(c => { sysCounts[c.gradeSystem] = (sysCounts[c.gradeSystem] || 0) + 1; });
    const dominantSys = Object.entries(sysCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'v-scale';

    const recentSessions = [...sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).reverse();
    const sessionPoints = recentSessions.map(s => {
      const sessionSends = sends.filter(c => c.sessionId === s.id && c.gradeSystem === dominantSys);
      if (sessionSends.length === 0) return null;
      const avg = sessionSends.reduce((sum, c) => sum + gradeToNum(c.grade, dominantSys), 0) / sessionSends.length;
      return { date: s.date.slice(5, 10), avg };
    }).filter(Boolean) as { date: string; avg: number }[];

    setClimbStats({
      thisMonthClimbs: thisMonthClimbs.length,
      thisMonthSessions: thisMonthSessionIds.size,
      thisMonthSends: thisMonthSends.length,
      totalSessions: sessions.length,
      totalClimbs: climbs.length,
      totalSends: sends.length,
      hardestByType,
      sessionPoints,
      dominantSys,
    });
  }

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.notLoggedIn}>
          <Text style={[styles.notLoggedInTitle, { color: colors.textPrimary }]}>No Account</Text>
          <Text style={[styles.notLoggedInDesc, { color: colors.textSecondary }]}>
            Sign in to sync your climbs across devices and keep your data safe.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.accent }]}
            onPress={() => navigate('login')}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Sign In / Create Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const initials = (profileName ?? user.email ?? '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  async function openFollowList(type: 'following' | 'followers') {
    if (!user) return;
    setFollowTab(type);
    setFollowListModal(type);
    setFollowListLoading(true);
    setFollowingList([]);
    setFollowersList([]);
    try {
      const [following, followers] = await Promise.all([getFollowing(user.id), getFollowers(user.id)]);
      setFollowingList(following);
      setFollowersList(followers);
    } catch {}
    setFollowListLoading(false);
  }

  async function handleSaveName() {
    if (!nameValue.trim()) return;
    setSavingName(true);
    try {
      await upsertProfile(user.id, nameValue.trim(), avatarUrl ?? undefined);
      await refreshProfile();
      setEditingName(false);
    } catch {
      Alert.alert('Error', 'Failed to save name.');
    }
    setSavingName(false);
  }

  async function handleSaveUsername() {
    const trimmed = usernameValue.trim().toLowerCase().replace(/^@/, '');
    if (!trimmed) { setUsernameError('Username cannot be empty.'); return; }
    if (!/^[a-z0-9_]{3,20}$/.test(trimmed)) {
      setUsernameError('3–20 characters: letters, numbers, underscores only.');
      return;
    }
    if (trimmed === username) { setEditingUsername(false); return; }
    setSavingUsername(true);
    setUsernameError(null);
    try {
      const available = await isUsernameAvailable(trimmed);
      if (!available) {
        setUsernameError('That username is already taken.');
        setSavingUsername(false);
        return;
      }
      await upsertProfile(user.id, profileName ?? '', avatarUrl ?? undefined, trimmed);
      await refreshProfile();
      setEditingUsername(false);
    } catch {
      setUsernameError('Failed to save username.');
    }
    setSavingUsername(false);
  }

  async function handleSaveHometown() {
    const trimmed = hometownValue.trim();
    setSavingHometown(true);
    try {
      await upsertProfile(user.id, profileName ?? '', avatarUrl ?? undefined, username ?? undefined, trimmed || undefined);
      await refreshProfile();
      setEditingHometown(false);
    } catch {
      Alert.alert('Error', 'Failed to save hometown.');
    }
    setSavingHometown(false);
  }

  async function handleSaveBio() {
    const trimmed = bioValue.trim();
    setSavingBio(true);
    try {
      await upsertProfile(user.id, profileName ?? '', avatarUrl ?? undefined, username ?? undefined, hometown ?? undefined, trimmed || undefined);
      await refreshProfile();
      setEditingBio(false);
    } catch {
      Alert.alert('Error', 'Failed to save bio.');
    }
    setSavingBio(false);
  }

  async function handlePickPhoto() {
    try {
      const image = await ImageCropPicker.openPicker({
        width: 400,
        height: 400,
        cropping: true,
        cropperCircleOverlay: true,
        compressImageQuality: 0.9,
        cropperToolbarTitle: 'Move and Scale',
      });
      await handleConfirmAvatar(image.path);
    } catch {
      // User cancelled — no-op
    }
  }

  async function handleConfirmAvatar(uri?: string) {
    const avatarUri = uri ?? pendingAvatarUri;
    if (!avatarUri || !user) return;
    setUploadingAvatar(true);
    try {
      const path = `${user.id}/avatar.jpg`;
      const { data: { session } } = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append('file', { uri: avatarUri, name: 'avatar.jpg', type: 'image/jpeg' } as any);
      const uploadResponse = await fetch(
        `https://oexaqytotrxqbxmzqabu.supabase.co/storage/v1/object/avatars/${path}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'x-upsert': 'true',
          },
          body: formData,
        }
      );
      if (!uploadResponse.ok) throw new Error(await uploadResponse.text());
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      await upsertProfile(user.id, profileName ?? '', publicUrl);
      await refreshProfile();
      setPendingAvatarUri(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? JSON.stringify(e) ?? 'Failed to update photo.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSaveEmail() {
    const trimmed = emailValue.trim().toLowerCase();
    if (!trimmed) { setEmailError('Email cannot be empty.'); return; }
    if (trimmed === user?.email) { setEditingEmail(false); return; }
    setSavingEmail(true);
    setEmailError(null);
    try {
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) { setEmailError(error.message); }
      else { setEmailSent(true); setEditingEmail(false); }
    } catch {
      setEmailError('Failed to update email.');
    }
    setSavingEmail(false);
  }

  async function handleSyncNow() {
    setSyncing(true);
    await syncNow();
    setSyncing(false);
    Alert.alert('Synced', 'Your data has been synced with the cloud.');
  }

  async function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            await signOut();
            setSigningOut(false);
            navigate('log');
          },
        },
      ]
    );
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This will permanently delete all your climbs, sessions, projects and profile. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'Your data cannot be recovered once deleted.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Account',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    const { error } = await deleteAccount();
                    setDeleting(false);
                    if (error) Alert.alert('Error', error);
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  useEffect(() => {
    if (editProfileVisible) {
      setNameValue(profileName ?? '');
      setUsernameValue(username ?? '');
      setHometownValue(hometown ?? '');
      setBioValue(bio ?? '');
      setEmailValue(user?.email ?? '');
      setEditingName(false);
      setEditingUsername(false);
      setEditingHometown(false);
      setEditingBio(false);
      setEditingEmail(false);
      setUsernameError(null);
      setEmailError(null);
      setEmailSent(false);
    }
  }, [editProfileVisible]);

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.bgElevated,
      borderColor: colors.border,
      color: colors.textPrimary,
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        {/* Top row: avatar + name/username/hometown */}
        <View style={styles.profileTop}>
          <TouchableOpacity onPress={handlePickPhoto} activeOpacity={0.8}>
            <View style={[styles.avatarCircle, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={[styles.avatarInitials, { color: colors.accent }]}>{initials}</Text>
              )}
            </View>
          </TouchableOpacity>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.textPrimary }]} numberOfLines={1}>
              {profileName || 'Your Name'}
            </Text>
            {username ? (
              <Text style={[styles.profileUsername, { color: colors.textSecondary }]}>@{username}</Text>
            ) : null}
            {hometown ? (
              <Text style={[styles.profileHometown, { color: colors.textMuted }]} numberOfLines={1}>
                {hometown}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Bio */}
        {bio ? (
          <Text style={[styles.profileBio, { color: colors.textSecondary }]}>{bio}</Text>
        ) : null}

        {/* Bottom row: counts left, edit profile pill right */}
        <View style={styles.profileBottom}>
          <View style={styles.countsRow}>
            <TouchableOpacity style={styles.countItem} onPress={() => openFollowList('following')} activeOpacity={0.7}>
              <Text style={[styles.countLabel, { color: colors.textMuted }]}>Following</Text>
              <Text style={[styles.countNumber, { color: colors.textPrimary }]}>{friendCounts?.following ?? '—'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.countItem} onPress={() => openFollowList('followers')} activeOpacity={0.7}>
              <Text style={[styles.countLabel, { color: colors.textMuted }]}>Followers</Text>
              <Text style={[styles.countNumber, { color: colors.textPrimary }]}>{friendCounts?.followers ?? '—'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => setEditProfileVisible(true)}
            activeOpacity={0.7}
            style={[styles.editProfileBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.editProfileText, { color: colors.textPrimary }]}>Edit Profile</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Section */}
      {climbStats && <ClimbStatsSection stats={climbStats} colors={colors} />}

      {/* Following / Followers Modal */}
      {/* Avatar preview / confirm modal */}
      <Modal
        visible={pendingAvatarUri !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setPendingAvatarUri(null)}
      >
        <View style={styles.avatarModalOverlay}>
          <View style={[styles.avatarModalCard, { backgroundColor: colors.bgCard }]}>
            <Text style={[styles.avatarModalTitle, { color: colors.textPrimary }]}>Use this photo?</Text>
            <View style={[styles.avatarModalPreview, { borderColor: colors.accent }]}>
              {pendingAvatarUri && (
                <Image source={{ uri: pendingAvatarUri }} style={styles.avatarModalImage} />
              )}
            </View>
            <View style={styles.avatarModalButtons}>
              <TouchableOpacity
                onPress={() => setPendingAvatarUri(null)}
                style={[styles.avatarModalBtn, { borderColor: colors.border }]}
                activeOpacity={0.7}
                disabled={uploadingAvatar}
              >
                <Text style={[styles.avatarModalBtnText, { color: colors.textSecondary }]}>Choose Different</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmAvatar}
                style={[styles.avatarModalBtn, styles.avatarModalBtnPrimary, { backgroundColor: colors.accent }]}
                activeOpacity={0.7}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={[styles.avatarModalBtnText, { color: '#fff' }]}>Use Photo</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={followListModal !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFollowListModal(null)}
      >
        <View style={[styles.followModalContainer, { backgroundColor: colors.bg }]}>
          {/* Header with tab switcher */}
          <View style={[styles.followModalHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.followModalTabs}>
              <TouchableOpacity onPress={() => setFollowTab('following')} activeOpacity={0.7} style={styles.followModalTab}>
                <Text style={[styles.followModalTabText, { color: followTab === 'following' ? colors.textPrimary : colors.textMuted }, followTab === 'following' && { fontFamily: FONTS.family.bold }]}>
                  Following
                </Text>
                {followTab === 'following' && <View style={[styles.followModalTabBar, { backgroundColor: colors.accent }]} />}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFollowTab('followers')} activeOpacity={0.7} style={styles.followModalTab}>
                <Text style={[styles.followModalTabText, { color: followTab === 'followers' ? colors.textPrimary : colors.textMuted }, followTab === 'followers' && { fontFamily: FONTS.family.bold }]}>
                  Followers
                </Text>
                {followTab === 'followers' && <View style={[styles.followModalTabBar, { backgroundColor: colors.accent }]} />}
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setFollowListModal(null)} activeOpacity={0.7}>
              <Text style={[styles.followModalDone, { color: colors.accent }]}>Done</Text>
            </TouchableOpacity>
          </View>

          {followListLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: SPACING.xl }} />
          ) : (() => {
            const list = followTab === 'following' ? followingList : followersList;
            const emptyText = followTab === 'following' ? "You're not following anyone yet." : "No followers yet.";
            return list.length === 0 ? (
              <Text style={[styles.followModalEmpty, { color: colors.textMuted }]}>{emptyText}</Text>
            ) : (
              <ScrollView contentContainerStyle={styles.followModalList}>
                {list.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.followModalRow, { borderBottomColor: colors.border }]}
                    activeOpacity={0.7}
                    onPress={() => {
                      setFollowListModal(null);
                      viewFriendProfile(p);
                    }}
                  >
                    <View style={[styles.followModalAvatar, { backgroundColor: colors.accentSoft }]}>
                      {p.avatar_url ? (
                        <Image source={{ uri: p.avatar_url }} style={styles.followModalAvatarImage} />
                      ) : (
                        <Text style={[styles.followModalAvatarText, { color: colors.accent }]}>
                          {(p.name ?? '?')[0].toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View>
                      <Text style={[styles.followModalName, { color: colors.textPrimary }]}>{p.name}</Text>
                      {p.username ? <Text style={[styles.followModalUsername, { color: colors.textMuted }]}>@{p.username}</Text> : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            );
          })()}
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal
        visible={editProfileVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditProfileVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.bg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Edit Profile</Text>
            <TouchableOpacity onPress={() => setEditProfileVisible(false)} activeOpacity={0.7}>
              <Text style={[styles.doneText, { color: colors.accent }]}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>PROFILE</Text>

              {/* Name */}
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name</Text>
                {editingName ? (
                  <View style={styles.editRow}>
                    <TextInput
                      style={[inputStyle, styles.fieldInput]}
                      value={nameValue}
                      onChangeText={setNameValue}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleSaveName}
                    />
                    <TouchableOpacity
                      style={[styles.saveButton, { backgroundColor: colors.accent }]}
                      onPress={handleSaveName}
                      disabled={savingName}
                      activeOpacity={0.8}
                    >
                      {savingName ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>Save</Text>}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.fieldValueRow}
                    onPress={() => { setNameValue(profileName ?? ''); setEditingName(true); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.fieldValue, { color: profileName ? colors.textPrimary : colors.textMuted }]}>
                      {profileName || 'Tap to add name'}
                    </Text>
                    <Text style={[styles.editHint, { color: colors.accent }]}>Edit</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Username */}
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Username</Text>
                {editingUsername ? (
                  <View>
                    <View style={styles.editRow}>
                      <TextInput
                        style={[inputStyle, styles.fieldInput]}
                        value={usernameValue}
                        onChangeText={v => { setUsernameValue(v); setUsernameError(null); }}
                        autoFocus
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={handleSaveUsername}
                        placeholder="letters, numbers, _"
                        placeholderTextColor={colors.textMuted}
                      />
                      <TouchableOpacity
                        style={[styles.saveButton, { backgroundColor: colors.accent }]}
                        onPress={handleSaveUsername}
                        disabled={savingUsername}
                        activeOpacity={0.8}
                      >
                        {savingUsername ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>Save</Text>}
                      </TouchableOpacity>
                    </View>
                    {usernameError && <Text style={[styles.errorText, { color: colors.danger }]}>{usernameError}</Text>}
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.fieldValueRow}
                    onPress={() => { setUsernameValue(username ?? ''); setUsernameError(null); setEditingUsername(true); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.fieldValue, { color: username ? colors.textPrimary : colors.textMuted }]}>
                      {username ? `@${username}` : 'Tap to set username'}
                    </Text>
                    <Text style={[styles.editHint, { color: colors.accent }]}>{username ? 'Edit' : 'Add'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Hometown */}
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Hometown</Text>
                {editingHometown ? (
                  <View style={styles.editRow}>
                    <TextInput
                      style={[inputStyle, styles.fieldInput]}
                      value={hometownValue}
                      onChangeText={setHometownValue}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleSaveHometown}
                      placeholder="e.g. Boulder, CO"
                      placeholderTextColor={colors.textMuted}
                    />
                    <TouchableOpacity
                      style={[styles.saveButton, { backgroundColor: colors.accent }]}
                      onPress={handleSaveHometown}
                      disabled={savingHometown}
                      activeOpacity={0.8}
                    >
                      {savingHometown ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>Save</Text>}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.fieldValueRow}
                    onPress={() => { setHometownValue(hometown ?? ''); setEditingHometown(true); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.fieldValue, { color: hometown ? colors.textPrimary : colors.textMuted }]}>
                      {hometown || 'Tap to add hometown'}
                    </Text>
                    <Text style={[styles.editHint, { color: colors.accent }]}>{hometown ? 'Edit' : 'Add'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Bio */}
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Bio</Text>
                {editingBio ? (
                  <View>
                    <TextInput
                      style={[inputStyle, styles.bioInput]}
                      value={bioValue}
                      onChangeText={setBioValue}
                      autoFocus
                      multiline
                      numberOfLines={4}
                      placeholder="A little about yourself"
                      placeholderTextColor={colors.textMuted}
                      maxLength={300}
                      textAlignVertical="top"
                    />
                    <TouchableOpacity
                      style={[styles.saveButton, { backgroundColor: colors.accent, marginTop: SPACING.sm }]}
                      onPress={handleSaveBio}
                      disabled={savingBio}
                      activeOpacity={0.8}
                    >
                      {savingBio ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>Save</Text>}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.fieldValueRow}
                    onPress={() => { setBioValue(bio ?? ''); setEditingBio(true); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.fieldValue, { color: bio ? colors.textPrimary : colors.textMuted }]}>
                      {bio || 'Tap to add a bio'}
                    </Text>
                    <Text style={[styles.editHint, { color: colors.accent }]}>{bio ? 'Edit' : 'Add'}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Email */}
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email</Text>
                {editingEmail ? (
                  <View>
                    <View style={styles.editRow}>
                      <TextInput
                        style={[inputStyle, styles.fieldInput]}
                        value={emailValue}
                        onChangeText={v => { setEmailValue(v); setEmailError(null); }}
                        autoFocus
                        autoCapitalize="none"
                        keyboardType="email-address"
                        returnKeyType="done"
                        onSubmitEditing={handleSaveEmail}
                        placeholderTextColor={colors.textMuted}
                      />
                      <TouchableOpacity
                        style={[styles.saveButton, { backgroundColor: colors.accent }]}
                        onPress={handleSaveEmail}
                        disabled={savingEmail}
                        activeOpacity={0.8}
                      >
                        {savingEmail ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>Save</Text>}
                      </TouchableOpacity>
                    </View>
                    {emailError && <Text style={[styles.errorText, { color: colors.danger }]}>{emailError}</Text>}
                    <Text style={[styles.hint, { color: colors.textMuted }]}>A confirmation link will be sent to the new address.</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.fieldValueRow}
                    onPress={() => { setEmailValue(user?.email ?? ''); setEmailError(null); setEmailSent(false); setEditingEmail(true); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.fieldValue, { color: colors.textPrimary }]}>{user?.email}</Text>
                    <Text style={[styles.editHint, { color: colors.accent }]}>Edit</Text>
                  </TouchableOpacity>
                )}
                {emailSent && !editingEmail && (
                  <Text style={[styles.hint, { color: colors.accentGreen }]}>Confirmation sent — check your inbox.</Text>
                )}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal
        visible={settingsOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeSettings}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.bg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Settings</Text>
            <TouchableOpacity onPress={closeSettings} activeOpacity={0.7}>
              <Text style={[styles.doneText, { color: colors.accent }]}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* About */}
            <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.border, gap: SPACING.xs }]}>
              <Text style={[styles.aboutAppName, { color: colors.accent }]}>COCO</Text>
              <Text style={[styles.aboutVersion, { color: colors.textMuted }]}>Version 1.0</Text>
              <Text style={[styles.aboutDesc, { color: colors.textSecondary }]}>
                Your climbing logbook. Track every send, session, and project.
              </Text>
            </View>

            {/* Appearance */}
            <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>APPEARANCE</Text>
              <View style={styles.modeRow}>
                {(['dark', 'light'] as const).map(m => {
                  const isDarkBtn = m === 'dark';
                  const isActive = mode === m;
                  const bg = isDarkBtn ? '#141414' : '#F5F5F2';
                  const textColor = isDarkBtn ? '#F0EDE8' : '#1A1A18';
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.modeButton,
                        { backgroundColor: bg, borderColor: isActive ? colors.accent : colors.border },
                        isActive && { borderWidth: 2 },
                      ]}
                      onPress={() => setMode(m)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.modeLabel, { color: isActive ? colors.accent : textColor }]}>
                        {m === 'dark' ? 'Dark' : 'Light'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Accent color */}
            <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>ACCENT COLOR</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accentRow}>
                {(Object.keys(ACCENT_COLORS) as AccentId[]).map(id => {
                  const active = accentId === id;
                  return (
                    <TouchableOpacity
                      key={id}
                      style={[
                        styles.accentDot,
                        { backgroundColor: ACCENT_COLORS[id].color },
                        active && styles.accentDotActive,
                      ]}
                      onPress={() => setAccent(id)}
                      activeOpacity={0.8}
                    >
                      {active && <Text style={styles.accentCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Grades */}
            <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>GRADES</Text>
              <Text style={[styles.fieldLabel, { color: colors.textMuted, marginBottom: SPACING.sm }]}>Boulder</Text>
              <View style={[styles.modeRow, { marginBottom: SPACING.lg }]}>
                {(['v-scale', 'font'] as const).map(sys => (
                  <TouchableOpacity
                    key={sys}
                    style={[styles.modeButton, { borderColor: preferredBoulder === sys ? colors.accent : colors.border }, preferredBoulder === sys && { borderWidth: 2 }]}
                    onPress={() => { setPreferredBoulder(sys); savePreferredDisplayGrades(sys, preferredRope); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.modeLabel, { color: preferredBoulder === sys ? colors.accent : colors.textSecondary }]}>
                      {sys === 'v-scale' ? 'V-Scale' : 'Font'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.fieldLabel, { color: colors.textMuted, marginBottom: SPACING.sm }]}>Rope</Text>
              <View style={styles.modeRow}>
                {(['yds', 'french', 'british'] as const).map(sys => (
                  <TouchableOpacity
                    key={sys}
                    style={[styles.modeButton, { borderColor: preferredRope === sys ? colors.accent : colors.border }, preferredRope === sys && { borderWidth: 2 }]}
                    onPress={() => { setPreferredRope(sys); savePreferredDisplayGrades(preferredBoulder, sys); }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.modeLabel, { color: preferredRope === sys ? colors.accent : colors.textSecondary }]}>
                      {sys === 'yds' ? 'YDS' : sys === 'french' ? 'French' : 'British'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Privacy */}
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>PRIVACY</Text>
            <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <View style={styles.fieldValueRow}>
                <View>
                  <Text style={[styles.fieldValue, { color: colors.textPrimary }]}>Private Account</Text>
                  <Text style={[styles.fieldHint, { color: colors.textMuted }]}>Require approval to follow you</Text>
                </View>
                <Switch
                  value={isPrivate}
                  onValueChange={async (val) => {
                    try {
                      await upsertProfile(user!.id, profileName ?? '', avatarUrl ?? undefined, username ?? undefined, hometown ?? undefined, bio ?? undefined, val);
                      await refreshProfile();
                    } catch {
                      Alert.alert('Error', 'Failed to update privacy setting.');
                    }
                  }}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {/* Cloud + Account */}
            <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.border, gap: SPACING.md }]}>
              <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>CLOUD</Text>
              <TouchableOpacity
                style={[styles.rowButton, { borderColor: colors.border, marginBottom: SPACING.sm }]}
                onPress={handleSyncNow}
                disabled={syncing}
                activeOpacity={0.7}
              >
                {syncing ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Text style={[styles.rowButtonText, { color: colors.accent }]}>Sync Now</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rowButton, { borderColor: colors.border }]}
                onPress={handleSignOut}
                disabled={signingOut}
                activeOpacity={0.7}
              >
                {signingOut ? (
                  <ActivityIndicator color={colors.danger} />
                ) : (
                  <Text style={[styles.rowButtonText, { color: colors.danger }]}>Sign Out</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Danger Zone */}
            <Text style={[styles.sectionTitle, { color: colors.danger, marginBottom: SPACING.sm }]}>DANGER ZONE</Text>
            <View style={[styles.section, { backgroundColor: colors.bgCard, borderColor: colors.danger + '40' }]}>
              <Text style={[styles.dangerDesc, { color: colors.textSecondary }]}>
                Permanently delete your account and all associated data. This cannot be undone.
              </Text>
              <TouchableOpacity
                style={[styles.rowButton, { borderColor: colors.danger }]}
                onPress={handleDeleteAccount}
                disabled={deleting}
                activeOpacity={0.7}
              >
                {deleting ? (
                  <ActivityIndicator color={colors.danger} />
                ) : (
                  <Text style={[styles.rowButtonText, { color: colors.danger }]}>Delete Account</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ─── Grade helpers ────────────────────────────────────────────────────────────

// ─── Stats section component ──────────────────────────────────────────────────
const CHART_H = 110;

interface HardestByType {
  label: string;   // e.g. "Boulder", "Sport"
  grade: string | null;
  gradeSystem: string | null;
}

interface ClimbStatsData {
  thisMonthClimbs: number;
  thisMonthSessions: number;
  thisMonthSends: number;
  totalSessions: number;
  totalClimbs: number;
  totalSends: number;
  hardestByType: HardestByType[];
  sessionPoints: { date: string; avg: number }[];
  dominantSys: string;
}

function GradeChart({ pts, dominantSys, colors }: {
  pts: { date: string; avg: number }[];
  dominantSys: string;
  colors: any;
}) {
  const [chartWidth, setChartWidth] = React.useState(0);

  const PAD_LEFT = 36;
  const PAD_RIGHT = 12;
  const PAD_TOP = 10;
  const PAD_BOTTOM = 8;
  const innerW = chartWidth - PAD_LEFT - PAD_RIGHT;
  const innerH = CHART_H - PAD_TOP - PAD_BOTTOM;

  const vals = pts.map(p => p.avg);
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const valRange = maxVal - minVal || 1;

  function cx(i: number) {
    if (pts.length === 1) return PAD_LEFT + innerW / 2;
    return PAD_LEFT + (i / (pts.length - 1)) * innerW;
  }
  function cy(v: number) {
    return PAD_TOP + innerH - ((v - minVal) / valRange) * innerH;
  }
  function numToLabel(n: number): string {
    if (dominantSys === 'v-scale') {
      if (n < 0) return 'VB';
      const whole = Math.floor(n);
      return n % 1 >= 0.4 ? `V${whole}+` : `V${whole}`;
    }
    if (dominantSys === 'yds') {
      const main = Math.floor(n / 10);
      const sub = ['a', 'b', 'c', 'd'][Math.round(n % 10)] || '';
      return `5.${main}${sub}`;
    }
    return String(Math.round(n));
  }

  return (
    <View
      style={statStyles.chartContainer}
      onLayout={e => setChartWidth(e.nativeEvent.layout.width)}
    >
      {chartWidth > 0 && (
        <>
          <Svg width={chartWidth} height={CHART_H}>
            {[0, 0.5, 1].map(t => {
              const val = minVal + t * valRange;
              const y = PAD_TOP + innerH - t * innerH;
              return (
                <React.Fragment key={t}>
                  <Line
                    x1={PAD_LEFT} y1={y} x2={PAD_LEFT + innerW} y2={y}
                    stroke={colors.border} strokeWidth={1} strokeDasharray="4,4"
                  />
                  <SvgText
                    x={PAD_LEFT - 5} y={y + 4}
                    fontSize={9} fill={colors.textMuted}
                    textAnchor="end" fontFamily={FONTS.family.regular}
                  >
                    {numToLabel(val)}
                  </SvgText>
                </React.Fragment>
              );
            })}
            <SvgPolyline
              points={pts.map((p, i) => `${cx(i)},${cy(p.avg)}`).join(' ')}
              fill="none" stroke={colors.accent} strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round"
            />
            {pts.map((p, i) => (
              <SvgCircle key={i} cx={cx(i)} cy={cy(p.avg)} r={3.5} fill={colors.accent} />
            ))}
          </Svg>
          {/* Date labels using native layout — immune to SVG clipping */}
          <View style={statStyles.dateRow}>
            <Text style={[statStyles.dateLabel, { color: colors.textMuted, marginLeft: PAD_LEFT }]}>
              {pts[0].date}
            </Text>
            <Text style={[statStyles.dateLabel, { color: colors.textMuted, marginRight: PAD_RIGHT }]}>
              {pts[pts.length - 1].date}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

function ClimbStatsSection({ stats, colors }: { stats: ClimbStatsData; colors: any }) {
  const { thisMonthClimbs, thisMonthSessions, thisMonthSends, totalSessions, totalClimbs, totalSends, hardestByType, sessionPoints, dominantSys } = stats;

  return (
    <View style={statStyles.wrapper}>
      {/* This Month */}
      <View style={statStyles.sectionLabelRow}>
        <Text style={[statStyles.sectionLabel, { color: colors.textPrimary }]}>LAST 30 DAYS</Text>
      </View>
      <View style={statStyles.monthRow}>
        {[
          { label: 'Sessions', value: String(thisMonthSessions) },
          { label: 'Climbs', value: String(thisMonthClimbs) },
          { label: 'Sends', value: String(thisMonthSends) },
        ].map(item => (
          <View key={item.label} style={statStyles.monthItem}>
            <Text style={[statStyles.monthLabel, { color: colors.textMuted }]}>{item.label}</Text>
            <Text style={[statStyles.monthValue, { color: colors.textPrimary }]}>{item.value}</Text>
          </View>
        ))}
      </View>

      {/* Avg Grade Per Session line chart */}
      {sessionPoints.length >= 2 && (
        <>
          <View style={[statStyles.divider, { backgroundColor: colors.border }]} />
          <View style={statStyles.sectionLabelRow}>
            <Text style={[statStyles.sectionLabel, { color: colors.textPrimary }]}>AVG GRADE SENT PER SESSION</Text>
          </View>
          <GradeChart pts={sessionPoints} dominantSys={dominantSys} colors={colors} />
        </>
      )}

      {/* Hardest All Time */}
      <>
        <View style={[statStyles.divider, { backgroundColor: colors.border }]} />
        <View style={statStyles.sectionLabelRow}>
          <Text style={[statStyles.sectionLabel, { color: colors.textPrimary }]}>HARDEST SENDS</Text>
        </View>
        <View style={statStyles.hardestRow}>
          {hardestByType.map(({ label, grade }) => (
            <View key={label} style={statStyles.hardestItem}>
              <Text style={[statStyles.hardestLabel, { color: colors.textMuted }]}>{label}</Text>
              <Text style={[statStyles.hardestGrade, { color: grade ? colors.accent : colors.textMuted }]}>
                {grade ?? 'N/A'}
              </Text>
            </View>
          ))}
        </View>
      </>
      <>
        <View style={[statStyles.divider, { backgroundColor: colors.border }]} />
        <View style={statStyles.sectionLabelRow}>
          <Text style={[statStyles.sectionLabel, { color: colors.textPrimary }]}>TOTALS</Text>
        </View>
        <View style={statStyles.hardestRow}>
          {[
            { label: 'Sessions', value: totalSessions },
            { label: 'Climbs',   value: totalClimbs },
            { label: 'Sends',    value: totalSends },
          ].map(({ label, value }) => (
            <View key={label} style={statStyles.hardestItem}>
              <Text style={[statStyles.hardestLabel, { color: colors.textMuted }]}>{label}</Text>
              <Text style={[statStyles.hardestGrade, { color: colors.textPrimary }]}>{value}</Text>
            </View>
          ))}
        </View>
      </>
    </View>
  );
}

const statStyles = StyleSheet.create({
  wrapper: {
    marginLeft: SPACING.xl,
    marginRight: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  sectionLabelRow: {
    marginBottom: SPACING.sm,
  },
  sectionLabel: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  monthRow: {
    flexDirection: 'row',
    gap: SPACING.xxl,
    marginBottom: SPACING.lg,
  },
  monthItem: {
    alignItems: 'flex-start',
  },
  monthValue: {
    fontSize: FONTS.sizes.xl,
    fontFamily: FONTS.family.bold,
  },
  monthLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
    marginBottom: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: SPACING.lg,
  },
  hardestRow: {
    flexDirection: 'column',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
    alignSelf: 'flex-start',
    minWidth: 180,
  },
  hardestItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.lg,
  },
  hardestGrade: {
    fontSize: FONTS.sizes.xl,
    fontFamily: FONTS.family.heavy,
    letterSpacing: -0.5,
  },
  hardestLabel: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    width: 96,
  },
  chartContainer: {
    marginBottom: SPACING.sm,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  dateLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingBottom: SPACING.xxl * 2,
  },
  notLoggedIn: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    padding: SPACING.xxl,
    paddingTop: 160,
  },
  notLoggedInTitle: {
    fontSize: FONTS.sizes.xl,
    fontFamily: FONTS.family.bold,
    marginBottom: SPACING.md,
  },
  notLoggedInDesc: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.regular,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xxl,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xxl,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
    letterSpacing: 0.5,
  },
  // Profile header
  profileHeader: {
    flexDirection: 'column',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.xl,
    gap: SPACING.lg,
  },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xl,
  },
  avatarModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarModalCard: {
    width: 300,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 20,
  },
  avatarModalTitle: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.semibold,
  },
  avatarModalPreview: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 3,
    overflow: 'hidden',
  },
  avatarModalImage: {
    width: '100%',
    height: '100%',
  },
  avatarModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  avatarModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarModalBtnPrimary: {
    borderWidth: 0,
  },
  avatarModalBtnText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.semibold,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    fontSize: FONTS.sizes.xxl,
    fontFamily: FONTS.family.bold,
  },
  profileInfo: {
    flex: 1,
    gap: 2,
    paddingTop: SPACING.xs,
  },
  profileName: {
    fontSize: FONTS.sizes.xl,
    fontFamily: FONTS.family.bold,
  },
  profileUsername: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.medium,
    marginTop: 1,
  },
  profileHometown: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    marginTop: 2,
  },
  profileBio: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
    lineHeight: 20,
  },
  profileBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countsRow: {
    flexDirection: 'row',
    gap: SPACING.xl,
  },
  countItem: {
    alignItems: 'flex-start',
  },
  countNumber: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
  },
  countLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
    marginBottom: 2,
  },
  followModalContainer: { flex: 1 },
  followModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: SPACING.lg,
    borderBottomWidth: 1,
  },
  followModalTabs: {
    flexDirection: 'row',
    flex: 1,
    paddingLeft: SPACING.md,
  },
  followModalTab: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    position: 'relative',
  },
  followModalTabText: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.regular,
  },
  followModalTabBar: {
    position: 'absolute',
    bottom: 0,
    left: SPACING.lg,
    right: SPACING.lg,
    height: 2,
    borderRadius: 1,
  },
  followModalDone: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.medium,
  },
  followModalEmpty: {
    textAlign: 'center',
    marginTop: SPACING.xl * 2,
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
  },
  followModalList: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  followModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  followModalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followModalAvatarText: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
  },
  followModalAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  followModalName: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.semibold,
  },
  followModalUsername: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    marginTop: 1,
  },
  editPill: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  editPillText: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.semibold,
  },
  editProfileBtn: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  editProfileText: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.semibold,
  },
  // Settings modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.family.bold },
  doneText: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.medium },
  modalScroll: { padding: SPACING.xl, paddingBottom: SPACING.xxl * 2 },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },
  field: {
    paddingVertical: SPACING.sm,
  },
  fieldLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },
  fieldHint: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
    marginTop: 1,
  },
  fieldValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldValue: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.regular,
    flex: 1,
  },
  editHint: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.medium,
    marginLeft: SPACING.sm,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  fieldInput: {
    flex: 1,
    marginBottom: 0,
  },
  bioInput: {
    minHeight: 90,
    paddingTop: SPACING.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.regular,
    marginBottom: SPACING.sm,
  },
  saveButton: {
    borderRadius: 10,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.bold,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: SPACING.sm,
  },
  errorText: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.medium,
    marginTop: SPACING.xs,
  },
  hint: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
    marginTop: SPACING.xs,
  },
  rowButton: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  rowButtonText: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.semibold,
  },
  dangerDesc: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  aboutAppName: {
    fontSize: FONTS.sizes.xl,
    fontFamily: FONTS.family.heavy,
    letterSpacing: 4,
  },
  aboutVersion: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
    letterSpacing: 0.5,
  },
  aboutDesc: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    lineHeight: 20,
    marginTop: SPACING.xs,
  },
  modeRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  modeButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  modeLabel: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.semibold,
  },
  accentRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  accentDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentDotActive: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  accentCheck: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: FONTS.family.bold,
  },
});
