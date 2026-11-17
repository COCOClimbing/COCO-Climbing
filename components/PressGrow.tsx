import React, { useRef, useState } from 'react';
import { Animated, Easing, Pressable, PressableProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Scale up while held and back on release. The grow is a quick ease-out so
// the button reacts the moment it's touched; the collapse is a stiff spring
// (damping ratio about 0.5), so it flows back with a slight dip past normal
// size and settles in roughly a quarter second instead of stopping dead.
// 40ms ease-out cubic: the first frame after touch-down (~16ms) already shows
// about 80% of the growth, so it reads as instant but not as a jump
const GROW_MS = 40;
const SPRING_BACK = { stiffness: 700, damping: 26, mass: 1, restDisplacementThreshold: 0.001, restSpeedThreshold: 0.01 };

export function usePressScale(scaleTo: number, growMs = GROW_MS) {
  const scale = useRef(new Animated.Value(1)).current;
  const grow = () => {
    scale.stopAnimation();
    Animated.timing(scale, { toValue: scaleTo, duration: growMs, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };
  // Spring back right away, as one native animation, so it isn't held up
  // behind whatever the press opens
  const release = () => {
    scale.stopAnimation();
    Animated.spring(scale, { toValue: 1, ...SPRING_BACK, useNativeDriver: true }).start();
  };
  return { scale, grow, release };
}

// The bottom bar's version: it grows while held, and a quick tap (too short
// to see the grow) plays one grow-and-shrink pulse instead. The pulse is a
// single native animation of a 0→1 progress value mapped to a bump in scale,
// so it runs in step with the highlight's slide and isn't held up by the new
// screen rendering.
// How long a button's release is shown before its action runs
const POP_MS = 110;
const PULSE_SHRINK_MS = 170; // the pulse's settle back to normal size

// growMs: how long the grow takes, both held and in a tap's pulse. The
// bottom bar uses a slower grow than the round buttons.
export function usePressPulse(scaleTo: number, growMs = GROW_MS) {
  const { scale: hold, grow, release } = usePressScale(scaleTo, growMs);
  const pulse = useRef(new Animated.Value(0)).current;
  const PULSE_MS = growMs + PULSE_SHRINK_MS;
  const PULSE_PEAK = growMs / PULSE_MS; // share of the pulse spent growing
  // The pulse runs linearly; the curve is drawn here instead. The grow follows
  // an ease-out cubic (moving on the very first frame, then gliding into full
  // size), and the way back down eases out too.
  const d = scaleTo - 1;
  const P = PULSE_PEAK;
  const bump = useRef(pulse.interpolate({
    inputRange: [0, P * 0.1, P * 0.25, P * 0.5, P * 0.75, P, P + (1 - P) * 0.4, 1],
    outputRange: [0, d * 0.27, d * 0.58, d * 0.875, d * 0.98, d, d * 0.3, 0],
  })).current;
  const scale = useRef(Animated.add(hold, bump)).current;
  const pressedAt = useRef(0);
  return {
    scale,
    pressIn: () => { pressedAt.current = Date.now(); grow(); },
    pressOut: () => {
      const held = Date.now() - pressedAt.current;
      // Held long enough to reach full size: just spring back
      if (held >= growMs) { release(); return; }
      // A quick tap: hand the part-grown bar over to the pulse at the same
      // size, so it carries on growing to full and then shrinks, without a jump
      const grown = Easing.out(Easing.cubic)(held / growMs);
      const start = PULSE_PEAK * grown;
      hold.stopAnimation();
      hold.setValue(1);
      pulse.setValue(start);
      Animated.timing(pulse, { toValue: 1, duration: PULSE_MS * (1 - start), easing: Easing.linear, useNativeDriver: true }).start(() => pulse.setValue(0));
    },
  };
}

// A round button that grows slightly while held and springs back on release,
// used for every round button at the top of a screen. Same feel as the bottom
// bar: a quick tap plays one native grow-and-shrink pulse, and the press
// action runs a frame later so opening a page or sheet can't hold the
// animation up. `children` can be a
// function of the pressed state, so icons can draw bolder while held (see
// BoldIcon's weight). `gh` uses gesture-handler's touchable, for sheets whose
// pan gesture would otherwise swallow the tap.
export default function PressGrow({ children, style, scaleTo = 1.1, gh = false, onPressIn, onPressOut, onPress, disabled, accessibilityLabel, hitSlop, ...rest }: Omit<PressableProps, 'children' | 'style'> & {
  children: React.ReactNode | ((pressed: boolean) => React.ReactNode);
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  gh?: boolean;
}) {
  const { scale, pressIn, pressOut } = usePressPulse(scaleTo);
  const [pressed, setPressed] = useState(false);
  const content = typeof children === 'function' ? children(pressed) : children;
  // Run the action a moment after release. A finger hides the button while
  // it's pressed, so the pop is only seen once it lifts; if the action
  // swaps the screen straight away (search, start session), the button
  // vanishes before it's seen to shrink back. This also keeps opening a
  // page from holding the animation up.
  const fire = () => setTimeout(() => (onPress as (() => void) | null | undefined)?.(), POP_MS);
  // Pressable reports the release at least 130ms after touch-down, on a JS
  // timer that the page this tap opens can delay further, so the button sat
  // enlarged. onPress fires the instant the finger lifts, so release there and
  // let the late onPressOut (also the path for a cancelled press) skip it.
  const down = useRef(false);
  const up = () => { if (!down.current) return; down.current = false; pressOut(); setPressed(false); };

  if (gh) {
    // The visual button is the animated view; the touchable fills it
    return (
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        <GHTouchableOpacity
          onPress={fire}
          onPressIn={() => { pressIn(); setPressed(true); }}
          onPressOut={() => { pressOut(); setPressed(false); }}
          disabled={disabled ?? undefined}
          activeOpacity={1}
          accessibilityLabel={accessibilityLabel}
          containerStyle={StyleSheet.absoluteFill}
          style={styles.fill}
        >
          {content}
        </GHTouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <AnimatedPressable
      {...rest}
      onPress={() => { up(); if (onPress) fire(); }}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop}
      style={[style, { transform: [{ scale }] }]}
      onPressIn={e => { down.current = true; pressIn(); setPressed(true); onPressIn?.(e); }}
      onPressOut={e => { up(); onPressOut?.(e); }}
    >
      {content}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
});
