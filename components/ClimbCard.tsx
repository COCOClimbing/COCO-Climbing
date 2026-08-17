import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FONTS, SPACING, Climb, CLIMB_TYPES } from '../utils/theme';
import { useTheme } from '../utils/ThemeContext';
import { GradeBadge, OutcomeBadge } from './UI';
import { format, parseISO } from 'date-fns';

interface Props {
  climb: Climb;
  onPress?: () => void;
  compact?: boolean;
  onIncrementAttempts?: () => void;
}

export default function ClimbCard({ climb, onPress, compact, onIncrementAttempts }: Props) {
  const { colors } = useTheme();
  const typeInfo = CLIMB_TYPES.find(t => t.id === climb.type);
  const dateStr = format(parseISO(climb.date), compact ? 'MMM d' : 'EEE, MMM d · h:mm a');
  const isTraining = climb.type === 'hangboard' || climb.type === 'lift';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        styles.card,
        compact ? styles.cardCompact : null,
        { backgroundColor: colors.bgCard, borderColor: colors.border },
      ]}
    >
      <View style={styles.topRow}>
        {!isTraining && <GradeBadge grade={climb.grade} outcome={climb.outcome} />}
        {!isTraining && <OutcomeBadge outcome={climb.outcome} />}
      </View>
      <View style={styles.midRow}>
        <Text style={[styles.typeLine, { color: colors.textSecondary }]}>
          {climb.type === 'hangboard' || climb.type === 'lift'
            ? (typeInfo?.label ?? '')
            : `${typeInfo?.label ?? ''}   ${climb.environment === 'outdoor' ? 'Outdoor' : 'Indoor'}`}
        </Text>
        {(climb.projectName || climb.routeName) && (
          <Text style={[styles.routeName, { color: colors.textPrimary }]} numberOfLines={1}>{climb.projectName || climb.routeName}</Text>
        )}
      </View>
      {climb.styles.length > 0 && (
        // Only cards that actually have a style tagged grow at all — this row
        // doesn't exist otherwise. Compact cards use a tighter variant
        // (no row margin, slimmer tag padding) to keep that growth as small
        // as legibly possible.
        <View style={compact ? styles.stylesRowCompact : styles.stylesRow}>
          {climb.styles.map(s => (
            <View key={s} style={[compact ? styles.styleTagCompact : styles.styleTag, { backgroundColor: colors.bgElevated }]}>
              <Text style={[styles.styleTagText, { color: colors.textMuted }]}>{s}</Text>
            </View>
          ))}
        </View>
      )}
      {climb.notes ? (
        <Text style={[styles.notes, { color: colors.textSecondary }]} numberOfLines={compact ? 2 : undefined}>
          {climb.notes}
        </Text>
      ) : null}
      {climb.location ? (
        <Text style={[styles.location, { color: colors.textMuted }]} numberOfLines={1}>{climb.location}</Text>
      ) : null}
      <View style={styles.bottomRow}>
        <Text style={[styles.date, { color: colors.textMuted }]}>{dateStr}</Text>
        <View style={styles.metaRight}>
          {!!climb.attempts && climb.attempts > 0 && climb.outcome === 'hang' && (
            <Text style={[styles.attempts, { color: colors.textMuted }]}>{climb.attempts} {climb.attempts === 1 ? 'hang' : 'hangs'}</Text>
          )}
          {climb.outcome !== 'hang' && (climb.attempts ?? 0) > 1 && (
            <Text style={[styles.attempts, { color: colors.textMuted }]}>{climb.attempts} attempts</Text>
          )}
          {onIncrementAttempts && !isTraining && (climb.outcome === 'attempt' || climb.outcome === 'send') && (
            <TouchableOpacity
              onPress={onIncrementAttempts}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.incrementBtn, { borderColor: colors.border }]}
            >
              <Text style={[styles.incrementBtnText, { color: colors.textMuted }]}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.md },
  cardCompact: { padding: SPACING.md, marginBottom: SPACING.sm },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.sm },
  midRow: { marginBottom: SPACING.sm },
  typeLine: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.medium, marginBottom: 3 },
  routeName: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.semibold },
  stylesRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: SPACING.sm, gap: 4 },
  stylesRowCompact: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4, gap: 3 },
  styleTag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  styleTagCompact: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  styleTagText: { fontSize: FONTS.sizes.xs, textTransform: 'capitalize' },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.xs },
  date: { fontSize: FONTS.sizes.xs },
  metaRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  notes: { fontSize: FONTS.sizes.sm, marginBottom: SPACING.xs, lineHeight: 18 },
  attempts: { fontSize: FONTS.sizes.xs },
  location: { fontSize: FONTS.sizes.xs, maxWidth: 200, marginBottom: 2 },
  incrementBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incrementBtnText: {
    fontSize: 15,
    lineHeight: 15,
    fontFamily: FONTS.family.medium,
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
    marginTop: 1,
  },
});
