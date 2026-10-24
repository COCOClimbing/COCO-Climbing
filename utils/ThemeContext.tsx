import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { ThemeMode, AccentId, ColorScheme, buildColorScheme, setActiveColors } from './theme';
import { getSunTimes } from './sunTimes';

// What the person picked. 'auto' is light by day and dark after sunset.
export type ThemePreference = ThemeMode | 'auto';

interface ThemeContextType {
  // The theme actually showing (auto resolves to light or dark)
  mode: ThemeMode;
  preference: ThemePreference;
  accentId: AccentId;
  colors: ColorScheme;
  setMode: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  preference: 'light',
  accentId: 'orange',
  colors: buildColorScheme('light'),
  setMode: () => {},
});

const MODE_KEY = 'coco_theme_mode';
const OLD_KEY  = 'coco_theme';
const COORDS_KEY = 'coco_theme_coords';

type Coords = { lat: number; lng: number };

// Light between sunrise and sunset at the saved location; 7am–7pm without one.
// Also returns when the theme next needs to flip.
function resolveAuto(coords: Coords | null, now = new Date()): { mode: ThemeMode; nextChange: Date } {
  const timesFor = (d: Date) => {
    const t = coords ? getSunTimes(d, coords.lat, coords.lng) : null;
    if (t) return t;
    const sunrise = new Date(d); sunrise.setHours(7, 0, 0, 0);
    const sunset = new Date(d); sunset.setHours(19, 0, 0, 0);
    return { sunrise, sunset };
  };
  const today = timesFor(now);
  if (now < today.sunrise) return { mode: 'dark', nextChange: today.sunrise };
  if (now < today.sunset) return { mode: 'light', nextChange: today.sunset };
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  return { mode: 'dark', nextChange: timesFor(tomorrow).sunrise };
}

// The phone's rough location, for sunset times. Only asks for permission when
// the person turns Auto on; otherwise uses it only if already allowed.
async function refreshCoords(askPermission: boolean): Promise<Coords | null> {
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted' && askPermission) {
      ({ status } = await Location.requestForegroundPermissionsAsync());
    }
    if (status !== 'granted') return null;
    const pos = (await Location.getLastKnownPositionAsync())
      ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }));
    if (!pos) return null;
    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    await AsyncStorage.setItem(COORDS_KEY, JSON.stringify(coords));
    return coords;
  } catch {
    return null;
  }
}

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
  const [preference, setPreference] = useState<ThemePreference>('light');
  const [mode, setModeState] = useState<ThemeMode>('light');
  const coordsRef = useRef<Coords | null>(null);
  // Bumped when a new location arrives, so the auto timer re-plans
  const [coordsVersion, setCoordsVersion] = useState(0);

  function applyMode(m: ThemeMode) {
    setModeState(m);
    setActiveColors(buildColorScheme(m));
  }

  useEffect(() => {
    (async () => {
      const [savedMode, oldTheme] = await Promise.all([
        AsyncStorage.getItem(MODE_KEY),
        AsyncStorage.getItem(OLD_KEY),
      ]);

      let m: ThemePreference = 'light';

      if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'auto') {
        m = savedMode;
      } else if (oldTheme && OLD_THEME_MAP[oldTheme]) {
        // Migrate from old system
        m = OLD_THEME_MAP[oldTheme];
        await Promise.all([
          AsyncStorage.setItem(MODE_KEY, m),
          AsyncStorage.removeItem(OLD_KEY),
        ]);
      }

      if (m === 'auto') {
        const saved = await AsyncStorage.getItem(COORDS_KEY);
        coordsRef.current = saved ? JSON.parse(saved) : null;
      }
      setPreference(m);
    })();
  }, []);

  // Keep the shown theme in step with the preference; for auto, flip at the
  // next sunrise/sunset and re-check whenever the app comes back to the front.
  useEffect(() => {
    if (preference !== 'auto') {
      applyMode(preference);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const update = () => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      const { mode: m, nextChange } = resolveAuto(coordsRef.current);
      applyMode(m);
      // setTimeout can't wait more than ~24.8 days; capping at 6h also corrects any drift
      const wait = Math.min(Math.max(nextChange.getTime() - Date.now(), 1000) + 1000, 6 * 3600 * 1000);
      timer = setTimeout(update, wait);
    };
    update();
    if (!coordsRef.current) {
      AsyncStorage.getItem(COORDS_KEY).then(saved => {
        if (saved && !coordsRef.current) { coordsRef.current = JSON.parse(saved); update(); }
      });
    }
    // Pick up a fresh location (e.g. after travelling) without asking again
    refreshCoords(false).then(c => { if (c) { coordsRef.current = c; update(); } });
    const sub = AppState.addEventListener('change', s => { if (s === 'active') update(); });
    return () => { cancelled = true; if (timer) clearTimeout(timer); sub.remove(); };
  }, [preference, coordsVersion]);

  function setMode(p: ThemePreference) {
    setPreference(p);
    AsyncStorage.setItem(MODE_KEY, p);
    if (p === 'auto') {
      refreshCoords(true).then(c => {
        if (c) { coordsRef.current = c; setCoordsVersion(v => v + 1); }
      });
    }
  }

  const colors = buildColorScheme(mode);

  return (
    <ThemeContext.Provider value={{ mode, preference, accentId: 'orange', colors, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
