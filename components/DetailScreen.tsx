import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { SPACING } from '../utils/theme';
import { useHideHeader } from '../utils/HeaderScroll';
import { useEdgeSwipeBack } from '../utils/useEdgeSwipeBack';
import FloatingBackButton, { BACK_BUTTON_SIZE } from './FloatingBackButton';
import StatusBarFade from './StatusBarFade';

// Room a DetailScreen's scroll content needs at the top so it starts below
// the status bar and the floating back button.
export function useDetailTopInset() {
  const insets = useSafeAreaInsets();
  return insets.top + BACK_BUTTON_SIZE + SPACING.sm * 2;
}

// A drill-in view (a session's detail, etc.) that takes over the whole screen
// like a profile does: the app header hides, content scrolls up under the
// status bar, a round back button floats top-left, and swiping in from the
// left edge goes back. Pad scroll content by useDetailTopInset().
export default function DetailScreen({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const topInset = useDetailTopInset();
  useHideHeader(true);
  const panHandlers = useEdgeSwipeBack(onBack, { skipTop: topInset });

  return (
    <View {...panHandlers} style={[styles.root, { backgroundColor: colors.bg }]}>
      {children}
      <StatusBarFade />
      <FloatingBackButton onPress={onBack} style={[styles.back, { top: insets.top + SPACING.sm }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  back: { position: 'absolute', left: SPACING.lg, zIndex: 10 },
});
