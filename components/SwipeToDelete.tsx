import React, { useRef, useState, useEffect } from 'react';
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
  disabled?: boolean;
  heightOffset?: number;
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
  rightAction?: { label: string; color: string; onPress: () => void };
}

export default function SwipeToDelete({ children, onDelete, disabled, heightOffset = SPACING.md, onSwipeStart, onSwipeEnd, rightAction }: Props) {
  const { colors } = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const [cardHeight, setCardHeight] = useState(0);
  // Tracks the committed position so subsequent gestures start from the right place
  const currentX = useRef(0);
  // Refs so the PanResponder closure always sees the latest callbacks
  const onSwipeStartRef = useRef(onSwipeStart);
  const onSwipeEndRef = useRef(onSwipeEnd);
  useEffect(() => { onSwipeStartRef.current = onSwipeStart; }, [onSwipeStart]);
  useEffect(() => { onSwipeEndRef.current = onSwipeEnd; }, [onSwipeEnd]);

  useEffect(() => {
    if (disabled) {
      currentX.current = 0;
      Animated.spring(translateX, {
        toValue: 0, useNativeDriver: true, bounciness: 0, speed: 25,
      }).start();
    }
  }, [disabled]);

  const panResponder = useRef(
    PanResponder.create({
      // Capture phase — runs before navigation gesture handlers. When the card
      // is open, grab the touch here so rightward swipe-to-close wins.
      onStartShouldSetPanResponderCapture: () => !disabled && currentX.current !== 0,
      onMoveShouldSetPanResponder: (_, g) =>
        !disabled && Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => {
        onSwipeStartRef.current?.();
        translateX.setOffset(currentX.current);
        translateX.setValue(0);
      },
      onPanResponderMove: (_, g) => {
        // Clamp the TOTAL position (offset + delta), not just the delta.
        // Without this, swiping right on a partially-revealed card does nothing.
        const max = rightAction ? REVEAL : 0;
        const clamped = Math.min(max, Math.max(-REVEAL, currentX.current + g.dx));
        translateX.setValue(clamped - currentX.current);
      },
      onPanResponderRelease: (_, g) => {
        translateX.flattenOffset();
        const max = rightAction ? REVEAL : 0;
        const total = Math.min(max, Math.max(-REVEAL, currentX.current + g.dx));
        onSwipeEndRef.current?.();
        if (total < -(REVEAL / 2)) {
          currentX.current = -REVEAL;
          Animated.spring(translateX, {
            toValue: -REVEAL, useNativeDriver: true, bounciness: 0, speed: 20,
          }).start();
        } else if (rightAction && total > REVEAL / 2) {
          currentX.current = REVEAL;
          Animated.spring(translateX, {
            toValue: REVEAL, useNativeDriver: true, bounciness: 0, speed: 20,
          }).start();
        } else {
          snapClosed();
        }
      },
    })
  ).current;

  function snapClosed() {
    currentX.current = 0;
    Animated.spring(translateX, {
      toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20,
    }).start();
  }

  const btnOpacity = translateX.interpolate({
    inputRange: [-REVEAL, -8, 0],
    outputRange: [1, 0.15, 0],
    extrapolate: 'clamp',
  });

  const rightBtnOpacity = translateX.interpolate({
    inputRange: [0, 8, REVEAL],
    outputRange: [0, 0.15, 1],
    extrapolate: 'clamp',
  });

  const btnHeight = cardHeight > heightOffset ? cardHeight - heightOffset : cardHeight;

  return (
    <View style={styles.wrapper}>
      {btnHeight > 0 && !disabled && (
        <Animated.View style={[styles.btn, {
          backgroundColor: colors.danger,
          height: btnHeight,
          width: REVEAL - GAP,
          top: 0,
          opacity: btnOpacity,
        }]}>
          <TouchableOpacity
            style={styles.btnInner}
            onPress={() => { snapClosed(); setTimeout(onDelete, 150); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnTxt, { fontFamily: FONTS.family.semibold }]}>Delete</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {btnHeight > 0 && !disabled && rightAction && (
        <Animated.View style={[styles.btnLeft, {
          backgroundColor: rightAction.color,
          height: btnHeight,
          width: REVEAL - GAP,
          top: 0,
          opacity: rightBtnOpacity,
        }]}>
          <TouchableOpacity
            style={styles.btnInner}
            onPress={() => { snapClosed(); setTimeout(rightAction.onPress, 150); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnTxt, { fontFamily: FONTS.family.semibold }]}>{rightAction.label}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...(disabled ? {} : panResponder.panHandlers)}
        onLayout={(e: LayoutChangeEvent) => setCardHeight(e.nativeEvent.layout.height)}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  btn: {
    position: 'absolute',
    right: 0,
    borderRadius: 12,
    overflow: 'hidden',
  },
  btnLeft: {
    position: 'absolute',
    left: 0,
    borderRadius: 12,
    overflow: 'hidden',
  },
  btnInner: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  btnTxt: { color: '#fff', fontSize: 13 },
});
