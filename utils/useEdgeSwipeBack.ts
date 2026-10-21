import { useEffect, useRef } from 'react';
import { Animated, Dimensions, PanResponder } from 'react-native';

const SCREEN_W = Dimensions.get('window').width;
// A back swipe has to start this close to the left edge, like iOS's own.
const EDGE_WIDTH = 24;

// Screens with a back swipe, in the order they were opened. Only the newest
// responds: touch handling follows the React tree, and a page opened from a
// detail view (e.g. a climb from a session) is a child of it there, so the
// parent's capture handler would otherwise claim the swipe and close both.
const openScreens: object[] = [];

// iOS-style "swipe in from the left edge to go back". Spread `panHandlers`
// onto the screen's root view. Touches starting in the top `skipTop` points
// are ignored so a back button there stays tappable.
//
// With `follow`, the screen tracks the finger (`follow` is the Animated.Value
// to drive as translateX) and springs back if the swipe is too short — use it
// when something stays mounted underneath to be revealed. Without it, a long
// enough swipe just calls onBack.
//
// `enabled` is false while the screen is mounted but not showing (a closed
// PushScreen).
export function useEdgeSwipeBack(onBack: () => void, { skipTop = 0, follow, enabled = true }: { skipTop?: number; follow?: Animated.Value; enabled?: boolean } = {}) {
  const token = useRef({}).current;
  useEffect(() => {
    if (!enabled) return;
    openScreens.push(token);
    return () => {
      const i = openScreens.lastIndexOf(token);
      if (i >= 0) openScreens.splice(i, 1);
    };
  }, [enabled]);

  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const skipTopRef = useRef(skipTop);
  skipTopRef.current = skipTop;

  const springBack = () => {
    if (follow) Animated.spring(follow, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
  };

  const responder = useRef(PanResponder.create({
    // Claim edge touches right away, in the capture phase so scroll views and
    // buttons inside don't get them. Nothing gets asked about later moves
    // unless something has already claimed the touch, so this can't wait to
    // see a horizontal drag first.
    onStartShouldSetPanResponderCapture: e =>
      openScreens[openScreens.length - 1] === token &&
      e.nativeEvent.pageX < EDGE_WIDTH && e.nativeEvent.pageY > skipTopRef.current,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => { if (follow) follow.setValue(Math.max(0, g.dx)); },
    onPanResponderRelease: (_, g) => {
      if (g.dx > SCREEN_W * 0.3 || g.vx > 0.5) onBackRef.current();
      else springBack();
    },
    onPanResponderTerminate: springBack,
  })).current;

  return responder.panHandlers;
}
