import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline as SvgPolyline, Circle as SvgCircle, Text as SvgText, Line } from 'react-native-svg';
import { FONTS, SPACING } from '../utils/theme';

const CHART_H = 110;

// Line chart of the average grade sent per session — shown on your own
// profile and on other people's.
export default function GradeChart({ pts, dominantSys, colors }: {
  pts: { date: string; avg: number }[];
  dominantSys: string;
  colors: any;
}) {
  const [chartWidth, setChartWidth] = React.useState(0);

  const PAD_LEFT = 36;
  const PAD_RIGHT = 12;
  const PAD_TOP = 10;
  const PAD_BOTTOM = 8;
  const innerW = chartWidth - PAD_LEFT - PAD_RIGHT;
  const innerH = CHART_H - PAD_TOP - PAD_BOTTOM;

  const vals = pts.map(p => p.avg);
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const valRange = maxVal - minVal || 1;

  function cx(i: number) {
    if (pts.length === 1) return PAD_LEFT + innerW / 2;
    return PAD_LEFT + (i / (pts.length - 1)) * innerW;
  }
  function cy(v: number) {
    return PAD_TOP + innerH - ((v - minVal) / valRange) * innerH;
  }
  function numToLabel(n: number): string {
    if (dominantSys === 'v-scale') {
      if (n < 0) return 'VB';
      const whole = Math.floor(n);
      return n % 1 >= 0.4 ? `V${whole}+` : `V${whole}`;
    }
    if (dominantSys === 'yds') {
      const main = Math.floor(n / 10);
      const sub = ['a', 'b', 'c', 'd'][Math.round(n % 10)] || '';
      return `5.${main}${sub}`;
    }
    return String(Math.round(n));
  }

  return (
    <View
      style={styles.chartContainer}
      onLayout={e => setChartWidth(e.nativeEvent.layout.width)}
    >
      {chartWidth > 0 && (
        <>
          <Svg width={chartWidth} height={CHART_H}>
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
            <SvgPolyline
              points={pts.map((p, i) => `${cx(i)},${cy(p.avg)}`).join(' ')}
              fill="none" stroke={colors.accent} strokeWidth={2}
              strokeLinejoin="round" strokeLinecap="round"
            />
            {pts.map((p, i) => (
              <SvgCircle key={i} cx={cx(i)} cy={cy(p.avg)} r={3.5} fill={colors.accent} />
            ))}
          </Svg>
          {/* Date labels using native layout — immune to SVG clipping */}
          <View style={styles.dateRow}>
            <Text style={[styles.dateLabel, { color: colors.textMuted, marginLeft: PAD_LEFT }]}>
              {pts[0].date}
            </Text>
            <Text style={[styles.dateLabel, { color: colors.textMuted, marginRight: PAD_RIGHT }]}>
              {pts[pts.length - 1].date}
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
    marginTop: 2,
  },
  dateLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.family.regular,
  },
});
