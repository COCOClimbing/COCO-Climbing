import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Modal, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../utils/theme';
import ZoomablePhoto, { Rect } from './ZoomablePhoto';

type Measurable = { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void };

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
}

// Full-screen photo viewer: swipe between photos, pinch/double-tap to zoom, drag
// down to shrink the photo and fade the backdrop away, revealing the screen behind;
// let go and it settles back onto its thumbnail. Mount it only while open.
export default function PhotoViewer({ uris, initialIndex, onClose, origins }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);
  // 0 = viewer fully shown, 1 = backdrop and controls gone
  const progress = useRef(new Animated.Value(0)).current;
  const { width, height } = Dimensions.get('window');

  // Jump to the tapped photo once the modal has laid out
  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: initialIndex * width, animated: false });
    }, 30);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Thumbnail rect in window coords, or null if it's gone or off-screen
  const getOrigin = (uri: string) => (): Promise<Rect | null> => new Promise(resolve => {
    const el = origins?.get(uri);
    if (!el) return resolve(null);
    el.measureInWindow((x, y, w, h) => {
      const visible = w > 0 && h > 0 && x + w > 0 && x < width && y + h > 0 && y < height;
      resolve(visible ? { x, y, width: w, height: h } : null);
    });
  });

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
              onDismiss={onClose}
            />
          ))}
        </ScrollView>
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
