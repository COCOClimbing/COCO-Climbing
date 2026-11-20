import React from 'react';
import { View, Text, StyleSheet, TextStyle } from 'react-native';
import { FONTS } from '../../utils/theme';

// The designs are drawn on a 1080px-wide canvas. Sizes below are written in
// those design pixels and scaled by S into points; ViewShot captures at the
// device's pixel ratio (3x on current iPhones), so exports come out at ~1.8x
// the design's resolution.
export const S = 0.6;
export const px = (n: number) => Math.round(n * S * 10) / 10;

export const WHITE = '#FFFFFF';

// Gaps around the type icon on vertical cards, tuned so the visible space
// matches the space between stacked stats. They differ because the value
// line box above already carries spare room under its glyphs, and the COCO
// line box below carries some above its own.
export const ICON_GAP_ABOVE = 20;
export const ICON_GAP_BELOW = 28;
const VALUE_FONT = 'OilvareBase-Regular';

export function Stat({ label, value, align = 'center', fit }: {
  label: string;
  value: string;
  align?: 'left' | 'center' | 'right';
  fit?: boolean;   // shrink long values (e.g. "V7 / 5.12a") to the column width
}) {
  const alignItems = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
  return (
    <View style={{ alignItems }}>
      <Text style={[styles.label, { textAlign: align }]}>{label}</Text>
      <Text
        style={[styles.value, { textAlign: align }]}
        numberOfLines={fit ? 1 : undefined}
        adjustsFontSizeToFit={fit}
        minimumFontScale={0.5}
      >
        {value}
      </Text>
    </View>
  );
}

export function Wordmark({ size = 41, style }: { size?: number; style?: TextStyle }) {
  return <Text style={[styles.wordmark, { fontSize: px(size), lineHeight: px(size * 1.15) }, style]}>COCO</Text>;
}

const styles = StyleSheet.create({
  label: {
    color: WHITE,
    fontFamily: FONTS.family.semibold,
    fontSize: px(20),
    lineHeight: px(24),
  },
  value: {
    color: WHITE,
    fontFamily: VALUE_FONT,
    fontSize: px(48),
    lineHeight: px(54),
  },
  wordmark: {
    color: WHITE,
    fontFamily: VALUE_FONT,
  },
});
