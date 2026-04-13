import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeMode, AccentId, ColorScheme, buildColorScheme, setActiveColors, ACCENT_COLORS } from './theme';

interface ThemeContextType {
  mode: ThemeMode;
  accentId: AccentId;
  colors: ColorScheme;
  setMode: (mode: ThemeMode) => void;
  setAccent: (id: AccentId) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  accentId: 'amber',
  colors: buildColorScheme('light', 'amber'),
  setMode: () => {},
  setAccent: () => {},
});

const MODE_KEY   = 'coco_theme_mode';
const ACCENT_KEY = 'coco_theme_accent';
const OLD_KEY    = 'coco_theme';

// Migrate old accent/theme IDs to the new set
const ACCENT_MIGRATION: Record<string, AccentId> = {
  orange:  'orange',
  blue:    'blue',
  amber:   'amber',
  sage:    'green',
  rose:    'crimson',
  purple:  'lavender',
  pink:    'lavender',
  obsidian:'amber',
  slate:   'amber',
  forest:  'green',
  crimson: 'crimson',
  arctic:  'amber',
  sand:    'amber',
  meadow:  'green',
};

// Migrate old single-theme IDs to the new mode + accent system
const OLD_THEME_MAP: Record<string, { mode: ThemeMode; accentId: AccentId }> = {
  obsidian: { mode: 'dark',  accentId: 'amber'   },
  slate:    { mode: 'dark',  accentId: 'blue'    },
  forest:   { mode: 'dark',  accentId: 'green'   },
  crimson:  { mode: 'dark',  accentId: 'crimson' },
  arctic:   { mode: 'light', accentId: 'blue'    },
  sand:     { mode: 'light', accentId: 'amber'   },
  meadow:   { mode: 'light', accentId: 'green'   },
  rose:     { mode: 'light', accentId: 'crimson' },
};


export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState]     = useState<ThemeMode>('light');
  const [accentId, setAccentState] = useState<AccentId>('amber');

  useEffect(() => {
    (async () => {
      const [savedMode, savedAccent, oldTheme] = await Promise.all([
        AsyncStorage.getItem(MODE_KEY),
        AsyncStorage.getItem(ACCENT_KEY),
        AsyncStorage.getItem(OLD_KEY),
      ]);

      let m: ThemeMode = 'light';
      let a: AccentId  = 'amber';

      if (savedMode && savedAccent) {
        m = savedMode as ThemeMode;
        // Migrate removed accents to the closest new one, fall back to amber
        a = (savedAccent in ACCENT_COLORS)
          ? savedAccent as AccentId
          : (ACCENT_MIGRATION[savedAccent] ?? 'amber');
      } else if (oldTheme && OLD_THEME_MAP[oldTheme]) {
        // Migrate from old system
        m = OLD_THEME_MAP[oldTheme].mode;
        a = OLD_THEME_MAP[oldTheme].accentId;
        await Promise.all([
          AsyncStorage.setItem(MODE_KEY, m),
          AsyncStorage.setItem(ACCENT_KEY, a),
          AsyncStorage.removeItem(OLD_KEY),
        ]);
      }

      setModeState(m);
      setAccentState(a);
      setActiveColors(buildColorScheme(m, a));
    })();
  }, []);

  function setMode(m: ThemeMode) {
    setModeState(m);
    setActiveColors(buildColorScheme(m, accentId));
    AsyncStorage.setItem(MODE_KEY, m);
  }

  function setAccent(a: AccentId) {
    setAccentState(a);
    setActiveColors(buildColorScheme(mode, a));
    AsyncStorage.setItem(ACCENT_KEY, a);
  }

  const colors = buildColorScheme(mode, accentId);

  return (
    <ThemeContext.Provider value={{ mode, accentId, colors, setMode, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
