import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { useNav, ScreenId } from '../utils/NavigationContext';
import { FONTS, SPACING } from '../utils/theme';

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
  const { screen, openDrawer, openSettings } = useNav();

  return (
    <View style={[styles.header, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={openDrawer} style={styles.menuBtn} activeOpacity={0.7}>
        <View style={[styles.bar, { backgroundColor: colors.textSecondary }]} />
        <View style={[styles.bar, styles.barMid, { backgroundColor: colors.textSecondary }]} />
        <View style={[styles.bar, { backgroundColor: colors.textSecondary }]} />
      </TouchableOpacity>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {SCREEN_TITLES[screen] ?? ''}
      </Text>
      {screen === 'account' ? (
        <TouchableOpacity onPress={openSettings} style={[styles.pill, { borderColor: colors.border }]} activeOpacity={0.7}>
          <Text style={[styles.pillText, { color: colors.textPrimary }]}>Settings</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.rightBtn} />
      )}
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
  menuBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    gap: 5,
  },
  bar: {
    height: 2,
    width: 22,
    borderRadius: 2,
  },
  barMid: { width: 16 },
  title: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.family.bold,
    letterSpacing: 0.5,
  },
  rightBtn: { minWidth: 36 },
  pill: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  pillText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.semibold },
});
