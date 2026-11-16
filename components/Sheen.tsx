import React from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, ClipPath } from 'react-native-svg';
import { useTheme } from '../utils/ThemeContext';

// A glossy finish for floating controls (header buttons, tab bar): a bright
// reflection across the top half and a fine rim, so the control lifts off
// whatever is behind it in both light and dark mode.
// Drawn with react-native-svg so it ships over the air — a real frosted blur
// would need a native module and an App Store build.
//
// Drop it in as the first child of a control with `overflow` left visible; it
// fills the parent and ignores touches.
export default function Sheen({ radius }: { radius: number }) {
  const { mode } = useTheme();
  const dark = mode === 'dark';
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  const id = React.useId().replace(/:/g, '');

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || size.w !== width || size.h !== height) setSize({ w: width, h: height });
  };

  // Gloss, not metal: a bright reflection across the top half that stops at a
  // clean edge (a capsule inset from the rim), an even rim with only a little
  // extra light along the top, and a faint glow/shade along the bottom.
  // (Colours and opacities are separate: SVG gradient stops ignore rgba alpha.)
  const W = '#FFFFFF';
  const gloss = dark ? { top: 0.22, low: 0.05 } : { top: 0.95, low: 0.35 };
  const rim = dark ? { top: 0.32, rest: 0.12 } : { top: 1, rest: 0 };
  // Dark: light bouncing up off the bottom edge. Light: a soft shade there
  // instead, so the white highlight has something to stand out against.
  const base = dark ? { color: W, opacity: 0.06 } : { color: '#000000', opacity: 0.05 };
  const lightEdge = 0.07; // light mode's thin grey outline

  const inset = 0.5;
  const pad = 1.5; // gloss sits just inside the rim
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius }]} onLayout={onLayout}>
      {size && (
        <Svg width={size.w} height={size.h}>
          <Defs>
            {/* Keeps the reflection inside the control's own curve */}
            <ClipPath id={`clip${id}`}>
              <Rect x={pad} y={pad} width={size.w - pad * 2} height={size.h - pad * 2} rx={radius - pad} />
            </ClipPath>
            <LinearGradient id={`gloss${id}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={W} stopOpacity={gloss.top} />
              <Stop offset="1" stopColor={W} stopOpacity={gloss.low} />
            </LinearGradient>
            <LinearGradient id={`base${id}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.55" stopColor={base.color} stopOpacity={0} />
              <Stop offset="1" stopColor={base.color} stopOpacity={base.opacity} />
            </LinearGradient>
            <LinearGradient id={`rim${id}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={W} stopOpacity={rim.top} />
              <Stop offset="0.35" stopColor={W} stopOpacity={rim.rest} />
              <Stop offset="1" stopColor={W} stopOpacity={rim.rest} />
            </LinearGradient>
          </Defs>
          {/* Bottom glow / shade */}
          <Rect x={0} y={0} width={size.w} height={size.h} rx={radius} fill={`url(#base${id})`} />
          {/* Top reflection: upper half, rounded at the bottom too, with a crisp lower edge */}
          <Rect
            x={pad} y={pad}
            width={size.w - pad * 2} height={size.h * 0.5 - pad}
            rx={Math.min(radius - pad, (size.h * 0.5 - pad) / 2)}
            fill={`url(#gloss${id})`}
            clipPath={`url(#clip${id})`}
          />
          {!dark && (
            <Rect
              x={inset} y={inset}
              width={size.w - inset * 2} height={size.h - inset * 2}
              rx={radius - inset}
              fill="none" stroke="#000000" strokeOpacity={lightEdge} strokeWidth={1}
            />
          )}
          <Rect
            x={inset} y={inset}
            width={size.w - inset * 2} height={size.h - inset * 2}
            rx={radius - inset}
            fill="none" stroke={`url(#rim${id})`} strokeWidth={1}
          />
        </Svg>
      )}
    </View>
  );
}
