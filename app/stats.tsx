import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, Modal, SafeAreaView } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { FONTS, SPACING, Climb, CLIMB_TYPES, CLIMB_STYLES, getGradeDifficulty } from '../utils/theme';
import { useTheme } from '../utils/ThemeContext';
import { useNav } from '../utils/NavigationContext';
import { getAllClimbs, getAllSessions, setStatsRefreshCallback, bulkSaveClimbs, bulkSaveSessions } from '../utils/storage';
import { gradeToNum } from '../utils/gradeUtils';
import { supabase } from '../utils/supabase';
import { EmptyState } from '../components/UI';
import { parseISO, differenceInDays } from 'date-fns';

const W = Dimensions.get('window').width;
const CHART_W = W - SPACING.lg * 2;
const CHART_H = 120;
const PAD = { top: 8, bottom: 24, left: 32, right: 8 };

// ── Grade helpers ────────────────────────────────────────────────────────────

function gradeNum(c: Climb): number {
  return gradeToNum(c.grade, c.gradeSystem);
}
const ROPE_TYPES = ['top_rope', 'sport', 'trad', 'auto_belay'];

function hardestSend(climbs: Climb[], system: string): Climb | undefined {
  const types = system === 'v-scale' ? ['boulder'] : system === 'font' ? ['boulder'] : ROPE_TYPES;
  return [...climbs]
    .filter(c => (c.outcome === 'send' || c.outcome === 'flash') && c.gradeSystem === system && types.includes(c.type))
    .sort((a, b) => getGradeDifficulty(b.grade, b.gradeSystem) - getGradeDifficulty(a.grade, a.gradeSystem))[0];
}
function numToLabel(n: number, sys: string): string {
  if (sys === 'v-scale') {
    if (n < 0) return 'VB';
    const whole = Math.floor(n);
    return n % 1 >= 0.4 ? `V${whole}+` : `V${whole}`;
  }
  if (sys === 'yds') {
    const main = Math.floor(n / 10);
    const sub = ['a', 'b', 'c', 'd'][Math.round(n % 10)] || '';
    return `5.${main}${sub}`;
  }
  return String(Math.round(n));
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const { colors } = useTheme();
  const { screen } = useNav();
  const [climbs, setClimbs] = useState<Climb[]>([]);
  const [sessionDateMap, setSessionDateMap] = useState<Record<string, string>>({});
  const [sessionCount, setSessionCount] = useState(0);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    // Pull fresh data from Supabase so stats always reflect the latest cloud state
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const userId = session.user.id;
      const [climbsRes, sessionsRes] = await Promise.all([
        supabase.from('climbs').select('*').eq('user_id', userId),
        supabase.from('sessions').select('*').eq('user_id', userId),
      ]);
      if (climbsRes.data) {
        const mapped: Climb[] = climbsRes.data.map((r: any) => ({
          id: r.id, date: r.date, sessionId: r.session_id,
          type: r.type, outcome: r.outcome, styles: r.styles ?? [],
          environment: r.environment, grade: r.grade, gradeSystem: r.grade_system,
          routeName: r.route_name ?? undefined, location: r.location ?? undefined,
          notes: r.notes ?? undefined, attempts: r.attempts ?? 1,
          projectId: r.project_id ?? undefined, projectName: r.project_name ?? undefined,
          mediaUri: r.media_uri ?? undefined, mediaType: r.media_type ?? undefined,
          mediaUris: r.media_uris ?? undefined, mediaTypes: r.media_types ?? undefined,
        }));
        await bulkSaveClimbs(mapped);
      }
      if (sessionsRes.data) {
        const mapped = sessionsRes.data.map((r: any) => ({
          id: r.id, date: r.date, environment: r.environment,
          location: r.location ?? undefined, notes: r.notes ?? undefined,
          startedAt: r.started_at ?? undefined, endedAt: r.ended_at ?? undefined,
          lastClimbAt: r.last_climb_at ?? undefined, friends: r.friends ?? undefined,
          mediaUris: r.media_uris ?? undefined, mediaTypes: r.media_types ?? undefined,
          mediaUri: r.media_uris?.[0] ?? undefined, mediaType: r.media_types?.[0] ?? undefined,
        }));
        await bulkSaveSessions(mapped);
      }
    }

    const [allClimbs, allSessions] = await Promise.all([getAllClimbs(), getAllSessions()]);
    setClimbs(allClimbs);
    setSessionCount(allSessions.length);
    const map: Record<string, string> = {};
    allSessions.forEach(s => { map[s.id] = s.date; });
    setSessionDateMap(map);
  }, []);

  useEffect(() => {
    if (screen === 'stats') loadData();
  }, [screen]);

  useEffect(() => {
    setStatsRefreshCallback(loadData);
    return () => setStatsRefreshCallback(null);
  }, [loadData]);

  const computed = useMemo(() => {
    if (climbs.length === 0) return null;

    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonth = now.getMonth();
    const lastYearStart = new Date(thisYear - 1, 0, 1);
    const lastYearEnd = new Date(thisYear, 0, 1);
    const lastMonthStart = new Date(thisYear, thisMonth - 1, 1);
    const lastMonthEnd = new Date(thisYear, thisMonth, 1);

    const sends = climbs.filter(c => c.outcome === 'send' || c.outcome === 'flash');
    const flashes = climbs.filter(c => c.outcome === 'flash');
    const projects = [...new Set(climbs.filter(c => c.projectId).map(c => c.projectId))];
    const sendRate = Math.round((sends.length / climbs.length) * 100);
    const flashRate = sends.length > 0 ? Math.round((flashes.length / sends.length) * 100) : 0;

    const indoorCount = climbs.filter(c => c.environment === 'indoor').length;
    const outdoorCount = climbs.filter(c => c.environment === 'outdoor').length;
    const indoorPct = Math.round((indoorCount / climbs.length) * 100);

    const sysCounts: Record<string, number> = {};
    sends.forEach(c => { sysCounts[c.gradeSystem] = (sysCounts[c.gradeSystem] || 0) + 1; });
    const systems = Object.entries(sysCounts).sort((a, b) => b[1] - a[1]).map(e => e[0]);

    const climbDate = (c: Climb) => new Date((c.sessionId && sessionDateMap[c.sessionId]) ? sessionDateMap[c.sessionId] : c.date.slice(0, 10));
    const allSends = sends;
    const yearSends = sends.filter(c => { const d = climbDate(c); return d >= lastYearStart && d < lastYearEnd; });
    const monthSends = sends.filter(c => { const d = climbDate(c); return d >= lastMonthStart && d < lastMonthEnd; });

    const styleSendMap: Record<string, Climb[]> = {};
    const styleClimbMap: Record<string, number> = {};
    climbs.forEach(c => {
      c.styles.forEach(s => {
        styleClimbMap[s] = (styleClimbMap[s] || 0) + 1;
        if (c.outcome === 'send' || c.outcome === 'flash') {
          if (!styleSendMap[s]) styleSendMap[s] = [];
          styleSendMap[s].push(c);
        }
      });
    });
    const topStyles = Object.entries(styleClimbMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

    const typeCounts: Record<string, number> = {};
    climbs.forEach(c => { typeCounts[c.type] = (typeCounts[c.type] || 0) + 1; });
    const topTypes = CLIMB_TYPES.filter(t => typeCounts[t.id]).sort((a, b) => (typeCounts[b.id] || 0) - (typeCounts[a.id] || 0));
    const maxTypeCount = Math.max(...topTypes.map(t => typeCounts[t.id] || 0));

    const climbWeeks = [...new Set(climbs.map(c => {
      const dateStr = (c.sessionId && sessionDateMap[c.sessionId]) ? sessionDateMap[c.sessionId] : c.date.slice(0, 10);
      const d = parseISO(dateStr);
      const day = d.getDay();
      const mon = new Date(d);
      mon.setDate(d.getDate() - ((day + 6) % 7));
      const y = mon.getFullYear();
      const m = String(mon.getMonth() + 1).padStart(2, '0');
      const dd = String(mon.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    }))].sort();
    let longestStreak = climbWeeks.length > 0 ? 1 : 0, curStreak = climbWeeks.length > 0 ? 1 : 0;
    for (let i = 1; i < climbWeeks.length; i++) {
      const diff = differenceInDays(parseISO(climbWeeks[i]), parseISO(climbWeeks[i - 1]));
      if (diff === 7) { curStreak++; longestStreak = Math.max(longestStreak, curStreak); }
      else curStreak = 1;
    }

    const locationCounts: Record<string, number> = {};
    climbs.forEach(c => { if (c.location) locationCounts[c.location] = (locationCounts[c.location] || 0) + 1; });
    const favLocation = Object.entries(locationCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

    const avgPerSession = sessionCount > 0 ? Math.round(climbs.length / sessionCount) : 0;

    const climbsPerSession: Record<string, number> = {};
    climbs.forEach(c => { if (c.sessionId) climbsPerSession[c.sessionId] = (climbsPerSession[c.sessionId] || 0) + 1; });
    const biggestSession = Math.max(0, ...Object.values(climbsPerSession));

    const monthClimbCounts: Record<string, number> = {};
    climbs.forEach(c => {
      const dateStr = (c.sessionId && sessionDateMap[c.sessionId]) ? sessionDateMap[c.sessionId] : c.date.slice(0, 10);
      monthClimbCounts[dateStr.slice(0, 7)] = (monthClimbCounts[dateStr.slice(0, 7)] || 0) + 1;
    });
    const mostActiveMonthKey = Object.entries(monthClimbCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const mostActiveMonth = mostActiveMonthKey
      ? new Date(mostActiveMonthKey + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : null;

    const outdoorSends = sends.filter(c => c.environment === 'outdoor').length;

    const dominantSys = systems[0];
    const climbsBySession: Record<string, { date: string; climbs: Climb[] }> = {};
    climbs.filter(c => c.gradeSystem === dominantSys).forEach(c => {
      const key = c.sessionId || c.date.slice(0, 10);
      const date = (c.sessionId && sessionDateMap[c.sessionId]) ? sessionDateMap[c.sessionId] : c.date.slice(0, 10);
      if (!climbsBySession[key]) climbsBySession[key] = { date, climbs: [] };
      climbsBySession[key].climbs.push(c);
    });
    const chartPoints = Object.values(climbsBySession)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(({ date, climbs: sc }) => {
        const avg = sc.reduce((sum, c) => sum + gradeNum(c), 0) / sc.length;
        return { date, val: avg };
      });
    const chartVals = chartPoints.map(p => p.val);
    const minVal = Math.min(...chartVals);
    const maxVal = Math.max(...chartVals);
    const valRange = maxVal - minVal || 1;

    return {
      sends, flashes, projects, sendRate, flashRate,
      indoorCount, outdoorCount, indoorPct,
      systems, allSends, yearSends, monthSends,
      topStyles, typeCounts, topTypes, maxTypeCount,
      longestStreak, favLocation,
      avgPerSession, biggestSession, mostActiveMonth,
      outdoorSends, dominantSys, chartPoints, minVal, valRange,
    };
  }, [climbs, sessionDateMap, sessionCount]);

  if (!computed) {
    return (
      <View style={[ss.container, { backgroundColor: colors.bg }]}>
        <EmptyState icon="" title="No data yet" subtitle="Log some climbs to see your stats" />
      </View>
    );
  }

  const {
    sends, flashes, projects, sendRate, flashRate,
    indoorCount, outdoorCount, indoorPct,
    systems, allSends, yearSends, monthSends,
    topStyles, typeCounts, topTypes, maxTypeCount,
    longestStreak, favLocation,
    avgPerSession, biggestSession, mostActiveMonth,
    outdoorSends, dominantSys, chartPoints, minVal, valRange,
  } = computed;

  const innerW = CHART_W - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;
  function cx(i: number) { return PAD.left + (chartPoints.length === 1 ? innerW / 2 : (i / (chartPoints.length - 1)) * innerW); }
  function cy(v: number) { return PAD.top + innerH - ((v - minVal) / valRange) * innerH; }

  // ── Render helpers ────────────────────────────────────────────────────────

  function Divider() {
    return <View style={[ss.divider, { backgroundColor: colors.border }]} />;
  }

  function SectionLabel({ title }: { title: string }) {
    return <Text style={[ss.sectionLabel, { color: colors.textMuted }]}>{title}</Text>;
  }

  function ImprovementRow({ label, sys }: { label: string; sys: string }) {
    const all = hardestSend(allSends, sys);
    const year = hardestSend(yearSends, sys);
    const month = hardestSend(monthSends, sys);
    if (!all) return null;

    function Cell({ climb, dim }: { climb?: Climb; dim?: boolean }) {
      if (!climb) return <Text style={[ss.impCell, { color: colors.textMuted }]}>—</Text>;
      const isHighlight = climb.grade === all?.grade;
      return (
        <Text style={[ss.impCell, {
          color: dim ? colors.textSecondary : isHighlight ? colors.accentGreen : colors.textPrimary,
          fontFamily: isHighlight ? FONTS.family.bold : FONTS.family.regular,
        }]}>
          {climb.grade}
        </Text>
      );
    }

    return (
      <View style={ss.impRow}>
        <Text style={[ss.impLabel, { color: colors.textMuted }]}>{label}</Text>
        <Cell climb={all} />
        <Cell climb={year} dim />
        <Cell climb={month} dim />
      </View>
    );
  }

  return (
    <View style={[ss.container, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={ss.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Overview ── */}
        <View style={ss.overviewRow}>
          <View style={ss.overviewItem}>
            <Text style={[ss.bigNum, { color: colors.textPrimary, fontFamily: FONTS.family.heavy }]}>{climbs.length}</Text>
            <Text style={[ss.bigLabel, { color: colors.textMuted }]}>climbs</Text>
          </View>
          <View style={[ss.overviewDivider, { backgroundColor: colors.border }]} />
          <View style={ss.overviewItem}>
            <Text style={[ss.bigNum, { color: colors.accentGreen, fontFamily: FONTS.family.heavy }]}>{sends.length}</Text>
            <Text style={[ss.bigLabel, { color: colors.textMuted }]}>sends</Text>
          </View>
          <View style={[ss.overviewDivider, { backgroundColor: colors.border }]} />
          <View style={ss.overviewItem}>
            <Text style={[ss.bigNum, { color: colors.accent, fontFamily: FONTS.family.heavy }]}>{projects.length}</Text>
            <Text style={[ss.bigLabel, { color: colors.textMuted }]}>projects</Text>
          </View>
          <View style={[ss.overviewDivider, { backgroundColor: colors.border }]} />
          <View style={ss.overviewItem}>
            <Text style={[ss.bigNum, { color: colors.accentGold, fontFamily: FONTS.family.heavy }]}>{sendRate}%</Text>
            <Text style={[ss.bigLabel, { color: colors.textMuted }]}>send rate</Text>
          </View>
        </View>

        <Divider />

        {/* ── Hardest Sends ── */}
        <SectionLabel title="HARDEST SENDS" />
        {(() => {
          const TYPES = [
            { id: 'boulder',    label: 'Boulder'    },
            { id: 'top_rope',   label: 'Top Rope'   },
            { id: 'sport',      label: 'Sport'      },
            { id: 'trad',       label: 'Trad'       },
            { id: 'auto_belay', label: 'Auto Belay' },
          ].map(t => ({ ...t, count: typeCounts[t.id] || 0 }))
           .sort((a, b) => b.count - a.count);

          const gridW = W - SPACING.lg * 2;
          const BIG_SIZE = (gridW - SPACING.sm) / 2;
          const SMALL_SIZE = (gridW - SPACING.sm * 2) / 3;

          function Square({ id, label, size }: { id: string; label: string; size: number }) {
            const best = [...sends].filter(c => c.type === id).sort((a, b) => getGradeDifficulty(b.grade, b.gradeSystem) - getGradeDifficulty(a.grade, a.gradeSystem))[0];
            const hasData = !!best;
            const fontSize = size > 130 ? 28 : size > 90 ? FONTS.sizes.xl : FONTS.sizes.md;
            return (
              <View
                style={[ss.hardestSquare, {
                  width: size, height: size,
                  borderColor: hasData ? colors.accent + '66' : colors.border,
                  backgroundColor: hasData ? colors.accent + '0D' : colors.bgCard,
                }]}
              >
                <Text style={[ss.hardestGrade, { fontSize, color: hasData ? colors.accent : colors.textMuted, fontFamily: hasData ? FONTS.family.heavy : FONTS.family.regular }]}>
                  {hasData ? best.grade : 'NA'}
                </Text>
                <Text style={[ss.hardestSys, { color: colors.textMuted, fontSize: size > 100 ? FONTS.sizes.xs : 9 }]}>{label}</Text>
              </View>
            );
          }

          return (
            <View style={{ gap: SPACING.sm }}>
              <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                <Square id={TYPES[0].id} label={TYPES[0].label} size={BIG_SIZE} />
                <Square id={TYPES[1].id} label={TYPES[1].label} size={BIG_SIZE} />
              </View>
              <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                <Square id={TYPES[2].id} label={TYPES[2].label} size={SMALL_SIZE} />
                <Square id={TYPES[3].id} label={TYPES[3].label} size={SMALL_SIZE} />
                <Square id={TYPES[4].id} label={TYPES[4].label} size={SMALL_SIZE} />
              </View>
            </View>
          );
        })()}

        <Divider />

        {/* ── Environment ── */}
        <SectionLabel title="ENVIRONMENT" />
        <View style={ss.envRow}>
          <Text style={[ss.envLabel, { color: colors.textSecondary }]}>Indoor</Text>
          <View style={[ss.envTrack, { backgroundColor: colors.bgElevated }]}>
            <View style={[ss.envFill, { width: `${indoorPct}%`, backgroundColor: colors.accent }]} />
          </View>
          <Text style={[ss.envPct, { color: colors.textMuted }]}>{indoorCount}</Text>
        </View>
        <View style={ss.envRow}>
          <Text style={[ss.envLabel, { color: colors.textSecondary }]}>Outdoor</Text>
          <View style={[ss.envTrack, { backgroundColor: colors.bgElevated }]}>
            <View style={[ss.envFill, { width: `${100 - indoorPct}%`, backgroundColor: colors.accentGreen }]} />
          </View>
          <Text style={[ss.envPct, { color: colors.textMuted }]}>{outdoorCount}</Text>
        </View>
        {outdoorSends > 0 && (
          <Text style={[ss.envSub, { color: colors.textMuted }]}>
            {outdoorSends} outdoor {outdoorSends === 1 ? 'send' : 'sends'}
          </Text>
        )}

        <Divider />

        {/* ── Improvement ── */}
        <SectionLabel title="PROGRESSION" />
        <View style={ss.impHeader}>
          <Text style={[ss.impLabel, { color: colors.textMuted }]} />
          <Text style={[ss.impColHead, { color: colors.textMuted }]}>All time</Text>
          <Text style={[ss.impColHead, { color: colors.textMuted }]}>Last year</Text>
          <Text style={[ss.impColHead, { color: colors.textMuted }]}>Last month</Text>
        </View>
        {systems.map(sys => {
          const label = sys === 'v-scale' ? 'Boulder' : sys === 'yds' ? 'Sport' : sys === 'french' ? 'French' : sys;
          return <ImprovementRow key={sys} label={label} sys={sys} />;
        })}

        {/* Progress chart */}
        {chartPoints.length >= 2 && (
          <View style={{ marginTop: SPACING.lg }}>
            <Text style={[ss.chartCaption, { color: colors.textMuted }]}>
              Avg {dominantSys === 'v-scale' ? 'boulder' : 'route'} grade tried per session
            </Text>
            <Svg width={CHART_W} height={CHART_H}>
              {[0, 0.5, 1].map(t => {
                const val = minVal + t * valRange;
                const y = PAD.top + innerH - t * innerH;
                return (
                  <React.Fragment key={t}>
                    <Line x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y} stroke={colors.border} strokeWidth={1} strokeDasharray="3,4" />
                    <SvgText x={PAD.left - 4} y={y + 4} fontSize={8} fill={colors.textMuted} textAnchor="end" fontFamily={FONTS.family.regular}>
                      {numToLabel(val, dominantSys)}
                    </SvgText>
                  </React.Fragment>
                );
              })}
              <Polyline
                points={chartPoints.map((p, i) => `${cx(i)},${cy(p.val)}`).join(' ')}
                fill="none" stroke={colors.accent} strokeWidth={2}
                strokeLinejoin="round" strokeLinecap="round"
              />
              {chartPoints.map((p, i) => (
                <React.Fragment key={p.date}>
                  <Circle cx={cx(i)} cy={cy(p.val)} r={3} fill={colors.accent} />
                  {(i === 0 || i === chartPoints.length - 1) && (
                    <SvgText x={cx(i)} y={CHART_H - 2} fontSize={8} fill={colors.textMuted} textAnchor="middle" fontFamily={FONTS.family.regular}>
                      {p.date.slice(5)}
                    </SvgText>
                  )}
                </React.Fragment>
              ))}
            </Svg>
          </View>
        )}

        <Divider />

        {/* ── Climb Types ── */}
        <SectionLabel title="CLIMB TYPE" />
        {topTypes.map(t => {
          const count = typeCounts[t.id] || 0;
          const pct = count / maxTypeCount;
          return (
            <TouchableOpacity key={t.id} style={ss.typeRow} onPress={() => setSelectedType(t.id)} activeOpacity={0.7}>
              <Text style={[ss.typeName, { color: colors.textSecondary }]}>{t.label}</Text>
              <View style={[ss.typeTrack, { backgroundColor: colors.bgElevated }]}>
                <View style={[ss.typeFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: colors.accent + '88' }]} />
              </View>
              <Text style={[ss.typeCount, { color: colors.textMuted }]}>{count}</Text>
              <Text style={[ss.typeChevron, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>
          );
        })}

        <Divider />

        {/* ── Climb Style ── */}
        {topStyles.length > 0 && (
          <>
            <SectionLabel title="CLIMB STYLE" />
            {topStyles.map(([style, count]) => {
              const allStyleClimbs = climbs.filter(c => c.styles.includes(style));
              const hardest = [...allStyleClimbs].sort((a, b) => gradeNum(b) - gradeNum(a))[0];
              const maxStyleCount = topStyles[0][1];
              const pct = Math.round((count / maxStyleCount) * 100);
              const styleLabel = CLIMB_STYLES.find(s => s.id === style)?.label ?? style;
              return (
                <View key={style} style={ss.styleRow}>
                  <Text style={[ss.styleName, { color: colors.textSecondary }]}>{styleLabel}</Text>
                  <View style={[ss.styleTrack, { backgroundColor: colors.bgElevated }]}>
                    <View style={[ss.styleFill, { width: `${pct}%`, backgroundColor: colors.accentBlue + 'AA' }]} />
                  </View>
                  <Text style={[ss.styleCount, { color: colors.textMuted }]}>{count}</Text>
                  {hardest && (
                    <Text style={[ss.styleHardest, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>{hardest.grade}</Text>
                  )}
                </View>
              );
            })}
            <Divider />
          </>
        )}

        {/* ── Insights ── */}
        <SectionLabel title="INSIGHTS" />

        {/* Sessions row */}
        {(() => {
          const items = [
            { label: 'Sessions', value: String(sessionCount), unit: '' },
            { label: 'Avg / session', value: String(avgPerSession), unit: 'climbs' },
            { label: 'Biggest session', value: String(biggestSession), unit: 'climbs' },
          ];
          return (
            <View style={ss.insightRow}>
              {items.map((item, i) => (
                <React.Fragment key={item.label}>
                  {i > 0 && <View style={[ss.insightDivider, { backgroundColor: colors.border }]} />}
                  <View style={ss.insightItem}>
                    <View style={ss.insightValRow}>
                      <Text style={[ss.insightVal, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>{item.value}</Text>
                      {item.unit ? <Text style={[ss.insightUnit, { color: colors.textMuted }]}>{item.unit}</Text> : null}
                    </View>
                    <Text style={[ss.insightLabel, { color: colors.textMuted }]}>{item.label}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          );
        })()}

        {/* Training sub-section */}
        <Text style={[ss.insightSubhead, { color: colors.textMuted }]}>TRAINING</Text>
        {(() => {
          const items = [
            { label: 'Longest streak', value: String(longestStreak), unit: longestStreak === 1 ? 'week' : 'weeks' },
            ...(mostActiveMonth ? [{ label: 'Best month', value: mostActiveMonth, unit: '' }] : []),
          ];
          return (
            <View style={ss.insightRow}>
              {items.map((item, i) => (
                <React.Fragment key={item.label}>
                  {i > 0 && <View style={[ss.insightDivider, { backgroundColor: colors.border }]} />}
                  <View style={ss.insightItem}>
                    <View style={ss.insightValRow}>
                      <Text style={[ss.insightVal, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>{item.value}</Text>
                      {item.unit ? <Text style={[ss.insightUnit, { color: colors.textMuted }]}>{item.unit}</Text> : null}
                    </View>
                    <Text style={[ss.insightLabel, { color: colors.textMuted }]}>{item.label}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          );
        })()}
        {favLocation && (
          <>
            <Text style={[ss.insightSubhead, { color: colors.textMuted }]}>FAVOURITE SPOT</Text>
            <View style={{ marginBottom: SPACING.lg }}>
              <Text style={[ss.insightVal, { color: colors.textPrimary, fontFamily: FONTS.family.bold }]}>{favLocation}</Text>
            </View>
          </>
        )}

        <View style={{ height: SPACING.xxl * 2 }} />
      </ScrollView>

      {/* ── Grade breakdown modal ── */}
      <Modal
        visible={selectedType !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedType(null)}
      >
        <SafeAreaView style={[ss.modalContainer, { backgroundColor: colors.bg }]}>
          {(() => {
            if (!selectedType) return null;
            const typeInfo = CLIMB_TYPES.find(t => t.id === selectedType);
            const typeClimbs = climbs.filter(c => c.type === selectedType);
            const gradeCounts: Record<string, { total: number; sends: number; system: string }> = {};
            typeClimbs.forEach(c => {
              if (!gradeCounts[c.grade]) gradeCounts[c.grade] = { total: 0, sends: 0, system: c.gradeSystem };
              gradeCounts[c.grade].total += 1;
              if (c.outcome === 'send' || c.outcome === 'flash') gradeCounts[c.grade].sends += 1;
            });
            const gradeEntries = Object.entries(gradeCounts).sort((a, b) =>
              getGradeDifficulty(b[0], b[1].system) - getGradeDifficulty(a[0], a[1].system)
            );
            const maxCount = Math.max(...gradeEntries.map(([, v]) => v.total), 1);
            const accentColor = CLIMB_TYPES.find(t => t.id === selectedType)?.color ?? colors.accent;

            return (
              <>
                <View style={ss.modalHeader}>
                  <TouchableOpacity onPress={() => setSelectedType(null)} style={ss.modalClose}>
                    <Text style={[ss.modalCloseText, { color: colors.textMuted }]}>Done</Text>
                  </TouchableOpacity>
                  <Text style={[ss.modalTitle, { color: colors.textPrimary }]}>{typeInfo?.label ?? selectedType}</Text>
                  <Text style={[ss.modalSubtitle, { color: colors.textMuted }]}>{typeClimbs.length} climbs</Text>
                </View>
                {gradeEntries.length === 0 ? (
                  <View style={ss.modalEmpty}>
                    <Text style={[ss.modalEmptyText, { color: colors.textMuted }]}>No climbs logged</Text>
                  </View>
                ) : (
                  <ScrollView contentContainerStyle={ss.modalScroll} showsVerticalScrollIndicator={false}>
                    <Text style={[ss.modalSectionLabel, { color: colors.textMuted }]}>GRADE BREAKDOWN</Text>
                    {gradeEntries.map(([grade, { total, sends }]) => (
                      <View key={grade} style={ss.gradeRow}>
                        <Text style={[ss.gradeLabel, { color: colors.textPrimary, fontFamily: FONTS.family.semibold }]}>{grade}</Text>
                        <View style={ss.gradeBarWrap}>
                          <View style={[ss.gradeTrack, { backgroundColor: colors.bgElevated }]}>
                            <View style={[ss.gradeFill, { width: `${Math.round((total / maxCount) * 100)}%`, backgroundColor: accentColor + 'AA' }]} />
                            {sends > 0 && (
                              <View style={[ss.gradeSendFill, { width: `${Math.round((sends / maxCount) * 100)}%`, backgroundColor: accentColor }]} />
                            )}
                          </View>
                        </View>
                        <Text style={[ss.gradeCount, { color: colors.textSecondary }]}>{total}</Text>
                        {sends > 0 && (
                          <Text style={[ss.gradeSends, { color: accentColor, fontFamily: FONTS.family.semibold }]}>{sends}✓</Text>
                        )}
                      </View>
                    ))}
                    <View style={ss.gradeLegend}>
                      <View style={ss.legendItem}>
                        <View style={[ss.legendDot, { backgroundColor: accentColor }]} />
                        <Text style={[ss.legendText, { color: colors.textMuted }]}>Sends</Text>
                      </View>
                      <View style={ss.legendItem}>
                        <View style={[ss.legendDot, { backgroundColor: accentColor + 'AA' }]} />
                        <Text style={[ss.legendText, { color: colors.textMuted }]}>Attempts</Text>
                      </View>
                    </View>
                  </ScrollView>
                )}
              </>
            );
          })()}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const ss = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: SPACING.lg },

  divider: { height: 1, marginVertical: SPACING.xl },
  sectionLabel: {
    fontSize: FONTS.sizes.xs, letterSpacing: 1.5,
    fontFamily: FONTS.family.semibold, marginBottom: SPACING.lg,
  },

  // Overview
  overviewRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md },
  overviewItem: { flex: 1, alignItems: 'center' },
  overviewDivider: { width: 1, height: 40 },
  bigNum: { fontSize: 28, letterSpacing: -1 },
  bigLabel: { fontSize: FONTS.sizes.xs, marginTop: 2 },

  // Hardest sends
  hardestRow: { flexDirection: 'row', gap: SPACING.sm },
  hardestSquare: {
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  hardestGrade: { fontSize: FONTS.sizes.lg, letterSpacing: -0.5 },
  hardestSys: { fontSize: 9, textAlign: 'center' },

  // Environment
  envRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md },
  envLabel: { fontSize: FONTS.sizes.sm, minWidth: 56 },
  envTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  envFill: { height: '100%', borderRadius: 3 },
  envPct: { fontSize: FONTS.sizes.xs, width: 28, textAlign: 'right' },
  envSub: { fontSize: FONTS.sizes.xs, marginTop: SPACING.sm },

  // Improvement
  impHeader: { flexDirection: 'row', marginBottom: SPACING.sm },
  impRow: { flexDirection: 'row', marginBottom: SPACING.md },
  impLabel: { fontSize: FONTS.sizes.sm, flex: 1 },
  impColHead: { fontSize: FONTS.sizes.xs, width: 72, textAlign: 'center' },
  impCell: { fontSize: FONTS.sizes.md, width: 72, textAlign: 'center' },
  chartCaption: { fontSize: FONTS.sizes.xs, marginBottom: SPACING.sm },

  // Styles
  styleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  styleName: { fontSize: FONTS.sizes.sm, width: 72 },
  styleTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  styleFill: { height: '100%', borderRadius: 3 },
  styleCount: { fontSize: FONTS.sizes.xs, width: 24, textAlign: 'right' },
  styleHardest: { fontSize: FONTS.sizes.xs, width: 36, textAlign: 'right' },

  // Types
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  typeName: { fontSize: FONTS.sizes.sm, width: 72 },
  typeTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  typeFill: { height: '100%', borderRadius: 3 },
  typeCount: { fontSize: FONTS.sizes.xs, width: 24, textAlign: 'right' },
  typeChevron: { fontSize: FONTS.sizes.lg, width: 16, textAlign: 'right' },

  // Grade breakdown modal
  modalContainer: { flex: 1 },
  modalHeader: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md, alignItems: 'center' },
  modalClose: { alignSelf: 'flex-end' },
  modalCloseText: { fontSize: FONTS.sizes.sm },
  modalTitle: { fontSize: FONTS.sizes.xxl, fontFamily: FONTS.family.bold, marginTop: SPACING.sm },
  modalSubtitle: { fontSize: FONTS.sizes.sm, marginTop: SPACING.xs },
  modalScroll: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  modalSectionLabel: { fontSize: FONTS.sizes.xs, letterSpacing: 1.5, fontFamily: FONTS.family.semibold, marginBottom: SPACING.lg, marginTop: SPACING.md },
  modalEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalEmptyText: { fontSize: FONTS.sizes.md },
  gradeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  gradeLabel: { fontSize: FONTS.sizes.sm, width: 52 },
  gradeBarWrap: { flex: 1 },
  gradeTrack: { height: 8, borderRadius: 4, overflow: 'hidden', position: 'relative' },
  gradeFill: { position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 4 },
  gradeSendFill: { position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 4 },
  gradeCount: { fontSize: FONTS.sizes.xs, width: 20, textAlign: 'right' },
  gradeSends: { fontSize: FONTS.sizes.xs, width: 32, textAlign: 'right' },
  gradeLegend: { flexDirection: 'row', gap: SPACING.lg, marginTop: SPACING.xl },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: FONTS.sizes.xs },

  // Insights
  insightRow: { flexDirection: 'row', marginBottom: SPACING.lg },
  insightDivider: { width: 1, marginHorizontal: SPACING.lg, alignSelf: 'stretch' },
  insightItem: { flex: 1 },
  insightValRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  insightVal: { fontSize: FONTS.sizes.xl },
  insightUnit: { fontSize: FONTS.sizes.xs },
  insightLabel: { fontSize: FONTS.sizes.xs, marginTop: 2 },
  insightSubhead: { fontSize: FONTS.sizes.xs, letterSpacing: 1.2, fontFamily: FONTS.family.semibold, marginBottom: SPACING.md, marginTop: SPACING.xs },
});
