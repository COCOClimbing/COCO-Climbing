import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING, Climb, CLIMB_TYPES } from '../utils/theme';
import { format, parseISO } from 'date-fns';
import { gradeToNum } from '../utils/gradeUtils';

interface Props {
  date: string;
  accentColor: string;
  solid?: boolean;
  climbs?: Climb[];
  location?: string;
  climbCount?: number;
  sendCount?: number;
  flashCount?: number;
  hardestGrade?: string | null;
  climbType?: string;
  friendName?: string;
  climbingWith?: string[];
}


export default function SessionShareCardStrava({
  date, accentColor, solid = false,
  climbs, location,
  climbCount, sendCount, flashCount, hardestGrade, climbType, friendName, climbingWith,
}: Props) {
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

  // Determine primary climb type label
  const primaryType = climbs
    ? (() => {
        const counts: Record<string, number> = {};
        climbs.forEach(c => { counts[c.type] = (counts[c.type] ?? 0) + 1; });
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
        return CLIMB_TYPES.find(t => t.id === top)?.label ?? null;
      })()
    : climbType ? (CLIMB_TYPES.find(t => t.id === climbType)?.label ?? climbType) : null;

  const stats = [
    { label: 'Climbs',  value: String(totalClimbs) },
    { label: 'Sends',   value: String(totalSends)  },
    ...(hardestLabel ? [{ label: 'Hardest', value: hardestLabel }] : []),
  ];

  return (
    <View style={[styles.card, solid && { backgroundColor: '#0A0A0A' }]}>

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.appName, { color: '#FFFFFF' }]}>COCO</Text>
        </View>

        {/* Date / name */}
        <Text style={styles.date}>{dateStr}</Text>
        {friendName ? <Text style={styles.sub}>{friendName}</Text> : null}
        {location ? (
          <View style={[styles.locationRow, { marginTop: SPACING.xs }]}>
            <Ionicons name="location-sharp" size={11} color="rgba(255,255,255,0.5)" style={{ marginTop: -6 }} />
            <Text style={styles.sub}>{location}</Text>
          </View>
        ) : null}

        {/* Stats */}
        <View style={styles.statsBlock}>
          {stats.map(s => (
            <View key={s.label} style={styles.statItem}>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={[styles.statValue, { color: '#FFFFFF' }]}>{s.value}</Text>
            </View>
          ))}
        </View>

        {/* Bottom row */}
        <View style={styles.bottomRow}>
          {climbingWith && climbingWith.length > 0 ? (
            <View>
              <Text style={styles.withLabel}>CLIMBED WITH</Text>
              <Text style={styles.withNames}>{climbingWith.join(', ')}</Text>
            </View>
          ) : <View />}
          <Text style={styles.footer}>logged with COCO</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 260,
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appName: {
    fontSize: 22,
    fontFamily: 'OilvareBase-Regular',
    letterSpacing: 5,
    color: '#FFFFFF',
  },
  climbType: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.bold,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 2,
  },
  date: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.bold,
    color: 'rgba(255,255,255,0.9)',
    marginTop: SPACING.xs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  sub: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
    color: 'rgba(255,255,255,0.5)',
    marginTop: -SPACING.sm,
  },
  statsBlock: {
    marginTop: SPACING.sm,
    gap: SPACING.md,
  },
  statItem: {
    gap: 1,
  },
  statLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
    color: 'rgba(255,255,255,0.55)',
  },
  statValue: {
    fontSize: 28,
    fontFamily: 'OilvareBase-Regular',
    lineHeight: 32,
  },
  footer: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
    color: 'rgba(255,255,255,0.3)',
    marginTop: SPACING.sm,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: SPACING.sm,
  },
  withLabel: {
    fontSize: 9,
    fontFamily: FONTS.family.bold,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 2,
  },
  withNames: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.semibold,
    color: '#FFFFFF',
  },
});
