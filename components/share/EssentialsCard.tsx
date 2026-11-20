import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Stat, Wordmark, px } from './cardKit';
import ClimbTypeIcon from './ClimbTypeIcon';
import { ICON_GAP_ABOVE, ICON_GAP_BELOW } from './cardKit';
import type { ShareStats } from './shareStats';

// 1 — The Essentials: Type, Climbs, Hardest.
export default function EssentialsCard({ stats, layout }: { stats: ShareStats; layout: 'vertical' | 'horizontal' }) {
  const items = [
    { label: 'Type', value: stats.typeLabel },
    { label: 'Climbs', value: String(stats.climbs) },
    stats.hardest ? { label: 'Hardest', value: stats.hardest } : null,
  ].filter(Boolean) as { label: string; value: string }[];
  const vertical = layout === 'vertical';

  return (
    <View style={styles.card}>
      <View style={vertical ? styles.column : styles.row}>
        {items.map(s => <Stat key={s.label} {...s} />)}
      </View>
      <View style={{ marginTop: px(vertical ? ICON_GAP_ABOVE : 38) }}>
        <ClimbTypeIcon disciplines={stats.disciplines} />
      </View>
      <Wordmark style={{ marginTop: px(ICON_GAP_BELOW) }} />
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
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: px(60),
  },
});
