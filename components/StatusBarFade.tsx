import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';

const SLICES = 16;

// Soft fade behind the status bar so the clock stays readable over content
// scrolled under it — stacked slices stand in for a gradient, which would
// need a native module (and an App Store build). Place it last inside a
// full-screen container that starts at the very top of the screen.
export default function StatusBarFade() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const height = insets.top + 16;
  return (
    <View pointerEvents="none" style={[styles.fade, { height }]}>
      {Array.from({ length: SLICES }, (_, i) => (
        <View
          key={i}
          style={{ height: height / SLICES, backgroundColor: colors.bg, opacity: 0.92 * (1 - i / SLICES) ** 1.5 }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
