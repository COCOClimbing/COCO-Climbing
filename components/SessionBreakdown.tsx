import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { FONTS, SPACING, CLIMB_TYPES } from '../utils/theme';
import { DaySession, isTrainingClimb, sessionStats, TRAINING_KIND_LABEL } from '../utils/sessionHelpers';

// Stats shown once a session is opened: sends, flashes, total tries and send
// rate (sends ÷ climbs). Used by the Activity feed's opened post and the
// Sessions tab's session screen. Renders nothing for lift/hangboard-only
// sessions or before any climbs are logged.
export default function SessionBreakdown({ climbs, style }: {
  climbs: { type: string; outcome?: string; attempts?: number }[];
  style?: any;
}) {
  const { colors } = useTheme();
  const tried = climbs.filter(c => !isTrainingClimb(c as any));
  if (tried.length === 0) return null;

  const sends = tried.filter(c => c.outcome === 'send' || c.outcome === 'flash').length;
  const flashes = tried.filter(c => c.outcome === 'flash').length;
  // A flash is one try; otherwise use the logged count (at least 1).
  const attempts = tried.reduce((sum, c) => sum + (c.outcome === 'flash' ? 1 : Math.max(c.attempts ?? 1, 1)), 0);
  const sendRate = Math.round((sends / tried.length) * 100);

  const stats = [
    { label: 'Sends', value: String(sends), color: colors.accentGreen },
    { label: 'Flashes', value: String(flashes), color: colors.accentGold },
    { label: 'Attempts', value: String(attempts), color: colors.textPrimary },
    { label: 'Send rate', value: `${sendRate}%`, color: colors.textPrimary },
  ];

  return (
    <View style={[styles.row, { borderTopColor: colors.border }, style]}>
      {stats.map((st, i) => (
        <React.Fragment key={st.label}>
          {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
          <View style={styles.stat}>
            <Text style={[styles.num, { color: st.color }]}>{st.value}</Text>
            <Text style={[styles.lbl, { color: colors.textSecondary }]}>{st.label}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: SPACING.xs,
  },
  stat: { flex: 1, alignItems: 'center' },
  num: { fontSize: 18, fontFamily: FONTS.family.bold, letterSpacing: -0.3, marginBottom: 2, textAlign: 'center' },
  lbl: { fontSize: 12, fontFamily: FONTS.family.regular },
  divider: { width: 1, height: 32 },
  block: { borderTopWidth: 1, marginTop: SPACING.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md },
});

// The full stats block for an opened session in the Sessions tab, laid out
// like the Activity feed's opened post: Type / Climbs / Hardest, a hairline,
// then the Sends / Flashes / Attempts / Send rate row.
export function SessionStatsBlock({ day }: { day: DaySession }) {
  const { colors } = useTheme();
  const { hardest, projecting, gradedCount, training } = sessionStats(day);
  // Same rules as the session cards in the list.
  const typeSource = hardest ?? day.climbs.find(c => !isTrainingClimb(c));
  const typeLabel = training ? TRAINING_KIND_LABEL[training] : (CLIMB_TYPES.find(t => t.id === typeSource?.type)?.label ?? '—');

  return (
    <View style={[styles.block, { borderTopColor: colors.border }]}>
      <View style={styles.topRow}>
        {projecting ? (
          <Text style={[styles.num, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>Projecting</Text>
        ) : (
          <>
            <View style={styles.stat}>
              <Text style={[styles.num, { color: colors.textPrimary }]}>{typeLabel}</Text>
              <Text style={[styles.lbl, { color: colors.textSecondary }]}>Type</Text>
            </View>
            {!training && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.stat}>
                  <Text style={[styles.num, { color: colors.textPrimary }]}>{gradedCount}</Text>
                  <Text style={[styles.lbl, { color: colors.textSecondary }]}>Climbs</Text>
                </View>
              </>
            )}
            {hardest && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <View style={styles.stat}>
                  <Text style={[styles.num, { color: colors.accent }]}>{hardest.grade}</Text>
                  <Text style={[styles.lbl, { color: colors.textSecondary }]}>Hardest</Text>
                </View>
              </>
            )}
          </>
        )}
      </View>
      <SessionBreakdown climbs={day.climbs} />
    </View>
  );
}
