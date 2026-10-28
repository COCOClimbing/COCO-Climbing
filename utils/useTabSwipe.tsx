import React, { useRef } from 'react';
import { Animated, Dimensions, Easing, PanResponder, StyleProp, View, ViewStyle } from 'react-native';

const SCREEN_W = Dimensions.get('window').width;
// Left edge is kept for the back swipe (useEdgeSwipeBack uses 24pt)
const EDGE_WIDTH = 30;
const MIN_DISTANCE = 50;

// Set when a touch starts inside a photo strip, so a swipe that starts there
// scrolls the photos and never changes the tab. Wrap those ScrollViews in
// <TabSwipeGuard>. It uses the touch-start capture hook, which runs for every
// touch before any drag can be claimed; the page clears the flag on each new
// touch (its capture hook runs first, from the root down).
let innerScrollActive = false;
export function TabSwipeGuard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style} onStartShouldSetResponderCapture={() => { innerScrollActive = true; return false; }}>
      {children}
    </View>
  );
}

// Swipe left/right across a page to move to the next/previous tab of an
// UnderlineTabs row. Spread `panHandlers` onto the page's root view and put
// `slideStyle` on an Animated.View around the tab's content: the content
// follows the finger, slides out, and the next tab slides in from the other side.
//
// It only claims clearly horizontal drags, and in the bubble phase, so things
// inside that handle their own sideways swipes (swipe-to-delete rows, photo
// strips, the calendar's month swipe) still win, and vertical scrolling is
// untouched.
export function useTabSwipe<T extends string>(tabs: T[], value: T, onChange: (id: T) => void, enabled = true) {
  const state = useRef({ tabs, value, onChange, enabled });
  state.current = { tabs, value, onChange, enabled };
  const translateX = useRef(new Animated.Value(0)).current;

  const springBack = () =>
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();

  const responder = useRef(PanResponder.create({
    // New touch: clear the photo-strip flag (runs before the strip's own hook sets it)
    onStartShouldSetPanResponderCapture: () => { innerScrollActive = false; return false; },
    onMoveShouldSetPanResponder: (e, g) => {
      if (!state.current.enabled || innerScrollActive) return false;
      const startX = e.nativeEvent.pageX - g.dx;
      return startX > EDGE_WIDTH && Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2;
    },
    onPanResponderMove: (_, g) => {
      if (innerScrollActive) { translateX.setValue(0); return; }
      const { tabs: t, value: v } = state.current;
      const i = t.indexOf(v);
      // Rubber-band when there's no tab that way
      const atEnd = (g.dx > 0 && i === 0) || (g.dx < 0 && i === t.length - 1);
      translateX.setValue(atEnd ? g.dx * 0.25 : g.dx);
    },
    // A touch that started in a photo strip never gets here (see TabSwipeGuard)
    onPanResponderTerminationRequest: () => true,
    onPanResponderTerminate: springBack,
    onPanResponderRelease: (_, g) => {
      if (innerScrollActive) { springBack(); return; }
      const { tabs: t, value: v, onChange: change } = state.current;
      const i = t.indexOf(v);
      let next = -1;
      if ((g.dx < -MIN_DISTANCE || g.vx < -0.5) && i < t.length - 1) next = i + 1;
      else if ((g.dx > MIN_DISTANCE || g.vx > 0.5) && i > 0) next = i - 1;
      if (next < 0) { springBack(); return; }

      const dir = next > i ? -1 : 1; // content leaves to the left when going forward
      Animated.timing(translateX, {
        toValue: dir * SCREEN_W, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true,
      }).start(() => {
        change(t[next]);
        translateX.setValue(-dir * SCREEN_W);
        Animated.timing(translateX, {
          toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }).start();
      });
    },
  })).current;

  return { panHandlers: responder.panHandlers, slideStyle: { transform: [{ translateX }] } };
}
