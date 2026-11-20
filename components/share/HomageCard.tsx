import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../utils/theme';
import { Stat, Wordmark, px, WHITE } from './cardKit';
import type { ShareStats } from './shareStats';

// 3 — Homage: Location, Climbs, Sends, Hardest. One layout only.
export default function HomageCard({ stats }: { stats: ShareStats }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Wordmark />
        <Text style={styles.tagline}>Climb On. Climb Off.</Text>
      </View>

      {stats.location ? (
        <View style={styles.locationRow}>
          <Ionicons name="location-sharp" size={px(22)} color={WHITE} />
          <Text style={styles.location} numberOfLines={1}>{stats.location}</Text>
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <Stat label="Climbs" value={String(stats.climbs)} align="left" />
        <View style={styles.divider} />
        <Stat label="Sends" value={String(stats.sends)} align={stats.hardest ? 'center' : 'right'} />
        {stats.hardest ? (
          <>
            <View style={styles.divider} />
            <Stat label="Hardest" value={stats.hardest} align="right" />
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // Grows past the design width when the stats need it (e.g. "V4 / 5.11a").
    minWidth: px(460),
    alignSelf: 'center',
    padding: px(40),
    gap: px(14),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tagline: {
    color: WHITE,
    fontFamily: FONTS.family.semibold,
    fontSize: px(14),
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(6),
    // Sit closer to the wordmark than to the stats.
    marginTop: px(-4),
    marginBottom: px(4),
  },
  location: {
    // Zero basis so a long gym name never widens the card; it fills the
    // width the stats set and truncates beyond that.
    flexBasis: 0,
    flexGrow: 1,
    color: WHITE,
    fontFamily: FONTS.family.semibold,
    fontSize: px(18),
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: px(28),   // breathing room either side of the dividers
  },
  divider: {
    width: px(4),
    height: px(62),
    backgroundColor: WHITE,
  },
});
