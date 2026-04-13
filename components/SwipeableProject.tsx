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
  onSent?: () => void; // optional — past projects only have delete
}

export default function SwipeableProject({ children, onDelete, onSent }: Props) {
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
        if (onSent) {
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
        } else if (cur > (REVEAL / 2) && onSent) {
          // Snap open sent
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

  // Delete button opacity (swipe left)
  const deleteOpacity = translateX.interpolate({
    inputRange: [-REVEAL, -8, 0],
    outputRange: [1, 0.1, 0],
    extrapolate: 'clamp',
  });

  // Sent button opacity (swipe right)
  const sentOpacity = translateX.interpolate({
    inputRange: [0, 8, REVEAL],
    outputRange: [0, 0.1, 1],
    extrapolate: 'clamp',
  });

  const btnHeight = cardHeight > SPACING.md ? cardHeight - SPACING.md : cardHeight;

  return (
    <View style={styles.wrapper}>
      {/* Sent button — left side, swipe right to reveal */}
      {onSent && btnHeight > 0 && (
        <Animated.View style={[styles.sentBtn, {
          backgroundColor: colors.accentGreen,
          height: btnHeight,
          width: REVEAL - GAP,
          top: 0,
          opacity: sentOpacity,
        }]}>
          <TouchableOpacity
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
            onPress={() => { snapClosed(); setTimeout(onSent, 150); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnTxt, { fontFamily: FONTS.family.bold }]}>Sent</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Delete button — right side, swipe left to reveal */}
      {btnHeight > 0 && (
        <Animated.View style={[styles.deleteBtn, {
          backgroundColor: colors.danger,
          height: btnHeight,
          width: REVEAL - GAP,
          top: 0,
          opacity: deleteOpacity,
        }]}>
          <TouchableOpacity
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
            onPress={() => { snapClosed(); setTimeout(onDelete, 150); }}
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
  sentBtn: {
    position: 'absolute',
    left: 0,
    borderRadius: 12,
    overflow: 'hidden',
  },
  deleteBtn: {
    position: 'absolute',
    right: 0,
    borderRadius: 12,
    overflow: 'hidden',
  },
  btnTxt: { color: '#fff', fontSize: 13 },
});
