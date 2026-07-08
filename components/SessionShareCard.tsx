import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FONTS, SPACING, Climb, CLIMB_TYPES } from '../utils/theme';
import { format, parseISO } from 'date-fns';
import { gradeToNum } from '../utils/gradeUtils';

interface Props {
  date: string;
  accentColor: string;
  transparent?: boolean;
  // Option A: full climbs array (sessions screen)
  climbs?: Climb[];
  location?: string;
  // Option B: summary stats (friends activity feed)
  climbCount?: number;
  sendCount?: number;
  flashCount?: number;
  hardestGrade?: string | null;
  climbType?: string;
  friendName?: string;
}

export default function SessionShareCard({
  date, accentColor, transparent = false,
  climbs, location,
  climbCount, sendCount, flashCount, hardestGrade, climbType, friendName,
}: Props) {
  // Derive stats from either full climbs or summary props
  const totalClimbs = climbs ? climbs.length : (climbCount ?? 0);
  const totalSends = climbs
    ? climbs.filter(c => c.outcome === 'send' || c.outcome === 'flash').length
    : (sendCount ?? 0);
  const totalFlashes = climbs
    ? climbs.filter(c => c.outcome === 'flash').length
    : (flashCount ?? 0);
  const hardestLabel = climbs
    ? ([...climbs].filter(c => c.outcome === 'send' || c.outcome === 'flash')
        .sort((a, b) => gradeToNum(b.grade, b.gradeSystem) - gradeToNum(a.grade, a.gradeSystem))[0]?.grade ?? null)
    : (hardestGrade ?? null);

  const dateStr = format(parseISO(date), 'EEEE, MMM d');
  const textColor = transparent ? '#FFFFFF' : '#F0EDE8';
  const mutedColor = transparent ? 'rgba(255,255,255,0.7)' : '#888';

  // Group climbs by type (only available when full climbs are passed)
  const byType = climbs
    ? climbs.reduce<Record<string, Climb[]>>((acc, c) => {
        acc[c.type] = [...(acc[c.type] ?? []), c];
        return acc;
      }, {})
    : climbType
      ? { [climbType]: [] as Climb[] }
      : {};

  return (
    <View style={[styles.card, { borderColor: transparent ? 'transparent' : accentColor + '40', backgroundColor: transparent ? 'transparent' : '#0A0A0A' }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: accentColor + '30' }]}>
        <Text style={[styles.appName, { color: accentColor }]}>COCO</Text>
        <Text style={styles.tagline}>Climb On. Climb Off.</Text>
      </View>

      {/* Date + Location / Friend name */}
      <Text style={[styles.date, { color: textColor }]}>{dateStr}</Text>
      {friendName ? <Text style={[styles.location, { color: mutedColor }]}>{friendName}</Text> : null}
      {location ? <Text style={[styles.location, { color: mutedColor }]}>{location}</Text> : null}

      {/* Big stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: accentColor }]}>{totalClimbs}</Text>
          <Text style={styles.statLabel}>CLIMBS</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: accentColor + '30' }]} />
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: accentColor }]}>{totalSends}</Text>
          <Text style={[styles.statLabel, { color: mutedColor }]}>SENDS</Text>
        </View>
        {totalFlashes > 0 && (
          <>
            <View style={[styles.statDivider, { backgroundColor: accentColor + '30' }]} />
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: accentColor }]}>{totalFlashes}</Text>
              <Text style={[styles.statLabel, { color: mutedColor }]}>FLASHES</Text>
            </View>
          </>
        )}
        {hardestLabel && (
          <>
            <View style={[styles.statDivider, { backgroundColor: accentColor + '30' }]} />
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: accentColor }]}>{hardestLabel}</Text>
              <Text style={[styles.statLabel, { color: mutedColor }]}>HARDEST</Text>
            </View>
          </>
        )}
      </View>

      {/* Breakdown by type */}
      <View style={styles.breakdown}>
        {Object.entries(byType).map(([type, tc]) => {
          const typeInfo = CLIMB_TYPES.find(t => t.id === type);
          const typeSends = tc.filter(c => c.outcome === 'send' || c.outcome === 'flash');
          // When using summary stats (no full climbs), just show type label
          if (!climbs) {
            return (
              <View key={type} style={[styles.typeRow, { borderLeftColor: typeInfo?.color ?? accentColor }]}>
                <Text style={[styles.typeLabel, { color: typeInfo?.color ?? accentColor }]}>
                  {typeInfo?.label ?? type}
                </Text>
                <Text style={[styles.typeStats, { color: mutedColor }]}>
                  {totalClimbs} climb{totalClimbs !== 1 ? 's' : ''} · {totalSends} send{totalSends !== 1 ? 's' : ''}
                </Text>
              </View>
            );
          }
          return (
            <View key={type} style={[styles.typeRow, { borderLeftColor: typeInfo?.color ?? accentColor }]}>
              <Text style={[styles.typeLabel, { color: typeInfo?.color ?? accentColor }]}>
                {typeInfo?.label ?? type}
              </Text>
              <Text style={[styles.typeStats, { color: mutedColor }]}>
                {tc.length} climb{tc.length !== 1 ? 's' : ''} · {typeSends.length} send{typeSends.length !== 1 ? 's' : ''}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Footer */}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 320,
    backgroundColor: '#0A0A0A',
    borderRadius: 20,
    borderWidth: 1,
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
  },
  appName: {
    fontSize: 22,
    fontFamily: 'OilvareBase-Regular',
    letterSpacing: 4,
  },
  tagline: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
    color: '#888',
    letterSpacing: 0.5,
  },
  date: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.family.bold,
    color: '#F0EDE8',
  },
  location: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    color: '#888',
    marginTop: -SPACING.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: SPACING.md,
  },
  statBox: {
    alignItems: 'center',
    gap: 2,
  },
  statNum: {
    fontSize: 28,
    fontFamily: 'OilvareBase-Regular',
  },
  statLabel: {
    fontSize: 9,
    fontFamily: FONTS.family.bold,
    color: '#666',
    letterSpacing: 1.5,
  },
  statDivider: {
    width: 1,
    height: 36,
  },
  breakdown: {
    gap: SPACING.sm,
  },
  typeRow: {
    borderLeftWidth: 2,
    paddingLeft: SPACING.md,
    gap: 2,
  },
  typeLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  typeStats: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    color: '#888',
  },
  footer: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
    textAlign: 'right',
    marginTop: SPACING.sm,
  },
});
