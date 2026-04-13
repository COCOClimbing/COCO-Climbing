import React, { useRef, useState } from 'react';
import {
  Animated, PanResponder, View, Text,
  StyleSheet, TouchableOpacity, LayoutChangeEvent
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { FONTS, SPACING } from '../utils/theme';

const REVEAL = 80;
const GAP = 8;

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
  onSend?: () => void;
  sendLabel?: string;
  sendColor?: string;
}

export default function SwipeableProjectCard({ children, onDelete, onSend, sendLabel = 'Sent', sendColor }: Props) {
  const { colors } = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const [cardHeight, setCardHeight] = useState(0);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => {
        (translateX as any).extractOffset();
      },
      onPanResponderMove: (_, g) => {
        if (onSend) {
          // Allow both directions
          const val = Math.min(REVEAL, Math.max(-REVEAL, g.dx));
          translateX.setValue(val);
        } else {
          // Delete only — allow right swipe to close when open
          translateX.setValue(Math.min(REVEAL, Math.max(-REVEAL, g.dx)));
        }
      },
      onPanResponderRelease: (_, g) => {
        (translateX as any).flattenOffset();
        const cur = (translateX as any)._value;
        if (cur < -(REVEAL / 2)) {
          // Snap open delete
          Animated.spring(translateX, { toValue: -REVEAL, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
        } else if (cur > (REVEAL / 2) && onSend) {
          // Snap open send
          Animated.spring(translateX, { toValue: REVEAL, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
        } else {
          snapClosed();
        }
      },
    })
  ).current;

  function snapClosed() {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
  }

  function handleDelete() {
    snapClosed();
    setTimeout(onDelete, 150);
  }

  function handleSend() {
    snapClosed();
    setTimeout(() => onSend?.(), 150);
  }

  const deleteOpacity = translateX.interpolate({
    inputRange: [-REVEAL, -8, 0, REVEAL],
    outputRange: [1, 0.1, 0, 0],
    extrapolate: 'clamp',
  });

  const sendOpacity = translateX.interpolate({
    inputRange: [-REVEAL, 0, 8, REVEAL],
    outputRange: [0, 0, 0.1, 1],
    extrapolate: 'clamp',
  });

  const btnHeight = cardHeight > SPACING.md ? cardHeight - SPACING.md : cardHeight;

  return (
    <View style={styles.wrapper}>
      {/* Send button — left side, revealed on right swipe */}
      {onSend && btnHeight > 0 && (
        <Animated.View style={[styles.actionBtn, {
          backgroundColor: sendColor ?? colors.accentGreen,
          height: btnHeight,
          width: REVEAL - GAP,
          left: 0,
          top: 0,
          opacity: sendOpacity,
        }]}>
          <TouchableOpacity
            style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}
            onPress={handleSend}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnTxt, { fontFamily: FONTS.family.bold }]}>{sendLabel}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Delete button — right side, revealed on left swipe */}
      {btnHeight > 0 && (
        <Animated.View style={[styles.actionBtn, {
          backgroundColor: colors.danger,
          height: btnHeight,
          width: REVEAL - GAP,
          right: 0,
          top: 0,
          opacity: deleteOpacity,
        }]}>
          <TouchableOpacity
            style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}
            onPress={handleDelete}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnTxt, { fontFamily: FONTS.family.bold }]}>Delete</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Card */}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
        onLayout={(e: LayoutChangeEvent) => setCardHeight(e.nativeEvent.layout.height)}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  actionBtn: {
    position: 'absolute',
    borderRadius: 12,
    overflow: 'hidden',
  },
  btnTxt: { color: '#fff', fontSize: 13 },
});
