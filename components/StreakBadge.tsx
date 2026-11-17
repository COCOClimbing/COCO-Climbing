import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING } from '../utils/theme';

export const STREAK_COLOR = '#F2B33D';

// Number size as a share of the bolt: the bolt is narrow in the middle, so
// each extra digit needs a smaller font to stay inside it
function boltNumScale(weeks: number) {
  if (weeks >= 100) return 0.19;
  if (weeks >= 10) return 0.24;
  return 0.3;
}

// Lightning bolt with the week count on it
export function StreakBolt({ weeks, size = 44 }: { weeks?: number; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="flash" size={size} color={STREAK_COLOR} />
      {weeks !== undefined && (
        <Text
          style={[styles.boltNum, { fontSize: size * boltNumScale(weeks) }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {weeks}
        </Text>
      )}
    </View>
  );
}

// Feed post banner: "Jack reached a 5 week Streak!"
export function StreakBanner({ weeks, name, isSelf, colors }: {
  weeks: number; name: string; isSelf: boolean; colors: any;
}) {
  const first = name.trim().split(/\s+/)[0] || name;
  return (
    <View style={[styles.banner, { backgroundColor: colors.bgElevated }]}>
      <StreakBolt weeks={weeks} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.bannerTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {isSelf ? 'You' : first} reached a {weeks} week streak!
        </Text>
        <Text style={[styles.bannerSub, { color: colors.textSecondary }]} numberOfLines={2}>
          {isSelf ? 'Keep it going next week' : 'Applaud them on continuing to send'}
        </Text>
      </View>
    </View>
  );
}

// Profile chip: "⚡ 5 week streak"
export function StreakChip({ weeks, colors, onPress }: { weeks: number; colors: any; onPress?: () => void }) {
  const body = (
    <View style={styles.chip}>
      <Ionicons name="flash" size={22} color={STREAK_COLOR} />
      <Text style={[styles.chipText, { color: colors.textPrimary }]}>
        <Text style={{ fontFamily: FONTS.family.bold }}>{weeks}</Text> week streak
      </Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${weeks} week streak. Show calendar`}>
      {body}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  boltNum: {
    position: 'absolute',
    color: '#fff',
    fontFamily: FONTS.family.bold,
    textAlign: 'center',
    width: '60%',
    marginTop: 2,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderRadius: 12,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    // No bottom margin: the next item (View climbs / photos) brings its own
    // top margin, which matches the space above the banner
  },
  bannerTitle: { fontSize: 14, fontFamily: FONTS.family.bold },
  bannerSub: { fontSize: 13, fontFamily: FONTS.family.regular, marginTop: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipText: { fontSize: 14, fontFamily: FONTS.family.regular },
});
