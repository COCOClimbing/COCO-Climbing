import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

const SHAKA_OUTLINE = require('../assets/icons/shaka-outline.png');
const SHAKA_FILL = require('../assets/icons/shaka-fill.png');

type Props = {
  size?: number;
  /** Outline color. */
  color: string;
  /** When set, the inside of the hand is filled with this color (liked state). */
  fillColor?: string;
};

export default function ShakaIcon({ size = 26, color, fillColor }: Props) {
  const img = { position: 'absolute' as const, top: 0, left: 0, width: size, height: size };
  return (
    <View style={{ width: size, height: size }}>
      {fillColor && <Image source={SHAKA_FILL} style={[img, styles.contain, { tintColor: fillColor }]} />}
      <Image source={SHAKA_OUTLINE} style={[img, styles.contain, { tintColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  contain: { resizeMode: 'contain' },
});
