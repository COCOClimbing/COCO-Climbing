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
}

export default function SwipeToDelete({ children, onDelete, disabled, heightOffset = SPACING.md }: Props) {
  const { colors } = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const [cardHeight, setCardHeight] = useState(0);

  // Snap closed when disabled (session expands)
  useEffect(() => {
    if (disabled) {
      Animated.spring(translateX, {
        toValue: 0, useNativeDriver: true, bounciness: 0, speed: 25,
      }).start();
    }
  }, [disabled]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        !disabled && Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => {
        (translateX as any).extractOffset();
      },
      onPanResponderMove: (_, g) => {
        translateX.setValue(Math.min(0, Math.max(-REVEAL, g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        (translateX as any).flattenOffset();
        if (g.dx < -(REVEAL / 2)) {
          Animated.spring(translateX, {
            toValue: -REVEAL, useNativeDriver: true, bounciness: 0, speed: 20,
          }).start();
        } else {
          snapClosed();
        }
      },
    })
  ).current;

  function snapClosed() {
    Animated.spring(translateX, {
      toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20,
    }).start();
  }

  const btnOpacity = translateX.interpolate({
    inputRange: [-REVEAL, -8, 0],
    outputRange: [1, 0.15, 0],
    extrapolate: 'clamp',
  });

  const btnHeight = cardHeight > heightOffset ? cardHeight - heightOffset : cardHeight;

  return (
    <View style={styles.wrapper}>
      {/* Delete button — sits behind card, revealed on swipe */}
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

      {/* Card */}
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
  btnInner: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  btnTxt: { color: '#fff', fontSize: 13 },
});
