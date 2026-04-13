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
}

export default function ClimbCard({ climb, onPress, compact }: Props) {
  const { colors } = useTheme();
  const typeInfo = CLIMB_TYPES.find(t => t.id === climb.type);
  const dateStr = format(parseISO(climb.date), compact ? 'MMM d' : 'EEE, MMM d · h:mm a');

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
        <GradeBadge grade={climb.grade} outcome={climb.outcome} />
        {climb.type !== 'hangboard' && climb.type !== 'lift' && (
          <OutcomeBadge outcome={climb.outcome} />
        )}
      </View>
      <View style={styles.midRow}>
        <Text style={[styles.typeLine, { color: colors.textSecondary }]}>
          {`${typeInfo?.label ?? ''}   ${climb.environment === 'outdoor' ? 'Outdoor' : 'Indoor'}`}
        </Text>
        {(climb.projectName || climb.routeName) && (
          <Text style={[styles.routeName, { color: colors.textPrimary }]} numberOfLines={1}>{climb.projectName || climb.routeName}</Text>
        )}
      </View>
      {climb.styles.length > 0 && !compact && (
        <View style={styles.stylesRow}>
          {climb.styles.map(s => (
            <View key={s} style={[styles.styleTag, { backgroundColor: colors.bgElevated }]}>
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
      <View style={styles.bottomRow}>
        <Text style={[styles.date, { color: colors.textMuted }]}>{dateStr}</Text>
        <View style={styles.metaRight}>
          {!!climb.attempts && climb.attempts > 0 && climb.outcome === 'hang' && (
            <Text style={[styles.attempts, { color: colors.textMuted }]}>{climb.attempts} {climb.attempts === 1 ? 'hang' : 'hangs'}</Text>
          )}
          {!!climb.attempts && climb.attempts > 1 && climb.outcome !== 'hang' && (
            <Text style={[styles.attempts, { color: colors.textMuted }]}>{climb.attempts} attempts</Text>
          )}
          {climb.location && (
            <Text style={[styles.location, { color: colors.textMuted }]} numberOfLines={1}>{climb.location}</Text>
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
  styleTag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  styleTagText: { fontSize: FONTS.sizes.xs, textTransform: 'capitalize' },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.xs },
  date: { fontSize: FONTS.sizes.xs },
  metaRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  notes: { fontSize: FONTS.sizes.sm, marginBottom: SPACING.xs, lineHeight: 18 },
  attempts: { fontSize: FONTS.sizes.xs },
  location: { fontSize: FONTS.sizes.xs, maxWidth: 140 },
});
