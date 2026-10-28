import { useRef } from 'react';
import { Animated, Dimensions, Easing, PanResponder } from 'react-native';

const SCREEN_W = Dimensions.get('window').width;
// Left edge is kept for the back swipe (useEdgeSwipeBack uses 24pt)
const EDGE_WIDTH = 30;
const MIN_DISTANCE = 50;

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
    onMoveShouldSetPanResponder: (e, g) => {
      if (!state.current.enabled) return false;
      const startX = e.nativeEvent.pageX - g.dx;
      return startX > EDGE_WIDTH && Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2;
    },
    onPanResponderMove: (_, g) => {
      const { tabs: t, value: v } = state.current;
      const i = t.indexOf(v);
      // Rubber-band when there's no tab that way
      const atEnd = (g.dx > 0 && i === 0) || (g.dx < 0 && i === t.length - 1);
      translateX.setValue(atEnd ? g.dx * 0.25 : g.dx);
    },
    // Let a horizontal ScrollView (photo strips) take the drag when it starts scrolling
    onPanResponderTerminationRequest: () => true,
    onPanResponderTerminate: springBack,
    onPanResponderRelease: (_, g) => {
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
