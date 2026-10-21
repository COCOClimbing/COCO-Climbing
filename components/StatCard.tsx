import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FONTS, SPACING } from '../utils/theme';

// Rounded, softly shadowed card for a block of stats (Strava-style).
export default function StatCard({ title, colors, children }: {
  title?: string;
  colors: any;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
      {title ? <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    // Same soft shadow as the header's round buttons
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  title: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.family.bold,
    marginBottom: SPACING.md,
  },
});
