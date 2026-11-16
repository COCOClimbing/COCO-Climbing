import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import {
  addDays, addWeeks, differenceInCalendarMonths, endOfMonth, format, isSameMonth, isToday,
  parseISO, startOfMonth, startOfWeek, subMonths,
} from 'date-fns';
import { FONTS, SPACING } from '../utils/theme';
import { useTabBarSpace } from './BottomTabBar';
import { StreakInfo, weekStartOf } from '../utils/streaks';
import { StreakBolt, STREAK_COLOR } from './StreakBadge';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MAX_MONTHS = 36;

// Your weekly streak, month by month. Each counted week gets a band across its
// row; weeks in a row join into one stripe, so a break shows as a gap. The
// current week has a dashed outline until it's logged.
export default function StreakCalendar({ streak, activeDates, colors }: {
  streak: StreakInfo;
  activeDates: string[]; // dates of sessions with entries
  colors: any;
}) {
  const tabBarSpace = useTabBarSpace();
  const active = useMemo(() => new Set(activeDates.map(d => d.slice(0, 10))), [activeDates]);
  const thisWeek = weekStartOf(new Date());

  // Newest month first, back to the month of the oldest session
  const months = useMemo(() => {
    const oldest = activeDates.reduce<string | null>((m, d) => (m === null || d < m ? d : m), null);
    const count = oldest ? Math.min(MAX_MONTHS, differenceInCalendarMonths(new Date(), parseISO(oldest.slice(0, 10))) + 1) : 1;
    return Array.from({ length: count }, (_, i) => subMonths(startOfMonth(new Date()), i));
  }, [activeDates]);

  const has = (wk: Date) => streak.weeks.has(format(wk, 'yyyy-MM-dd'));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: SPACING.lg, paddingBottom: tabBarSpace + SPACING.lg }}
      showsVerticalScrollIndicator={false}
    >
      {/* Summary */}
      <View style={styles.hero}>
        <StreakBolt weeks={streak.current} size={64} />
        <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
          {streak.current} week streak
        </Text>
      </View>
      <View style={[styles.statsRow, { borderColor: colors.border }]}>
        <Stat label="Longest" value={`${streak.longest} wk${streak.longest === 1 ? '' : 's'}`} colors={colors} />
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <Stat
          label="This week"
          value={streak.thisWeekLogged ? 'Logged ✓' : 'Climb by Sunday'}
          valueColor={streak.thisWeekLogged ? colors.textPrimary : colors.accent}
          colors={colors}
        />
      </View>

      <View style={[styles.daysHeader, { borderBottomColor: colors.border }]}>
        {DAYS.map((d, i) => (
          <Text key={i} style={[styles.dayHeader, { color: colors.textMuted }]}>{d}</Text>
        ))}
      </View>

      {months.map(month => {
        // Week rows (Monday first) that touch this month
        const rows: Date[] = [];
        for (let wk = startOfWeek(month, { weekStartsOn: 1 }); wk <= endOfMonth(month); wk = addWeeks(wk, 1)) rows.push(wk);
        return (
          <View key={month.toISOString()} style={styles.month}>
            <Text style={[styles.monthName, { color: colors.textPrimary }]}>
              {format(month, 'MMMM')}
              <Text style={[styles.yearName, { color: colors.textMuted }]}>{'  '}{format(month, 'yyyy')}</Text>
            </Text>
            {rows.map((wk, r) => {
              const counted = has(wk);
              // Join the band to the rows above/below when those weeks counted too
              const joinUp = counted && r > 0 && has(rows[r - 1]);
              const joinDown = counted && r < rows.length - 1 && has(rows[r + 1]);
              const open = format(wk, 'yyyy-MM-dd') === thisWeek && !counted;
              return (
                <View
                  key={wk.toISOString()}
                  style={[
                    styles.week,
                    counted && { backgroundColor: STREAK_COLOR + '33' },
                    counted && joinUp && { borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: 0 },
                    counted && joinDown && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 },
                    open && { borderWidth: 1.5, borderStyle: 'dashed', borderColor: STREAK_COLOR },
                  ]}
                >
                  {Array.from({ length: 7 }, (_, i) => {
                    const day = addDays(wk, i);
                    const inMonth = isSameMonth(day, month);
                    const iso = format(day, 'yyyy-MM-dd');
                    const logged = inMonth && active.has(iso);
                    const today = inMonth && isToday(day);
                    return (
                      <View key={iso} style={styles.cell}>
                        {inMonth && (
                          <View style={[
                            styles.day,
                            logged && { backgroundColor: colors.accent },
                            today && !logged && { borderWidth: 1.5, borderColor: colors.accent },
                          ]}>
                            <Text style={[
                              styles.dayNum,
                              { color: logged ? '#fff' : colors.textPrimary },
                              logged && { fontFamily: FONTS.family.bold },
                            ]}>
                              {format(day, 'd')}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

function Stat({ label, value, valueColor, colors }: { label: string; value: string; valueColor?: string; colors: any }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: valueColor ?? colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

const ROW_H = 44;

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.md },
  heroTitle: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.family.bold },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: SPACING.md, marginBottom: SPACING.lg,
  },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular, marginBottom: 2 },
  statValue: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.family.bold },
  statDivider: { width: 1, height: 32 },
  daysHeader: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: SPACING.xs },
  dayHeader: { flex: 1, textAlign: 'center', fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.medium },
  month: { marginTop: SPACING.lg },
  monthName: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.family.heavy, marginBottom: SPACING.sm },
  yearName: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.regular },
  week: { flexDirection: 'row', height: ROW_H, borderRadius: ROW_H / 2, marginVertical: 2, alignItems: 'center' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: FONTS.sizes.md, fontFamily: FONTS.family.medium },
});
