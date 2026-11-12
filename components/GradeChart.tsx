import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Polyline as SvgPolyline, Circle as SvgCircle, Text as SvgText, Line, Defs, ClipPath, Rect, G } from 'react-native-svg';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { FONTS, SPACING } from '../utils/theme';

const CHART_H = 110;
const PAD_LEFT = 36;
const PAD_RIGHT = 12;
const PAD_TOP = 10;
const PAD_BOTTOM = 8;
// Fewest sessions-gaps you can zoom down to (2 = three sessions on screen)
const MIN_SPAN = 2;

// Line chart of the average grade sent per session — shown on your own
// profile and on other people's. Pinch sideways to zoom into a run of
// sessions (the grade axis refits to what's on screen), drag to pan while
// zoomed, double-tap or "Reset" to zoom back out.
export default function GradeChart({ pts, dominantSys, colors }: {
  pts: { date: string; avg: number }[];
  dominantSys: string;
  colors: any;
}) {
  const [chartWidth, setChartWidth] = React.useState(0);
  const n = pts.length;
  const fullSpan = Math.max(n - 1, 1);
  const canZoom = n - 1 > MIN_SPAN;

  // Visible window, in (fractional) point indices
  const [view, setView] = React.useState({ start: 0, span: fullSpan });
  const gestureStart = React.useRef(view);

  // Snap back to the full range if the data changes underneath us
  React.useEffect(() => { setView({ start: 0, span: fullSpan }); }, [n, fullSpan]);

  const innerW = chartWidth - PAD_LEFT - PAD_RIGHT;
  const innerH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const zoomed = view.span < fullSpan - 0.001;

  function clampView(start: number, span: number) {
    const s = Math.min(Math.max(span, Math.min(MIN_SPAN, fullSpan)), fullSpan);
    const st = Math.min(Math.max(start, 0), fullSpan - s);
    return { start: st, span: s };
  }

  const pinch = Gesture.Pinch()
    .enabled(canZoom)
    .runOnJS(true)
    .onBegin(() => { gestureStart.current = view; })
    .onUpdate(e => {
      if (innerW <= 0) return;
      const g = gestureStart.current;
      const f = Math.min(Math.max((e.focalX - PAD_LEFT) / innerW, 0), 1);
      const anchor = g.start + f * g.span;
      const span = g.span / Math.max(e.scale, 0.01);
      const clampedSpan = clampView(0, span).span;
      setView(clampView(anchor - f * clampedSpan, clampedSpan));
    });

  // Horizontal drag only, so vertical swipes still scroll the profile
  const pan = Gesture.Pan()
    .enabled(zoomed)
    .runOnJS(true)
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onBegin(() => { gestureStart.current = view; })
    .onUpdate(e => {
      if (innerW <= 0) return;
      const g = gestureStart.current;
      setView(clampView(g.start - (e.translationX / innerW) * g.span, g.span));
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .enabled(zoomed)
    .runOnJS(true)
    .onEnd((_e, success) => { if (success) setView({ start: 0, span: fullSpan }); });

  // Points on screen, plus one either side so the line runs off the edge
  const firstIdx = Math.max(Math.floor(view.start) - 1, 0);
  const lastIdx = Math.min(Math.ceil(view.start + view.span) + 1, n - 1);
  const shown = pts
    .map((p, i) => ({ ...p, i }))
    .slice(firstIdx, lastIdx + 1);

  // Grade axis fits the points that are actually inside the window
  const inWindow = shown.filter(p => p.i >= view.start - 0.001 && p.i <= view.start + view.span + 0.001);
  const vals = (inWindow.length ? inWindow : shown).map(p => p.avg);
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const valRange = maxVal - minVal || 1;

  function cx(i: number) {
    if (n === 1) return PAD_LEFT + innerW / 2;
    return PAD_LEFT + ((i - view.start) / view.span) * innerW;
  }
  function cy(v: number) {
    return PAD_TOP + innerH - ((v - minVal) / valRange) * innerH;
  }
  function numToLabel(v: number): string {
    if (dominantSys === 'v-scale') {
      if (v < 0) return 'VB';
      const whole = Math.floor(v);
      return v % 1 >= 0.4 ? `V${whole}+` : `V${whole}`;
    }
    if (dominantSys === 'yds') {
      const main = Math.floor(v / 10);
      const sub = ['a', 'b', 'c', 'd'][Math.round(v % 10)] || '';
      return `5.${main}${sub}`;
    }
    return String(Math.round(v));
  }

  // Edge dates: nearest session to each side of the window
  const leftDate = pts[Math.min(Math.ceil(view.start - 0.001), n - 1)]?.date;
  const rightDate = pts[Math.max(Math.floor(view.start + view.span + 0.001), 0)]?.date;

  return (
    <View
      style={styles.chartContainer}
      onLayout={e => setChartWidth(e.nativeEvent.layout.width)}
    >
      {chartWidth > 0 && n > 0 && (
        <>
          <GestureHandlerRootView>
            <GestureDetector gesture={Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan))}>
              <View collapsable={false}>
                <Svg width={chartWidth} height={CHART_H}>
                  <Defs>
                    <ClipPath id="gradeChartPlot">
                      <Rect x={PAD_LEFT - 5} y={0} width={innerW + 10} height={CHART_H} />
                    </ClipPath>
                  </Defs>
                  {[0, 0.5, 1].map(t => {
                    const val = minVal + t * valRange;
                    const y = PAD_TOP + innerH - t * innerH;
                    return (
                      <React.Fragment key={t}>
                        <Line
                          x1={PAD_LEFT} y1={y} x2={PAD_LEFT + innerW} y2={y}
                          stroke={colors.border} strokeWidth={1} strokeDasharray="4,4"
                        />
                        <SvgText
                          x={PAD_LEFT - 5} y={y + 4}
                          fontSize={9} fill={colors.textMuted}
                          textAnchor="end" fontFamily={FONTS.family.regular}
                        >
                          {numToLabel(val)}
                        </SvgText>
                      </React.Fragment>
                    );
                  })}
                  <G clipPath="url(#gradeChartPlot)">
                    <SvgPolyline
                      points={shown.map(p => `${cx(p.i)},${cy(p.avg)}`).join(' ')}
                      fill="none" stroke={colors.accent} strokeWidth={2}
                      strokeLinejoin="round" strokeLinecap="round"
                    />
                    {shown.map(p => (
                      <SvgCircle key={p.i} cx={cx(p.i)} cy={cy(p.avg)} r={3.5} fill={colors.accent} />
                    ))}
                  </G>
                </Svg>
              </View>
            </GestureDetector>
          </GestureHandlerRootView>
          {/* Date labels using native layout — immune to SVG clipping */}
          <View style={styles.dateRow}>
            <Text style={[styles.dateLabel, { color: colors.textMuted, marginLeft: PAD_LEFT }]}>
              {leftDate}
            </Text>
            {zoomed && (
              <TouchableOpacity
                onPress={() => setView({ start: 0, span: fullSpan })}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              >
                <Text style={[styles.resetLabel, { color: colors.accent }]}>Reset</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.dateLabel, { color: colors.textMuted, marginRight: PAD_RIGHT }]}>
              {rightDate}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chartContainer: {
    marginBottom: SPACING.sm,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  dateLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
  },
  resetLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.semibold,
  },
});
