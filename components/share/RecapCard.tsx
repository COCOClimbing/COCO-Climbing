import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Stat, Wordmark, px } from './cardKit';
import ClimbTypeIcon from './ClimbTypeIcon';
import { ICON_GAP_ABOVE, ICON_GAP_BELOW } from './cardKit';
import type { ShareStats } from './shareStats';

// 2 — Session Recap: Type, Climbs, Sends, Flashes, Hardest, Attempts, Send Rate.
// Attempts drops out for friends' sessions, where we only have summary counts.
export default function RecapCard({ stats, layout }: { stats: ShareStats; layout: 'vertical' | 'horizontal' }) {
  const climbs = { label: 'Climbs', value: String(stats.climbs) };
  const hardest = stats.hardest ? { label: 'Hardest', value: stats.hardest } : null;
  const sends = { label: 'Sends', value: String(stats.sends) };
  const flashes = { label: 'Flashes', value: String(stats.flashes) };
  const attempts = stats.attempts != null ? { label: 'Attempts', value: String(stats.attempts) } : null;
  const sendRate = { label: 'Send Rate', value: stats.sendRate != null ? `${stats.sendRate}%` : '—' };

  const footer = (gap: number) => (
    <>
      <View style={{ marginTop: px(gap) }}>
        <ClimbTypeIcon disciplines={stats.disciplines} />
      </View>
      <Wordmark style={{ marginTop: px(ICON_GAP_BELOW) }} />
    </>
  );

  if (layout === 'vertical') {
    const items = [{ label: 'Type', value: stats.typeLabel }, climbs, hardest, sends, flashes, attempts, sendRate]
      .filter(Boolean) as { label: string; value: string }[];
    return (
      <View style={styles.card}>
        <View style={styles.column}>
          {items.map(s => <Stat key={s.label} {...s} />)}
        </View>
        {footer(ICON_GAP_ABOVE)}
      </View>
    );
  }

  const rows = [
    [climbs, flashes, hardest].filter(Boolean) as { label: string; value: string }[],
    [sends, attempts, sendRate].filter(Boolean) as { label: string; value: string }[],
  ];
  return (
    <View style={styles.card}>
      <Stat label="Type" value={stats.typeLabel} />
      <View style={styles.grid}>
        {rows.map((row, i) => (
          <View key={i} style={styles.gridRow}>
            {row.map(s => (
              <View key={s.label} style={styles.cell}>
                <Stat {...s} fit />
              </View>
            ))}
          </View>
        ))}
      </View>
      {footer(38)}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    padding: px(40),
  },
  column: {
    alignItems: 'center',
    gap: px(18),
  },
  grid: {
    marginTop: px(18),
    gap: px(18),
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  cell: {
    width: px(158),
    alignItems: 'center',
  },
});
