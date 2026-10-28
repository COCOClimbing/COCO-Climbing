import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FONTS, SPACING, Climb, CLIMB_TYPES } from '../utils/theme';
import { useTheme } from '../utils/ThemeContext';
import { GradeBadge, OutcomeBadge, HoldColorDot } from './UI';
import { format, parseISO } from 'date-fns';
import TrainingEntry from './TrainingEntry';
import { boardLabel } from '../utils/sessionHelpers';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  climb: Climb;
  onPress?: () => void;
  compact?: boolean;
  onIncrementAttempts?: () => void;
  // Show "View routine ›" under a lift/hangboard routine preview. Only pass this
  // where onPress opens the climb detail sheet (not the edit form).
  showRoutineLink?: boolean;
  // Lift/hangboard entries render as TrainingEntry (full routine, notes and media,
  // like the detail sheet) instead of a card with 2-line previews. Used when a
  // session has only lift/hangboard entries, so there's nothing to scroll past.
  expandRoutine?: boolean;
  // TrainingEntry only: shows an Edit button there (it has no tap-through)
  onEdit?: () => void;
  // TrainingEntry only: session photos to include in its MEDIA box
  extraMedia?: string[];
}

export default function ClimbCard({ climb, onPress, compact, onIncrementAttempts, showRoutineLink, expandRoutine, onEdit, extraMedia }: Props) {
  const { colors } = useTheme();
  const typeInfo = CLIMB_TYPES.find(t => t.id === climb.type);
  const dateStr = format(parseISO(climb.date), compact ? 'MMM d' : 'EEE, MMM d · h:mm a');
  const isTraining = climb.type === 'hangboard' || climb.type === 'lift';
  const routine = isTraining ? climb.routine?.trim() : undefined;

  if (isTraining && expandRoutine) return <TrainingEntry climb={climb} onEdit={onEdit} extraMedia={extraMedia} />;

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
        {!isTraining && (
          <View style={styles.gradeGroup}>
            <GradeBadge grade={climb.grade} outcome={climb.outcome} />
            {climb.holdColor ? <HoldColorDot colorId={climb.holdColor} /> : null}
          </View>
        )}
        {!isTraining && (
          <View style={styles.badgeGroup}>
            {/* Marks an attempt/send on one of the climber's own projects */}
            {(climb.projectId || climb.projectName) && (
              <View style={[styles.projectPill, { backgroundColor: colors.accent + '20' }]}>
                <Ionicons name="flag" size={11} color={colors.accent} />
                <Text style={[styles.projectPillText, { color: colors.accent }]}>Project</Text>
              </View>
            )}
            <OutcomeBadge outcome={climb.outcome} />
          </View>
        )}
        {/* Lift/hangboard get a badge in their type color in the grade's spot, instead of a type line */}
        {isTraining && <GradeBadge grade={typeInfo?.label ?? ''} outcome="" colorOverride={typeInfo?.color} />}
      </View>
      <View style={styles.midRow}>
        {!isTraining && (
          <Text style={[styles.typeLine, { color: colors.textSecondary }]}>
            {`${typeInfo?.label ?? ''}${climb.type === 'board' && climb.boardName ? ` · ${boardLabel(climb.boardName, climb.boardAngle)}` : ''}   ${climb.environment === 'outdoor' ? 'Outdoor' : 'Indoor'}`}
          </Text>
        )}
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
      {routine ? (
        <View style={[styles.routineBlock, climb.notes ? styles.routineBlockBeforeNotes : null]}>
          {/* Labelled so the exercise list doesn't read as part of the notes below it */}
          <Text style={[styles.routineLabel, { color: colors.textMuted }]}>ROUTINE</Text>
          <Text style={[styles.routinePreview, { color: colors.textPrimary }]} numberOfLines={2}>{routine}</Text>
          {showRoutineLink && onPress ? (
            <Text style={[styles.routineLink, { color: colors.accent }]}>View routine ›</Text>
          ) : null}
        </View>
      ) : null}
      {climb.notes ? (
        <View>
          {/* Training cards label both blocks (ROUTINE above) so they read apart */}
          {isTraining && <Text style={[styles.routineLabel, { color: colors.textMuted }]}>NOTES</Text>}
          <Text style={[styles.notes, { color: colors.textPrimary }]} numberOfLines={compact ? 2 : undefined}>
            {climb.notes.trim()}
          </Text>
        </View>
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
  gradeGroup: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  badgeGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Same size as OutcomeBadge so the two sit as a pair
  projectPill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 6, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  projectPillText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.semibold, letterSpacing: 0.5 },
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
  routineBlock: { marginBottom: SPACING.xs },
  routineBlockBeforeNotes: { marginBottom: SPACING.sm },
  routineLabel: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.family.medium, letterSpacing: 0.8, marginBottom: 3 },
  routinePreview: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular, lineHeight: 18 },
  routineLink: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.semibold, marginTop: 4 },
  attempts: { fontSize: FONTS.sizes.xs },
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
