import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/ThemeContext';
import { FONTS, SPACING } from '../utils/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface UnderlineTab<T extends string> {
  id: T;
  label: string;
  icon: IoniconName;
  iconActive: IoniconName;
}

// Strava-style row of icon + label tabs with an accent underline under the
// active one. Used for the Sessions tab's views and the profile sections.
export default function UnderlineTabs<T extends string>({ tabs, value, onChange }: {
  tabs: UnderlineTab<T>[];
  value: T;
  onChange: (id: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      {tabs.map(t => {
        const active = value === t.id;
        return (
          <TouchableOpacity key={t.id} style={styles.tab} onPress={() => onChange(t.id)} activeOpacity={0.7}>
            <Ionicons
              name={active ? t.iconActive : t.icon}
              size={20}
              color={active ? colors.textPrimary : colors.textMuted}
            />
            <Text style={[
              styles.label,
              { color: active ? colors.textPrimary : colors.textMuted },
              active && { fontFamily: FONTS.family.semibold },
            ]}>
              {t.label}
            </Text>
            {active && <View style={[styles.underline, { backgroundColor: colors.accent }]} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm + 2,
    gap: 2,
  },
  label: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
  },
  underline: {
    position: 'absolute',
    bottom: -1,
    left: '20%',
    right: '20%',
    height: 3,
    borderRadius: 1.5,
  },
});
