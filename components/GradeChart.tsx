import React from 'react';
import { View, Text, StyleSheet, StyleProp, TextStyle } from 'react-native';
import Svg, { Polyline as SvgPolyline, Circle as SvgCircle, Text as SvgText, Line } from 'react-native-svg';
import { FONTS, SPACING } from '../utils/theme';
import { scoreToGradeLabel, Discipline, ChartStyle, ChartStyleSeries, chartStylesWithData, defaultChartStyle, chartStyleDiscipline } from '../utils/gradeUtils';
import ChartStyleDropdown from './ChartStyleDropdown';
import { ChartRange, filterByRange, rangeDateLabel } from './ChartRangeToggle';

const CHART_H = 110;
// The profile chart always shows the last 3 months; the range toggle is only on Stats.
const PROFILE_RANGE: ChartRange = '3M';

// Line chart of the average grade sent per session — shown on your own
// profile and on other people's. Each series is every session, oldest first,
// with a full YYYY-MM-DD date, one series per climb type. Always the last
// 3 months — the time-range toggle lives only on the Stats page's chart. A
// dropdown beside the title picks the type, listing those with enough
// sessions in that window.
// Callers render it only when chartStylesWithData(series) isn't empty.
export type GradePoint = { date: string; avg: number };

export default function GradeChart({ title, titleStyle, series, counts, labelSys, colors }: {
  title: string;
  titleStyle?: StyleProp<TextStyle>;
  series: ChartStyleSeries<GradePoint>;
  // Sends per type, to pick which one the chart opens on
  counts: Partial<Record<ChartStyle, number>>;
  // System to label each discipline's axis in (the viewer's preference)
  labelSys: Record<Discipline, string>;
  colors: any;
}) {
  const ranged = React.useMemo(() => {
    const out: ChartStyleSeries<GradePoint> = {};
    (Object.keys(series) as ChartStyle[]).forEach(k => { out[k] = filterByRange(series[k] ?? [], PROFILE_RANGE); });
    return out;
  }, [series]);
  const available = chartStylesWithData(ranged);
  const [chosen, setChosen] = React.useState<ChartStyle | null>(null);
  const style = chosen && available.includes(chosen) ? chosen : defaultChartStyle(counts, available);
  const pts = (style && ranged[style]) || [];
  const [chartWidth, setChartWidth] = React.useState(0);
  const dateLabel = (d: string) => rangeDateLabel(d, PROFILE_RANGE);

  const PAD_LEFT = 36;
  const PAD_RIGHT = 12;
  const PAD_TOP = 10;
  const PAD_BOTTOM = 8;
  const innerW = chartWidth - PAD_LEFT - PAD_RIGHT;
  const innerH = CHART_H - PAD_TOP - PAD_BOTTOM;

  const vals = pts.map(p => p.avg);
  // A flat line (every session the same grade) gets about a grade of headroom
  // each way, so the axis reads e.g. 5.11a / 5.11b / 5.11c, not 5.11b three times.
  const FLAT_PAD = 10; // about one grade on the score scale (V grades are 10 apart)
  const flat = Math.max(...vals) === Math.min(...vals);
  const minVal = Math.min(...vals) - (flat ? FLAT_PAD : 0);
  const maxVal = Math.max(...vals) + (flat ? FLAT_PAD : 0);
  const valRange = maxVal - minVal || 1;

  function cx(i: number) {
    if (pts.length === 1) return PAD_LEFT + innerW / 2;
    return PAD_LEFT + (i / (pts.length - 1)) * innerW;
  }
  function cy(v: number) {
    return PAD_TOP + innerH - ((v - minVal) / valRange) * innerH;
  }
  const numToLabel = (score: number) => scoreToGradeLabel(score, labelSys[chartStyleDiscipline(style)]);

  return (
    <View style={styles.chartContainer}>
      <View style={styles.titleRow}>
        <Text style={[titleStyle, styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
        {available.length > 0 && (
          <ChartStyleDropdown value={style} options={available} onChange={setChosen} colors={colors} />
        )}
      </View>

      <View onLayout={e => setChartWidth(e.nativeEvent.layout.width)}>
        {pts.length < 2 ? (
          <View style={[styles.empty, { height: CHART_H }]}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Not enough sessions in the last 3 months
            </Text>
          </View>
        ) : chartWidth > 0 && (
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
                {dateLabel(pts[0].date)}
              </Text>
              <Text style={[styles.dateLabel, { color: colors.textMuted, marginRight: PAD_RIGHT }]}>
                {dateLabel(pts[pts.length - 1].date)}
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chartContainer: {
    marginBottom: SPACING.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  title: {
    flexShrink: 1,
    marginBottom: 0,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.family.regular,
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
