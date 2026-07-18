import { useEffect, useRef } from 'react';
import { Animated, Dimensions } from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// Custom bottom-sheet motion: slide up on open, slide down on close.
//
// Deliberately not using RN Modal's presentationStyle="pageSheet" — on iOS
// that presentation attaches the OS's own interactive-dismiss pan gesture
// recognizer to the sheet, which produces a native "peek and snap back"
// nudge without actually dismissing.
export function useSlideSheet(visible: boolean, onClose: () => void) {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) {
      translateY.setValue(SCREEN_HEIGHT);
      Animated.spring(translateY, {
        toValue: 0, useNativeDriver: true, bounciness: 0, speed: 14,
      }).start();
    }
  }, [visible]);

  function close() {
    Animated.timing(translateY, {
      toValue: SCREEN_HEIGHT, duration: 220, useNativeDriver: true,
    }).start(() => onCloseRef.current());
  }

  return { translateY, close };
}
