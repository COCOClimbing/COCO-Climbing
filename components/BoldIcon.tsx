import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Ionicons are font glyphs with a fixed stroke, so for heavier lines the glyph
// is drawn again nudged `weight` points each way. The copies overlap into a
// thicker, still-crisp outline. weight 0 is the plain icon.
export default function BoldIcon({ name, size, color, weight = 0.3 }: {
  name: IoniconName; size: number; color: string; weight?: number;
}) {
  if (!weight) return <Ionicons name={name} size={size} color={color} />;
  const offsets = [[weight, 0], [-weight, 0], [0, weight], [0, -weight]];
  return (
    <View style={{ width: size, height: size }}>
      {offsets.map(([x, y], i) => (
        <Ionicons
          key={i} name={name} size={size} color={color}
          style={{ position: 'absolute', left: x, top: y }}
        />
      ))}
      <Ionicons name={name} size={size} color={color} />
    </View>
  );
}
