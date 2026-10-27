import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Image } from 'react-native';

// Photos in one post's strip fade in together once they've all loaded,
// instead of each one popping in as its own download finishes. A slow or
// broken photo can only hold the others back for MAX_WAIT_MS.
const MAX_WAIT_MS = 2500;

type GroupCtx = { ready: boolean; report: (uri: string) => void };
const PhotoGroupContext = createContext<GroupCtx | null>(null);

export function PhotoGroup({ uris, children }: { uris: string[]; children: React.ReactNode }) {
  const key = uris.join('|');
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setLoaded(new Set());
    setTimedOut(false);
    const t = setTimeout(() => setTimedOut(true), MAX_WAIT_MS);
    return () => clearTimeout(t);
  }, [key]);

  const report = useCallback((uri: string) => {
    setLoaded(prev => (prev.has(uri) ? prev : new Set(prev).add(uri)));
  }, []);

  const ready = timedOut || uris.every(u => loaded.has(u));
  return <PhotoGroupContext.Provider value={{ ready, report }}>{children}</PhotoGroupContext.Provider>;
}

// For a photo inside a PhotoGroup: call `onDone` when it loads or fails, and
// use `opacity` on the image. Outside a group the photo shows right away.
export function useGroupedPhoto(uri: string) {
  const group = useContext(PhotoGroupContext);
  const opacity = useRef(new Animated.Value(group ? 0 : 1)).current;
  const ready = group ? group.ready : true;

  useEffect(() => {
    if (!group) return;
    if (ready) Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    else opacity.setValue(0);
  }, [ready]);

  const onDone = useCallback(() => { group?.report(uri); }, [group?.report, uri]);
  return { opacity, onDone };
}

// Downloads photos into the image cache (and returns their display widths at
// `height`), so a list can show them all at once instead of one by one.
export async function preloadPhotos(uris: string[], height: number): Promise<Record<string, number>> {
  const widths: Record<string, number> = {};
  await Promise.all(uris.map(async uri => {
    await Image.prefetch(uri).catch(() => {});
    await new Promise<void>(resolve => {
      Image.getSize(uri, (w, h) => { widths[uri] = Math.round(height * w / h); resolve(); }, () => resolve());
    });
  }));
  return widths;
}
