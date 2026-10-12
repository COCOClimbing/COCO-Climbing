import React, { createContext, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Modal, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../utils/theme';
import ZoomablePhoto, { Rect } from './ZoomablePhoto';

type Measurable = { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void };

// The vertical scroll container photo thumbnails live in. A photo flying back onto
// its thumbnail is clipped to this area, so it passes under the screen's header and
// tab bar instead of over them. Screens provide their ScrollView ref; cards read it.
export const PhotoClipContext = createContext<React.RefObject<ScrollView | null> | null>(null);

// A ScrollView ref is the native view on current RN, but its types don't say so
const asMeasurable = (sv: ScrollView): Measurable | null =>
  (sv as any).measureInWindow ? (sv as any) : ((sv as any).getNativeScrollRef?.() ?? null);

const measure = (el: Measurable) => new Promise<{ x: number; y: number; width: number; height: number }>(resolve =>
  el.measureInWindow((x, y, w, h) => resolve({ x, y, width: w, height: h })));

// Where each photo's thumbnail sits on screen, keyed by uri, so a swiped-away photo
// can shrink back onto it. Attach `register(uri)` as the thumbnail's ref and pass
// `origins` to PhotoViewer.
export function usePhotoOrigins() {
  const origins = useRef(new Map<string, Measurable>()).current;
  const register = (uri: string) => (el: Measurable | null) => {
    if (el) origins.set(uri, el);
    else origins.delete(uri);
  };
  return { origins, register };
}

interface Props {
  uris: string[];
  initialIndex: number;
  onClose: () => void;
  origins?: Map<string, Measurable>;
  clipTo?: React.RefObject<ScrollView | null> | null;
}

// Full-screen photo viewer: swipe between photos, pinch/double-tap to zoom, drag
// down to shrink the photo and fade the backdrop away, revealing the screen behind;
// let go and it settles back onto its thumbnail. Mount it only while open.
export default function PhotoViewer({ uris, initialIndex, onClose, origins, clipTo }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);
  // 0 = viewer fully shown, 1 = backdrop and controls gone
  const progress = useRef(new Animated.Value(0)).current;
  // Clip insets (from the top, and up from the bottom) of the thumbnails' scroll
  // area, faded in by `clip` while a photo lands
  const clip = useRef(new Animated.Value(0)).current;
  const clipTop = useRef(new Animated.Value(0)).current;
  const clipBottom = useRef(new Animated.Value(0)).current;
  const { width, height } = Dimensions.get('window');

  // Jump to the tapped photo once the modal has laid out
  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: initialIndex * width, animated: false });
    }, 30);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Thumbnail rect in window coords, or null if it's gone or scrolled out of view.
  // Also sets the clip insets to the thumbnails' scroll area for the landing.
  const getOrigin = (uri: string) => async (): Promise<Rect | null> => {
    const el = origins?.get(uri);
    if (!el) return null;
    const r = await measure(el);
    const areaEl = clipTo?.current ? asMeasurable(clipTo.current) : null;
    const area = areaEl ? await measure(areaEl) : null;
    const top = area ? Math.max(0, area.y) : 0;
    const bottom = area ? Math.min(height, area.y + area.height) : height;
    const visible = r.width > 0 && r.height > 0 && r.x + r.width > 0 && r.x < width && r.y + r.height > top && r.y < bottom;
    if (!visible) return null;
    clipTop.setValue(top);
    clipBottom.setValue(height - bottom);
    return r;
  };
  const topInset = Animated.multiply(clip, clipTop);
  const bottomInset = Animated.multiply(clip, clipBottom);

  const fade = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.96)', opacity: fade }} />
        <Animated.View style={{ position: 'absolute', top: 54, right: 20, zIndex: 10, opacity: fade }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={26} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
        </Animated.View>
        {uris.length > 1 && (
          <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 58, left: 0, right: 0, alignItems: 'center', zIndex: 10, opacity: fade }}>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: FONTS.sizes.sm, fontFamily: FONTS.family.medium }}>
              {index + 1} / {uris.length}
            </Text>
          </Animated.View>
        )}
        {/* Clip window: each overflow-hidden layer is shifted by an inset and its
            content shifted back, moving just its top (then bottom) edge inward.
            Transforms only, so it runs on the native driver. */}
        <Animated.View style={{ flex: 1, overflow: 'hidden', transform: [{ translateY: topInset }] }}>
        <Animated.View style={{ flex: 1, transform: [{ translateY: Animated.multiply(topInset, -1) }] }}>
        <Animated.View style={{ flex: 1, overflow: 'hidden', transform: [{ translateY: Animated.multiply(bottomInset, -1) }] }}>
        <Animated.View style={{ flex: 1, transform: [{ translateY: bottomInset }] }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={e => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ flex: 1 }}
        >
          {uris.map((uri, i) => (
            <ZoomablePhoto
              key={i}
              uri={uri}
              width={width}
              height={height}
              progress={progress}
              getOrigin={getOrigin(uri)}
              clip={clip}
              onDismiss={onClose}
            />
          ))}
        </ScrollView>
        </Animated.View>
        </Animated.View>
        </Animated.View>
        </Animated.View>
        {uris.length > 1 && (
          <Animated.View pointerEvents="none" style={{ position: 'absolute', bottom: 48, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: fade }}>
            {uris.map((_, i) => (
              <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === index ? 'white' : 'rgba(255,255,255,0.35)' }} />
            ))}
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}
