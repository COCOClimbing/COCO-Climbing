import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Animated, Dimensions, Easing, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { FONTS, SPACING } from '../utils/theme';
import BottomTabBar from './BottomTabBar';

const SCREEN_W = Dimensions.get('window').width;
// A back swipe has to start this close to the left edge, like iOS's own.
const EDGE_WIDTH = 24;
// Back button row: 40pt button plus SPACING.sm above and below.
const HEADER_HEIGHT = 40 + SPACING.sm * 2;

// A full page that slides in from the right over the app, Strava-style, with
// a round back button and a centered title. Stands in for a navigation push
// (the app has no navigator) for pages opened from the header's buttons.
// Swiping in from the left edge drags it away. It carries its own copy of the
// bottom tab bar, pinned where the real one sits, so the bar stays usable;
// tapping a tab closes the page and switches tabs.
export default function PushScreen({ visible, title, onBack, onDismiss, children }: {
  visible: boolean;
  title: string;
  onBack: () => void;
  // Called once the page has finished sliding away.
  onDismiss?: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const x = useRef(new Animated.Value(SCREEN_W)).current;
  // Stays true while the page slides out, so the exit animation can play.
  const [mounted, setMounted] = useState(visible);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

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

  const headerBottomRef = useRef(0);
  headerBottomRef.current = insets.top + HEADER_HEIGHT;
  const edgeSwipe = useRef(PanResponder.create({
    // Claim touches that start at the left edge right away (and in the
    // capture phase, so scroll views and buttons inside the page don't get
    // them). Nothing gets asked about later moves unless something has
    // claimed the touch, so this can't wait to see a horizontal drag first.
    // The header is left out so the back button stays tappable.
    onStartShouldSetPanResponderCapture: e =>
      e.nativeEvent.pageX < EDGE_WIDTH && e.nativeEvent.pageY > headerBottomRef.current,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => x.setValue(Math.max(0, g.dx)),
    onPanResponderRelease: (_, g) => {
      if (g.dx > SCREEN_W * 0.35 || g.vx > 0.5) {
        onBackRef.current();
      } else {
        Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      }
    },
    onPanResponderTerminate: () => {
      Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    },
  })).current;

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onBack} onDismiss={onDismiss} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View
          {...edgeSwipe.panHandlers}
          style={[styles.page, { backgroundColor: colors.bg, paddingTop: insets.top, transform: [{ translateX: x }] }]}
        >
          <View style={styles.header}>
            <TouchableOpacity
              onPress={onBack}
              style={[styles.backBtn, { backgroundColor: colors.bgCard }]}
              activeOpacity={0.7}
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
            {/* Balances the back button so the title stays centered. */}
            <View style={styles.backBtnSpacer} />
          </View>
          <View style={styles.body}>{children}</View>
        </Animated.View>
        <BottomTabBar onTabPress={onBack} />
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  backBtnSpacer: { width: 40 },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.family.bold,
    letterSpacing: 0.5,
  },
  body: { flex: 1 },
});
