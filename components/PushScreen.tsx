import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Dimensions, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { FONTS, SPACING } from '../utils/theme';
import BottomTabBar from './BottomTabBar';
import FloatingBackButton, { BACK_BUTTON_SIZE } from './FloatingBackButton';
import { useEdgeSwipeBack } from '../utils/useEdgeSwipeBack';

const SCREEN_W = Dimensions.get('window').width;
// Back button row: the button plus SPACING.sm above and below.
const HEADER_HEIGHT = BACK_BUTTON_SIZE + SPACING.sm * 2;

// A full page that slides in from the right over the app, with
// a round back button and a centered title. Stands in for a navigation push
// (the app has no navigator) for pages opened from the header's buttons.
// Swiping in from the left edge drags it away. It carries its own copy of the
// bottom tab bar, pinned where the real one sits, so the bar stays usable;
// tapping a tab closes the page and switches tabs.
export default function PushScreen({ visible, title, subtitle, headerRight, hideHeader, onBack, onTabPress, onDismiss, children }: {
  visible: boolean;
  title: string;
  subtitle?: string;
  // e.g. an Edit button, shown opposite the back button.
  headerRight?: React.ReactNode;
  // For pages that draw their own back button and run under the status bar
  // (e.g. a profile).
  hideHeader?: boolean;
  onBack: () => void;
  // Runs when a tab in the bottom bar is tapped; defaults to onBack. A page
  // stacked on another page uses it to close both.
  onTabPress?: () => void;
  // Called once the page has finished sliding away.
  onDismiss?: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const x = useRef(new Animated.Value(SCREEN_W)).current;
  // Stays true while the page slides out, so the exit animation can play.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(x, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(x, { toValue: SCREEN_W, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
        setMounted(false);
      });
    }
  }, [visible]);

  // Follows the finger and reveals the screen underneath, which stays mounted.
  const edgeSwipe = useEdgeSwipeBack(onBack, { skipTop: insets.top + HEADER_HEIGHT, follow: x, enabled: visible });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onBack} onDismiss={onDismiss} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View
          {...edgeSwipe}
          style={[styles.page, { backgroundColor: colors.bg, paddingTop: hideHeader ? 0 : insets.top, transform: [{ translateX: x }] }]}
        >
          {!hideHeader && <View style={styles.header}>
            {/* Equal-width sides keep the title centered whatever sits on the right. */}
            <View style={styles.side}>
              <FloatingBackButton onPress={onBack} />
            </View>
            <View style={styles.titleWrap}>
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
              {subtitle ? (
                <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
              ) : null}
            </View>
            <View style={[styles.side, styles.sideRight]}>{headerRight}</View>
          </View>}
          <View style={styles.body}>{children}</View>
        </Animated.View>
        <BottomTabBar onTabPress={onTabPress ?? onBack} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  side: { flex: 1, minWidth: BACK_BUTTON_SIZE, alignItems: 'flex-start' },
  sideRight: { alignItems: 'flex-end' },
  titleWrap: { flex: 2, alignItems: 'center' },
  subtitle: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.regular, marginTop: 1 },
  title: {
    textAlign: 'center',
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.family.bold,
    letterSpacing: 0.5,
  },
  body: { flex: 1 },
});
