import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeMode, AccentId, ColorScheme, buildColorScheme, setActiveColors } from './theme';

interface ThemeContextType {
  mode: ThemeMode;
  accentId: AccentId;
  colors: ColorScheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  accentId: 'orange',
  colors: buildColorScheme('light'),
  setMode: () => {},
});

const MODE_KEY = 'coco_theme_mode';
const OLD_KEY  = 'coco_theme';

// Migrate old single-theme IDs to the new mode system
const OLD_THEME_MAP: Record<string, ThemeMode> = {
  obsidian: 'dark',
  slate:    'dark',
  forest:   'dark',
  crimson:  'dark',
  arctic:   'light',
  sand:     'light',
  meadow:   'light',
  rose:     'light',
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');

  useEffect(() => {
    (async () => {
      const [savedMode, oldTheme] = await Promise.all([
        AsyncStorage.getItem(MODE_KEY),
        AsyncStorage.getItem(OLD_KEY),
      ]);

      let m: ThemeMode = 'light';

      if (savedMode) {
        m = savedMode as ThemeMode;
      } else if (oldTheme && OLD_THEME_MAP[oldTheme]) {
        // Migrate from old system
        m = OLD_THEME_MAP[oldTheme];
        await Promise.all([
          AsyncStorage.setItem(MODE_KEY, m),
          AsyncStorage.removeItem(OLD_KEY),
        ]);
      }

      setModeState(m);
      setActiveColors(buildColorScheme(m));
    })();
  }, []);

  function setMode(m: ThemeMode) {
    setModeState(m);
    setActiveColors(buildColorScheme(m));
    AsyncStorage.setItem(MODE_KEY, m);
  }

  const colors = buildColorScheme(mode);

  return (
    <ThemeContext.Provider value={{ mode, accentId: 'orange', colors, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
