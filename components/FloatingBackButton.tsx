import React from 'react';
import { TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/ThemeContext';

export const BACK_BUTTON_SIZE = 40;

// The round back button used across the app, matching the header's buttons.
export default function FloatingBackButton({ onPress, style }: { onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.btn, { backgroundColor: colors.bgCard }, style]}
      activeOpacity={0.7}
      accessibilityLabel="Back"
    >
      <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: BACK_BUTTON_SIZE,
    height: BACK_BUTTON_SIZE,
    borderRadius: BACK_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
});
