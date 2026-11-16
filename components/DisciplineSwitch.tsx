import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FONTS } from '../utils/theme';
import type { Discipline } from '../utils/gradeUtils';

// Small Boulder / Rope segmented switch that sits beside a grade chart's title.
const OPTIONS: { id: Discipline; label: string }[] = [
  { id: 'boulder', label: 'Boulder' },
  { id: 'rope', label: 'Rope' },
];

export default function DisciplineSwitch({ value, onChange, colors }: {
  value: Discipline;
  onChange: (d: Discipline) => void;
  colors: any;
}) {
  return (
    <View style={[styles.track, { borderColor: colors.border }]}>
      {OPTIONS.map(o => {
        const active = o.id === value;
        return (
          <TouchableOpacity
            key={o.id}
            onPress={() => onChange(o.id)}
            style={[styles.btn, active && { backgroundColor: colors.accentSoft }]}
            hitSlop={{ top: 8, bottom: 8 }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, { color: active ? colors.accent : colors.textMuted }]}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 999,
    padding: 2,
  },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  label: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.semibold,
  },
});
