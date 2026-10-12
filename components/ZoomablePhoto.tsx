import React, { useRef, useState } from 'react';
import { ScrollView, Image, Animated, Easing } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

export type Rect = { x: number; y: number; width: number; height: number };

interface Props {
  uri: string;
  width: number;
  height: number;
  // Called once the photo has been swiped away (after its exit animation).
  onDismiss?: () => void;
  // Viewer-owned 0→1 dismiss progress, so it can fade its backdrop with the drag.
  progress?: Animated.Value;
  // Where the photo's thumbnail is on screen; it settles back there on dismiss.
  getOrigin?: () => Promise<Rect | null>;
  // Viewer-owned 0→1 value it uses to clip the photo to the thumbnail's scroll
  // area; animated to 1 alongside the landing so it slides under headers/tab bars.
  clip?: Animated.Value;
}

const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;
const IMAGE_HEIGHT_RATIO = 0.8; // photo is fit into this much of the screen height

// One page of PhotoViewer: pinch to zoom (native iOS ScrollView zoom), pan while
// zoomed, double-tap to zoom in on that spot / back out, drag down to shrink and
// dismiss when not zoomed. Sits inside the viewer's horizontal paging ScrollView;
// iOS hands the swipe to the pager at the image edge.
export default function ZoomablePhoto({ uri, width, height, onDismiss, progress, getOrigin, clip }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [zoomed, setZoomed] = useState(false);
  const imageSize = useRef<{ width: number; height: number } | null>(null);
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  // Native double-tap recognizer — a JS tap timer misses the second tap once the
  // ScrollView is zoomed. Own root view because the viewers render inside a Modal.
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd((e, success) => {
      if (!success) return;
      const responder = scrollRef.current?.getScrollResponder() as any;
      if (zoomed) {
        responder?.scrollResponderZoomTo({ x: 0, y: 0, width, height, animated: true });
      } else {
        const w = width / DOUBLE_TAP_ZOOM;
        const h = height / DOUBLE_TAP_ZOOM;
        responder?.scrollResponderZoomTo({ x: e.x - w / 2, y: e.y - h / 2, width: w, height: h, animated: true });
      }
    });

  // On-screen size of the photo as fit (contain) into its box
  const displayedSize = () => {
    const boxW = width;
    const boxH = height * IMAGE_HEIGHT_RATIO;
    const img = imageSize.current;
    if (!img) return { width: boxW, height: boxH };
    const r = img.width / img.height;
    return r > boxW / boxH ? { width: boxW, height: boxW / r } : { width: boxH * r, height: boxH };
  };

  const settle = (toX: number, toY: number, toScale: number, toProgress: number, done?: () => void, clipTo?: number) => {
    const anim = (v: Animated.Value, toValue: number) =>
      Animated.timing(v, { toValue, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    Animated.parallel([
      anim(tx, toX), anim(ty, toY), anim(scale, toScale),
      ...(progress ? [anim(progress, toProgress)] : []),
      ...(clip && clipTo !== undefined ? [anim(clip, clipTo)] : []),
    ]).start(done);
  };

  const dismiss = async () => {
    const origin = await getOrigin?.();
    if (origin) {
      // Land the photo on its thumbnail: centre on it, scaled to cover it
      const shown = displayedSize();
      const s = Math.max(origin.width / shown.width, origin.height / shown.height);
      settle(origin.x + origin.width / 2 - width / 2, origin.y + origin.height / 2 - height / 2, s, 1, onDismiss, 1);
    } else {
      // Thumbnail not on screen — just drop it out the bottom
      settle(0, height * 0.6, 0.55, 1, onDismiss);
    }
  };

  // Vertical drag only (fails on sideways movement so the pager still swipes), and
  // only un-zoomed — zoomed, a drag pans the photo instead. Once going, it follows
  // the finger both ways and shrinks the further down it goes.
  const swipeDown = Gesture.Pan()
    .enabled(!zoomed && !!onDismiss)
    .activeOffsetY([-15, 15])
    .failOffsetX([-20, 20])
    .runOnJS(true)
    .onUpdate(e => {
      const down = Math.max(0, e.translationY);
      tx.setValue(e.translationX);
      ty.setValue(e.translationY);
      scale.setValue(1 - 0.45 * Math.min(1, down / (height * 0.6)));
      progress?.setValue(Math.min(1, down / (height * 0.35)));
    })
    .onEnd(e => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) dismiss();
      else settle(0, 0, 1, 0);
    });

  return (
    <GestureHandlerRootView style={{ width, height }}>
      <ScrollView
        ref={scrollRef}
        style={{ width, height }}
        contentContainerStyle={{ width, height }}
        maximumZoomScale={MAX_ZOOM}
        minimumZoomScale={1}
        bouncesZoom
        centerContent
        // No rubber-banding on an un-zoomed photo; once zoomed the content is
        // bigger than the frame, so panning still bounces normally.
        alwaysBounceVertical={false}
        alwaysBounceHorizontal={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onScroll={e => {
          const z = e.nativeEvent.zoomScale > 1.01;
          if (z !== zoomed) setZoomed(z);
        }}
        scrollEventThrottle={16}
      >
        <GestureDetector gesture={Gesture.Simultaneous(doubleTap, swipeDown)}>
          <Animated.View style={{ width, height, justifyContent: 'center', transform: [{ translateX: tx }, { translateY: ty }, { scale }] }}>
            <Image
              source={{ uri }}
              style={{ width, height: height * IMAGE_HEIGHT_RATIO }}
              resizeMode="contain"
              onLoad={e => { imageSize.current = e.nativeEvent.source; }}
            />
          </Animated.View>
        </GestureDetector>
      </ScrollView>
    </GestureHandlerRootView>
  );
}
