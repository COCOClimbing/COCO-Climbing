import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Switch, Linking, Image, Modal } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { useNav } from '../utils/NavigationContext';
import { ACCENT_COLORS, AccentId, FONTS, SPACING } from '../utils/theme';
import { getPreferredDisplayGrades, savePreferredDisplayGrades } from '../utils/storage';
import { upsertProfile } from '../utils/cloudSync';
import { getBlockedUsers, unblockUser, BlockedUser } from '../utils/moderationApi';
import { getNotificationPrefs, saveNotificationPrefs, NotificationPrefs } from '../utils/notificationPrefs';
import { registerForPushNotifications } from '../utils/notifications';

export default function SettingsScreen() {
  const { mode, accentId, colors, setMode, setAccent } = useTheme();
  const { user, profileName, avatarUrl, username, hometown, bio, isPrivate, deleteAccount, signOut, syncNow, refreshProfile } = useAuth();
  const { closeSettings } = useNav();
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [preferredBoulder, setPreferredBoulder] = useState<'v-scale' | 'font'>('v-scale');
  const [preferredRope, setPreferredRope] = useState<'yds' | 'french' | 'british'>('yds');
  const [privateToggle, setPrivateToggle] = useState(isPrivate);
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({ session_tag: true, likes: true, comments: true, new_follower: true });
  const [savingNotif, setSavingNotif] = useState(false);

  useEffect(() => { setPrivateToggle(isPrivate); }, [isPrivate]);

  useEffect(() => {
    getPreferredDisplayGrades().then(({ boulder, rope }) => {
      setPreferredBoulder(boulder as 'v-scale' | 'font');
      setPreferredRope(rope as 'yds' | 'french' | 'british');
    });
  }, []);

  useEffect(() => {
    if (user) getBlockedUsers(user.id).then(setBlockedUsers).catch(() => {});
  }, [user]);

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      setNotifPermission(status as 'granted' | 'denied' | 'undetermined');
    });
    if (user) {
      getNotificationPrefs(user.id).then(setNotifPrefs);
    }
  }, [user]);

  async function handleNotifPrefChange(key: keyof NotificationPrefs, value: boolean) {
    if (!user) return;
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    setSavingNotif(true);
    await saveNotificationPrefs(user.id, updated).catch(() => {});
    setSavingNotif(false);
  }

  async function handleEnableNotifications() {
    if (!user) return;
    const { status } = await Notifications.requestPermissionsAsync();
    setNotifPermission(status as 'granted' | 'denied' | 'undetermined');
    if (status === 'granted') {
      await registerForPushNotifications(user.id);
    } else {
      Linking.openSettings();
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    await syncNow();
    setSyncing(false);
    Alert.alert('Synced', 'Your data has been synced with the cloud.');
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
                    if (error) {
                      Alert.alert('Error', error);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
    >
      <TouchableOpacity onPress={closeSettings} style={styles.backBtn} activeOpacity={0.7}>
        <Text style={[styles.backText, { color: colors.accent, fontFamily: FONTS.family.regular }]}>← Account</Text>
      </TouchableOpacity>
      {/* About */}
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ABOUT</Text>
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, gap: SPACING.sm }]}>
        <Text style={[styles.aboutAppName, { color: colors.accent }]}>COCO</Text>
        <Text style={[styles.aboutVersion, { color: colors.textMuted }]}>Version 1.1.2-ota</Text>
        <Text style={[styles.aboutDesc, { color: colors.textSecondary }]}>
          Your climbing logbook. Track every send, session, and project.
        </Text>
        <TouchableOpacity onPress={() => Linking.openURL('https://cococlimbing.github.io/COCO-Climbing/privacy-policy')} activeOpacity={0.7}>
          <Text style={[styles.privacyLink, { color: colors.accent }]}>Privacy Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL('https://cococlimbing.github.io/COCO-Climbing/terms-of-service')} activeOpacity={0.7}>
          <Text style={[styles.privacyLink, { color: colors.accent }]}>Terms of Service</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL('https://docs.google.com/forms/d/e/1FAIpQLSesaJ-qvb_26uFYj8I9TMVLCApq6OAQXnmxTDlXZh4LzSue4A/viewform?usp=publish-editor')} activeOpacity={0.7}>
          <Text style={[styles.privacyLink, { color: colors.accent }]}>Got feedback?</Text>
        </TouchableOpacity>
      </View>

      {/* Appearance */}
      <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: SPACING.xl }]}>APPEARANCE</Text>
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, gap: SPACING.md }]}>
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
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.accentRow}>
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
        </View>
      </View>

      {/* Grades */}
      <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: SPACING.xl }]}>GRADES</Text>
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, gap: SPACING.md }]}>
        <Text style={[styles.gradeLabel, { color: colors.textMuted }]}>Boulder</Text>
        <View style={styles.modeRow}>
          {(['v-scale', 'font'] as const).map(sys => (
            <TouchableOpacity
              key={sys}
              style={[
                styles.modeButton,
                { borderColor: preferredBoulder === sys ? colors.accent : colors.border },
                preferredBoulder === sys && { borderWidth: 2 },
              ]}
              onPress={() => { setPreferredBoulder(sys); savePreferredDisplayGrades(sys, preferredRope); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeLabel, { color: preferredBoulder === sys ? colors.accent : colors.textSecondary }]}>
                {sys === 'v-scale' ? 'V-Scale' : 'Font'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.gradeLabel, { color: colors.textMuted }]}>Rope</Text>
        <View style={styles.modeRow}>
          {(['yds', 'french', 'british'] as const).map(sys => (
            <TouchableOpacity
              key={sys}
              style={[
                styles.modeButton,
                { borderColor: preferredRope === sys ? colors.accent : colors.border },
                preferredRope === sys && { borderWidth: 2 },
              ]}
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

      {/* Notifications — only shown when signed in */}
      {user && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: SPACING.xl }]}>NOTIFICATIONS</Text>
          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, gap: SPACING.md }]}>
            {notifPermission !== 'granted' ? (
              <View>
                <Text style={[styles.notifWarning, { color: colors.textSecondary }]}>
                  Push notifications are {notifPermission === 'denied' ? 'blocked' : 'not enabled'}.
                </Text>
                <TouchableOpacity
                  style={[styles.notifEnableBtn, { borderColor: colors.accent }]}
                  onPress={handleEnableNotifications}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.notifEnableBtnText, { color: colors.accent }]}>
                    {notifPermission === 'denied' ? 'Open Settings to Enable' : 'Enable Notifications'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {([
                  { key: 'session_tag' as const, label: 'Session Tags', hint: 'When someone tags you in a session' },
                  { key: 'comments' as const, label: 'Comments', hint: 'When someone comments on your session' },
                  { key: 'likes' as const, label: 'Likes', hint: 'When someone likes your session' },
                  { key: 'new_follower' as const, label: 'Followers & Following', hint: 'New followers, follow requests, and accepted requests' },
                ] as const).map(({ key, label, hint }, i, arr) => (
                  <View key={key}>
                    {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                    <View style={styles.notifRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.privacyLabel, { color: colors.textPrimary }]}>{label}</Text>
                        <Text style={[styles.privacyHint, { color: colors.textMuted }]}>{hint}</Text>
                      </View>
                      <View style={{ alignSelf: 'stretch', justifyContent: 'center' }}>
                        <Switch
                          value={notifPrefs[key]}
                          onValueChange={(val) => handleNotifPrefChange(key, val)}
                          trackColor={{ false: colors.border, true: colors.accent }}
                          thumbColor="#fff"
                          disabled={savingNotif}
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        </>
      )}

      {/* Privacy — only shown when signed in */}
      {user && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: SPACING.xl }]}>PRIVACY</Text>
          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={styles.privacyRow}>
              <View>
                <Text style={[styles.privacyLabel, { color: colors.textPrimary }]}>Private Account</Text>
                <Text style={[styles.privacyHint, { color: colors.textMuted }]}>Require approval to follow you</Text>
              </View>
              <Switch
                value={privateToggle}
                onValueChange={async (val) => {
                  setPrivateToggle(val);
                  try {
                    await upsertProfile(user.id, profileName ?? '', avatarUrl ?? undefined, username ?? undefined, hometown ?? undefined, bio ?? undefined, val);
                    await refreshProfile();
                  } catch (e: any) {
                    setPrivateToggle(!val);
                    Alert.alert('Error', e?.message ?? 'Failed to update privacy setting.');
                  }
                }}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </>
      )}

      {/* Blocked Accounts — only shown when signed in */}
      {user && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: SPACING.xl }]}>PRIVACY</Text>
          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <TouchableOpacity
              style={styles.blockedRow}
              activeOpacity={0.7}
              onPress={() => {
                getBlockedUsers(user.id).then(setBlockedUsers).catch(() => {});
                setBlockedOpen(true);
              }}
            >
              <Text style={[styles.blockedLabel, { color: colors.textPrimary }]}>Blocked Accounts</Text>
              <Text style={[styles.blockedChevron, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>
          </View>

          <Modal visible={blockedOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setBlockedOpen(false)}>
            <View style={[styles.modalContainer, { backgroundColor: colors.bg }]}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Blocked Accounts</Text>
                <TouchableOpacity onPress={() => setBlockedOpen(false)} activeOpacity={0.7}>
                  <Text style={[styles.modalDone, { color: colors.accent }]}>Done</Text>
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.modalContent}>
                {blockedUsers.length === 0 ? (
                  <Text style={[styles.blockedEmpty, { color: colors.textMuted }]}>No blocked accounts</Text>
                ) : (
                  blockedUsers.map((bu, i) => (
                    <View key={bu.id}>
                      {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                      <View style={styles.blockedUserRow}>
                        <View style={[styles.blockedAvatar, { backgroundColor: colors.accentSoft }]}>
                          {bu.avatar_url
                            ? <Image source={{ uri: bu.avatar_url }} style={styles.blockedAvatarImg} />
                            : <Text style={[styles.blockedAvatarInitial, { color: colors.accent }]}>
                                {(bu.name || '?')[0].toUpperCase()}
                              </Text>
                          }
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.blockedName, { color: colors.textPrimary }]}>{bu.name}</Text>
                          {bu.username ? <Text style={[styles.blockedUsername, { color: colors.textMuted }]}>@{bu.username}</Text> : null}
                        </View>
                        <TouchableOpacity
                          style={[styles.unblockBtn, { borderColor: colors.accent }]}
                          activeOpacity={0.7}
                          disabled={unblocking === bu.id}
                          onPress={() => {
                            Alert.alert('Unblock user?', 'They will be able to follow you and appear in search again.', [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Unblock',
                                onPress: async () => {
                                  setUnblocking(bu.id);
                                  try {
                                    await unblockUser(user.id, bu.id);
                                    setBlockedUsers(prev => prev.filter(u => u.id !== bu.id));
                                  } catch {
                                    Alert.alert('Error', 'Could not unblock user.');
                                  }
                                  setUnblocking(null);
                                },
                              },
                            ]);
                          }}
                        >
                          {unblocking === bu.id
                            ? <ActivityIndicator size="small" color={colors.accent} />
                            : <Text style={[styles.unblockBtnText, { color: colors.accent }]}>Unblock</Text>
                          }
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </Modal>
        </>
      )}

      {/* Account actions — only shown when signed in */}
      {user && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: SPACING.xl }]}>ACCOUNT</Text>
          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, gap: SPACING.md }]}>
            <TouchableOpacity
              style={[styles.signOutBtn, { borderColor: colors.accent }]}
              onPress={handleSyncNow}
              disabled={syncing}
              activeOpacity={0.7}
            >
              {syncing ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={[styles.signOutText, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>Sync Now</Text>
              )}
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={[styles.signOutBtn, { borderColor: colors.accent }]}
              onPress={() => Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign Out', style: 'destructive', onPress: signOut },
              ])}
              activeOpacity={0.7}
            >
              <Text style={[styles.signOutText, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>Sign Out</Text>
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.dangerDesc, { color: colors.textSecondary, fontFamily: FONTS.family.regular, marginBottom: 0 }]}>
              Permanently delete your account and all associated data. This cannot be undone.
            </Text>
            <TouchableOpacity
              style={[styles.deleteBtn, { borderColor: colors.danger }]}
              onPress={handleDeleteAccount}
              activeOpacity={0.7}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <Text style={[styles.deleteBtnText, { color: colors.danger, fontFamily: FONTS.family.semibold }]}>
                  Delete Account
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.xl, paddingBottom: 60 },
  backBtn: { marginBottom: SPACING.lg },
  backText: { fontSize: FONTS.sizes.md },
  sectionLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.bold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: SPACING.lg,
  },
  modeRow: {
    flexDirection: 'row',
    gap: SPACING.md,
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
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  accentDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  aboutAppName: {
    fontSize: FONTS.sizes.xl,
    fontFamily: FONTS.family.heavy,
    letterSpacing: 4,
  },
  aboutVersion: {
    fontSize: FONTS.sizes.xs,
    letterSpacing: 0.5,
    fontFamily: FONTS.family.regular,
  },
  aboutDesc: {
    fontSize: FONTS.sizes.sm,
    lineHeight: 20,
    marginTop: SPACING.sm,
    fontFamily: FONTS.family.regular,
  },
  dangerDesc: {
    fontSize: FONTS.sizes.sm,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  deleteBtn: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  deleteBtnText: {
    fontSize: FONTS.sizes.md,
  },
  signOutBtn: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: FONTS.sizes.md,
  },
  divider: {
    height: 1,
  },
  gradeLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
  },
  notifWarning: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    marginBottom: SPACING.md,
    lineHeight: 20,
  },
  notifEnableBtn: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  notifEnableBtnText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.semibold,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  privacyLabel: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.medium,
  },
  privacyHint: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
    marginTop: 2,
  },
  privacyLink: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.medium,
    marginTop: SPACING.sm,
    textDecorationLine: 'underline',
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  blockedLabel: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.medium,
  },
  blockedChevron: {
    fontSize: 22,
    fontFamily: FONTS.family.regular,
  },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
  },
  modalDone: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.medium,
  },
  modalContent: {
    padding: SPACING.xl,
  },
  blockedEmpty: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    textAlign: 'center',
    paddingVertical: SPACING.xl,
  },
  blockedUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  blockedAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  blockedAvatarImg: {
    width: 38,
    height: 38,
  },
  blockedAvatarInitial: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
  },
  blockedName: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.semibold,
  },
  blockedUsername: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
    marginTop: 1,
  },
  unblockBtn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: SPACING.md,
    minWidth: 72,
    alignItems: 'center',
  },
  unblockBtnText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.semibold,
  },
});
