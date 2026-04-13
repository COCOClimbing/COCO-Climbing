import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Switch } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { useNav } from '../utils/NavigationContext';
import { ACCENT_COLORS, AccentId, FONTS, SPACING } from '../utils/theme';
import { getPreferredDisplayGrades, savePreferredDisplayGrades } from '../utils/storage';
import { upsertProfile } from '../utils/cloudSync';

export default function SettingsScreen() {
  const { mode, accentId, colors, setMode, setAccent } = useTheme();
  const { user, profileName, avatarUrl, username, hometown, bio, isPrivate, deleteAccount, signOut, syncNow, refreshProfile } = useAuth();
  const { closeSettings } = useNav();
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [preferredBoulder, setPreferredBoulder] = useState<'v-scale' | 'font'>('v-scale');
  const [preferredRope, setPreferredRope] = useState<'yds' | 'french' | 'british'>('yds');
  const [privateToggle, setPrivateToggle] = useState(isPrivate);

  useEffect(() => { setPrivateToggle(isPrivate); }, [isPrivate]);

  useEffect(() => {
    getPreferredDisplayGrades().then(({ boulder, rope }) => {
      setPreferredBoulder(boulder as 'v-scale' | 'font');
      setPreferredRope(rope as 'yds' | 'french' | 'british');
    });
  }, []);

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
        <Text style={[styles.aboutVersion, { color: colors.textMuted }]}>Version 1.0</Text>
        <Text style={[styles.aboutDesc, { color: colors.textSecondary }]}>
          Your climbing logbook. Track every send, session, and project.
        </Text>
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
});
