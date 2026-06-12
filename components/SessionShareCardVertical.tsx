import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING, Climb, CLIMB_TYPES } from '../utils/theme';
import { format, parseISO } from 'date-fns';
import { gradeToNum } from '../utils/gradeUtils';

interface Props {
  date: string;
  accentColor: string;
  variant: 'solid' | 'transparent';
  climbs?: Climb[];
  location?: string;
  climbCount?: number;
  sendCount?: number;
  flashCount?: number;
  hardestGrade?: string | null;
  climbType?: string;
  friendName?: string;
  climbingWith?: string[];
  title?: string;
}

export default function SessionShareCardVertical({
  date, accentColor, variant,
  climbs, location,
  climbCount, sendCount, flashCount, hardestGrade, climbType, friendName, climbingWith, title,
}: Props) {
  const isTransparent = variant === 'transparent';

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

  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : hour < 21 ? 'Evening' : 'Night';

  const primaryTypeId = climbs
    ? Object.entries(
        climbs.reduce<Record<string, number>>((acc, c) => { acc[c.type] = (acc[c.type] ?? 0) + 1; return acc; }, {})
      ).sort((a, b) => b[1] - a[1])[0]?.[0]
    : climbType;
  const primaryTypeLabel = primaryTypeId ? (CLIMB_TYPES.find(t => t.id === primaryTypeId)?.label ?? null) : null;
  const sessionTitle = title || (primaryTypeLabel ? `${timeOfDay} ${primaryTypeLabel} Session` : `${timeOfDay} Session`);

  const textColor  = isTransparent ? '#FFFFFF'              : '#F0EDE8';
  const mutedColor = isTransparent ? 'rgba(255,255,255,0.6)' : '#888';
  const cardBg     = isTransparent ? 'transparent'           : '#0A0A0A';
  const cardBorder = isTransparent ? 'transparent'           : accentColor + '40';
  const dividerColor = isTransparent ? 'rgba(255,255,255,0.15)' : accentColor + '25';

  const byType = climbs
    ? climbs.reduce<Record<string, Climb[]>>((acc, c) => {
        acc[c.type] = [...(acc[c.type] ?? []), c];
        return acc;
      }, {})
    : climbType
      ? { [climbType]: [] as Climb[] }
      : {};

  const stats = [
    { value: String(totalClimbs), label: 'CLIMBS' },
    { value: String(totalSends),  label: 'SENDS'  },
    ...(totalFlashes > 0 ? [{ value: String(totalFlashes), label: 'FLASHES' }] : []),
    ...(hardestLabel     ? [{ value: hardestLabel,          label: 'HARDEST' }] : []),
  ];

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isTransparent ? 'rgba(255,255,255,0.15)' : accentColor + '30' }]}>
        <Text style={[styles.appName, { color: accentColor }]}>COCO</Text>
        <Text style={[styles.tagline, { color: mutedColor }]}>Climb On. Climb Off.</Text>
      </View>

      {/* Title + Date */}
      <View style={styles.dateBlock}>
        <Text style={[styles.sessionTitle, { color: textColor }]}>{sessionTitle}</Text>
        <Text style={[styles.date, { color: mutedColor }]}>{dateStr}</Text>
        {friendName ? <Text style={[styles.sub, { color: mutedColor }]}>{friendName}</Text> : null}
        {location ? (
          <View style={[styles.locationRow, { marginTop: SPACING.xs }]}>
            <Ionicons name="location-sharp" size={11} color={mutedColor} style={{ marginTop: -1 }} />
            <Text style={[styles.sub, { color: mutedColor }]}>{location}</Text>
          </View>
        ) : null}
      </View>

      {/* Vertical stats list */}
      <View style={styles.statsList}>
        {stats.map((s) => (
          <View key={s.label} style={[styles.statRow, !isTransparent && styles.statRowSpread]}>
            <Text style={[styles.statLabel, { color: mutedColor }]}>{s.label}</Text>
            <Text style={[styles.statValue, { color: accentColor }]}>{s.value}</Text>
          </View>
        ))}
      </View>


      {/* Bottom row: climbed with + footer */}
      <View style={styles.bottomRow}>
        {climbingWith && climbingWith.length > 0 ? (
          <View>
            <Text style={[styles.withLabel, { color: mutedColor }]}>CLIMBED WITH</Text>
            <Text style={[styles.withNames, { color: textColor }]}>{climbingWith.join(', ')}</Text>
          </View>
        ) : <View />}
        <Text style={[styles.footer, { color: isTransparent ? 'rgba(255,255,255,0.4)' : accentColor + '70' }]}>
          logged with COCO
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 270,
    height: 480,
    borderRadius: 0,
    borderWidth: 0,
    padding: SPACING.lg,
    gap: SPACING.sm,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
  },
  appName: {
    fontSize: 28,
    fontFamily: 'OilvareBase-Regular',
    letterSpacing: 4,
  },
  tagline: {
    fontSize: 9,
    fontFamily: FONTS.family.regular,
    letterSpacing: 0.5,
    paddingBottom: 2,
  },
  dateBlock: {
    gap: 2,
  },
  sessionTitle: {
    fontSize: FONTS.sizes.xl,
    fontFamily: FONTS.family.heavy,
    lineHeight: 26,
  },
  date: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
  },
  sub: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statsList: {
    gap: SPACING.xs,
    flex: 1,
    justifyContent: 'space-evenly',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  statRowSpread: {
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.bold,
    letterSpacing: 1.5,
    width: 72,
  },
  statValue: {
    fontSize: 44,
    fontFamily: 'OilvareBase-Regular',
    lineHeight: 48,
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
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  withLabel: {
    fontSize: 9,
    fontFamily: FONTS.family.bold,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  withNames: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.semibold,
  },
  footer: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
    textAlign: 'right',
  },
});
