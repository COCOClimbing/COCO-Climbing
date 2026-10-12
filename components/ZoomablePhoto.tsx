import React, { useRef } from 'react';
import { ScrollView, Image, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

interface Props {
  uri: string;
  width: number;
  height: number;
}

const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;

// A full-screen viewer page: pinch to zoom (native iOS ScrollView zoom), pan while
// zoomed, double-tap to zoom in on that spot / back out. Sits inside the viewer's
// horizontal paging ScrollView; iOS hands the swipe to the pager at the image edge.
export default function ZoomablePhoto({ uri, width, height }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const zoomed = useRef(false);

  // Native double-tap recognizer — a JS tap timer misses the second tap once the
  // ScrollView is zoomed. Own root view because the viewers render inside a Modal.
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd((e, success) => {
      if (!success) return;
      const responder = scrollRef.current?.getScrollResponder() as any;
      if (zoomed.current) {
        responder?.scrollResponderZoomTo({ x: 0, y: 0, width, height, animated: true });
      } else {
        const w = width / DOUBLE_TAP_ZOOM;
        const h = height / DOUBLE_TAP_ZOOM;
        responder?.scrollResponderZoomTo({ x: e.x - w / 2, y: e.y - h / 2, width: w, height: h, animated: true });
      }
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
        onScroll={e => { zoomed.current = e.nativeEvent.zoomScale > 1.01; }}
        scrollEventThrottle={16}
      >
        <GestureDetector gesture={doubleTap}>
          <View style={{ width, height, justifyContent: 'center' }}>
            <Image source={{ uri }} style={{ width, height: height * 0.8 }} resizeMode="contain" />
          </View>
        </GestureDetector>
      </ScrollView>
    </GestureHandlerRootView>
  );
}
