import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING } from '../utils/theme';
import { CHART_STYLES, ChartStyle } from '../utils/gradeUtils';

// Small dropdown beside a grade chart's title for picking which climb type
// it plots: a pill showing the current type, opening a menu anchored under it
// that lists only the types with enough data (`options`).
const MENU_WIDTH = 160;
const ROW_H = 42;

export default function ChartStyleDropdown({ value, options, onChange, colors }: {
  value: ChartStyle;
  options: ChartStyle[];
  onChange: (s: ChartStyle) => void;
  colors: any;
}) {
  const pillRef = React.useRef<View>(null);
  const [anchor, setAnchor] = React.useState<{ top: number; right: number } | null>(null);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const labelOf = (s: ChartStyle) => CHART_STYLES.find(o => o.id === s)?.label ?? s;

  function open() {
    pillRef.current?.measureInWindow((x, y, w, h) => {
      setAnchor({ top: y + h + 6, right: Math.max(SPACING.sm, screenW - (x + w)) });
    });
  }

  function pick(s: ChartStyle) {
    setAnchor(null);
    if (s !== value) onChange(s);
  }

  // Keep the menu on screen; it scrolls if there are more rows than fit.
  const maxMenuH = anchor ? Math.max(ROW_H * 2, screenH - anchor.top - SPACING.xl * 3) : 0;

  return (
    <>
      <TouchableOpacity
        ref={pillRef as any}
        onPress={open}
        style={[styles.pill, { borderColor: colors.border }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Chart type: ${labelOf(value)}`}
      >
        <Text style={[styles.pillLabel, { color: colors.accent }]}>{labelOf(value)}</Text>
        <Ionicons name="chevron-down" size={13} color={colors.accent} />
      </TouchableOpacity>

      <Modal visible={!!anchor} transparent animationType="fade" onRequestClose={() => setAnchor(null)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setAnchor(null)} />
        {anchor && (
          <View style={[
            styles.menu,
            { top: anchor.top, right: anchor.right, maxHeight: maxMenuH, backgroundColor: colors.bgCard, borderColor: colors.border },
          ]}>
            <ScrollView bounces={false}>
              {options.map((s, i) => {
                const active = s === value;
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => pick(s)}
                    style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
                    activeOpacity={0.7}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[
                      styles.rowLabel,
                      { color: active ? colors.accent : colors.textPrimary },
                      active && { fontFamily: FONTS.family.semibold },
                    ]}>
                      {labelOf(s)}
                    </Text>
                    {active && <Ionicons name="checkmark" size={16} color={colors.accent} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: 999,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 4,
  },
  pillLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.semibold,
  },
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  row: {
    height: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  rowLabel: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
  },
});
