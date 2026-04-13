import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useNav, ScreenId } from '../utils/NavigationContext';
import { useAuth } from '../utils/AuthContext';
import { FONTS, SPACING } from '../utils/theme';
import { Ionicons } from '@expo/vector-icons';

const SCREEN_TITLES: Partial<Record<ScreenId, string>> = {
  log: 'Log',
  sessions: 'Sessions',
  projects: 'Projects',
  stats: 'Stats',
  friends: 'Activity',
  account: 'Account',
  settings: 'Settings',
};

export default function AppHeader() {
  const { colors } = useTheme();
  const { screen, navigate, openSettings, openFriends } = useNav();
  const { pendingRequestCount, avatarUrl, profileName } = useAuth();
  const initials = profileName
    ? profileName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <View style={[styles.header, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
      {/* Left side — profile avatar + search icon on friends screen */}
      <View style={styles.side}>
        <View style={styles.leftGroup}>
          <TouchableOpacity onPress={() => navigate('account')} activeOpacity={0.7}>
            <View style={[styles.avatar, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={[styles.avatarInitials, { color: colors.accent }]}>{initials}</Text>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={openFriends} activeOpacity={0.7} style={styles.searchBtn}>
            <Ionicons name="search" size={24} color={colors.textPrimary} />
            {pendingRequestCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                <Text style={styles.badgeText}>{pendingRequestCount > 9 ? '9+' : pendingRequestCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {SCREEN_TITLES[screen] ?? ''}
      </Text>
      <View style={styles.sideRight}>
        {screen === 'account' && (
          <TouchableOpacity onPress={openSettings} style={[styles.pill, { borderColor: colors.border }]} activeOpacity={0.7}>
            <Text style={[styles.pillText, { color: colors.textPrimary }]}>Settings</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  side: {
    width: 80,
    alignItems: 'flex-start',
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  searchBtn: {
    position: 'relative',
  },
  sideRight: {
    width: 80,
    alignItems: 'flex-end',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarInitials: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.semibold,
  },
  title: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.family.bold,
    letterSpacing: 0.5,
  },
  pill: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  pillText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.semibold },
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 10, fontFamily: FONTS.family.bold, lineHeight: 12 },
});
