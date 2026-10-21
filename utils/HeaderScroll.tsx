import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

// Lets a screen's main scroll view run under the app header, Strava-style:
// the header's background and title fade out as you scroll while its round
// buttons stay put. Screens opt in with useHeaderScroll(); every other screen
// gets the header as a solid bar with content laid out below it.

interface HeaderScrollContextType {
  scrollY: Animated.Value;
  headerHeight: number;
  setHeaderHeight: (h: number) => void;
  floating: boolean;
  register: () => () => void;
  // True while a full-screen detail view (DetailScreen) is open; the header
  // and the Sessions tab's toggle hide so the detail can use the whole screen.
  headerHidden: boolean;
  registerHidden: () => () => void;
}

const HeaderScrollContext = createContext<HeaderScrollContextType>({
  scrollY: new Animated.Value(0),
  headerHeight: 0,
  setHeaderHeight: () => {},
  floating: false,
  register: () => () => {},
  headerHidden: false,
  registerHidden: () => () => {},
});

export function HeaderScrollProvider({ children }: { children: React.ReactNode }) {
  const scrollY = useRef(new Animated.Value(0)).current;
  const [headerHeight, setHeaderHeight] = useState(0);
  const [floatingCount, setFloatingCount] = useState(0);
  const [hiddenCount, setHiddenCount] = useState(0);

  const registerHidden = useCallback(() => {
    setHiddenCount(c => c + 1);
    return () => setHiddenCount(c => c - 1);
  }, []);

  const register = useCallback(() => {
    scrollY.setValue(0);
    setFloatingCount(c => c + 1);
    return () => {
      scrollY.setValue(0);
      setFloatingCount(c => c - 1);
    };
  }, [scrollY]);

  return (
    <HeaderScrollContext.Provider value={{ scrollY, headerHeight, setHeaderHeight, floating: floatingCount > 0, register, headerHidden: hiddenCount > 0, registerHidden }}>
      {children}
    </HeaderScrollContext.Provider>
  );
}

export function useHeaderScrollContext() {
  return useContext(HeaderScrollContext);
}

// Call from a screen whose main scroll view should run under the header.
// Pass `enabled` false while the screen shows something else (a loading
// state, a pushed detail view) so the header goes back to a solid bar.
// Spread `topInset` into the scroll view's contentContainerStyle paddingTop
// and call `onScroll` from its onScroll handler.
export function useHeaderScroll(enabled = true) {
  const { scrollY, headerHeight, register } = useContext(HeaderScrollContext);

  useEffect(() => {
    if (!enabled) return;
    return register();
  }, [enabled, register]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.setValue(e.nativeEvent.contentOffset.y);
  }, [scrollY]);

  return { onScroll, topInset: headerHeight };
}

// Hide the app header while `active` (see headerHidden above).
export function useHideHeader(active = true) {
  const { registerHidden } = useContext(HeaderScrollContext);
  useEffect(() => {
    if (!active) return;
    return registerHidden();
  }, [active, registerHidden]);
}
