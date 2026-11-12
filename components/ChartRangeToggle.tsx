import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FONTS, SPACING } from '../utils/theme';

// Time-range toggle shared by the session grade charts (profile + Stats).

export type ChartRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';

const RANGES: { id: ChartRange; label: string; months: number | null }[] = [
  { id: '1M', label: 'Month', months: 1 },
  { id: '3M', label: '3 Months', months: 3 },
  { id: '6M', label: '6 Months', months: 6 },
  { id: '1Y', label: 'Year', months: 12 },
  { id: 'ALL', label: 'All Time', months: null },
];

export const DEFAULT_CHART_RANGE: ChartRange = '3M';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function rangeMonths(range: ChartRange): number | null {
  return RANGES.find(r => r.id === range)?.months ?? null;
}

// Keep points whose YYYY-MM-DD date falls inside the range
export function filterByRange<T extends { date: string }>(pts: T[], range: ChartRange): T[] {
  const months = rangeMonths(range);
  if (months === null) return pts;
  const from = new Date();
  from.setMonth(from.getMonth() - months);
  const cutoff = from.toISOString().slice(0, 10);
  return pts.filter(p => p.date.slice(0, 10) >= cutoff);
}

// Axis label: month-day for up to 6 months, month and year beyond that
export function rangeDateLabel(date: string, range: ChartRange): string {
  const [y, m, d] = date.slice(0, 10).split('-');
  if (!y || !m) return date;
  const months = rangeMonths(range);
  if (months !== null && months <= 6) return `${m}-${d}`;
  return `${MONTHS[Number(m) - 1] ?? m} '${y.slice(2)}`;
}

export default function ChartRangeToggle({ value, onChange, colors }: {
  value: ChartRange;
  onChange: (r: ChartRange) => void;
  colors: any;
}) {
  return (
    <View style={styles.row}>
      {RANGES.map(r => {
        const active = r.id === value;
        return (
          <TouchableOpacity
            key={r.id}
            onPress={() => onChange(r.id)}
            style={[styles.btn, active && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <Text style={[styles.label, { color: active ? colors.accent : colors.textMuted }]} numberOfLines={1}>
              {r.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  label: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.semibold,
  },
});
