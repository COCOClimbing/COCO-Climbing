import { convertGrade, GRADE_DIFFICULTY } from './theme';

export function vGradeToNum(grade: string): number {
  if (grade === 'VB') return -1;
  return parseFloat(grade.replace('V', '').replace('+', '.5')) || 0;
}

export function ydsGradeToNum(grade: string): number {
  const parts = grade.split('.');
  const main = parseInt(parts[1]) || 0;
  const sub = ['a', 'b', 'c', 'd'].indexOf(parts[2] || '');
  return main * 10 + (sub >= 0 ? sub : 0);
}

// Boulder grades are scored on the V scale and rope grades on YDS. Font,
// French and British are converted first — before, they all scored 0, so
// those climbers' charts were flat lines and their "hardest" picks random.
export function gradeToNum(grade: string, system: string): number {
  if (system === 'v-scale') return vGradeToNum(grade);
  if (system === 'yds') return ydsGradeToNum(grade);
  if (system === 'font') return vGradeToNum(convertGrade(grade, 'font', 'v-scale'));
  if (system === 'french' || system === 'british') return ydsGradeToNum(convertGrade(grade, system, 'yds'));
  return 0;
}

// ─── Chart scores ────────────────────────────────────────────────────────────
// Charts average a grade's difficulty from GRADE_DIFFICULTY, which puts every
// system on one scale per family (V + Font for bouldering, YDS + French +
// British for rope). Averaging there and labelling back in the climber's own
// system avoids converting twice — a French 6a used to come back as "5c".

// Difficulty score, or -1 for grades that can't be ranked (custom/unknown)
export function gradeScore(grade: string, system: string): number {
  return GRADE_DIFFICULTY[system]?.[grade] ?? -1;
}

// Axis label for a score, as the nearest grade in the climber's system.
// V-scale keeps its "V4+" in-between labels.
export function scoreToGradeLabel(score: number, system: string): string {
  if (system === 'v-scale') {
    if (score < 10) return 'VB';
    const n = score / 10 - 1;
    const whole = Math.floor(n);
    return n % 1 >= 0.4 ? `V${whole}+` : `V${whole}`;
  }
  const table = GRADE_DIFFICULTY[system];
  if (!table) return String(Math.round(score));
  let best = '';
  let bestDiff = Infinity;
  for (const [g, d] of Object.entries(table)) {
    const diff = Math.abs(d - score);
    if (diff < bestDiff) { bestDiff = diff; best = g; }
  }
  return best;
}

// The system to label a chart in for whoever's viewing it: their preferred
// boulder system for boulder grades, their preferred rope system for rope
// grades. Scores share a scale within each family, so any system in the
// family can label them.
export function viewerLabelSystem(gradeSystem: string, prefs: { boulder: string; rope: string }): string {
  if (gradeSystem === 'v-scale' || gradeSystem === 'font') return prefs.boulder;
  if (gradeSystem === 'yds' || gradeSystem === 'french' || gradeSystem === 'british') return prefs.rope;
  return gradeSystem;
}

// Disciplines group grading systems: V + Font is bouldering (board climbs
// too), YDS + French + British is rope. Scores share a scale within one.
export type Discipline = 'boulder' | 'rope';

export function gradeDiscipline(system?: string | null): Discipline | null {
  if (system === 'v-scale' || system === 'font') return 'boulder';
  if (system === 'yds' || system === 'french' || system === 'british') return 'rope';
  return null;
}

// The grade chart's dropdown: one line per climb type. Each type scores on
// its discipline's scale (board shares V grades with boulder; the rope types
// share YDS/French/British), and a climb only counts toward its type when its
// grade is on that scale.
export const CHART_STYLES = [
  { id: 'boulder',    label: 'Boulder',    discipline: 'boulder' },
  { id: 'board',      label: 'Board',      discipline: 'boulder' },
  { id: 'top_rope',   label: 'Top Rope',   discipline: 'rope' },
  { id: 'sport',      label: 'Sport',      discipline: 'rope' },
  { id: 'trad',       label: 'Trad',       discipline: 'rope' },
  { id: 'auto_belay', label: 'Auto Belay', discipline: 'rope' },
] as const satisfies readonly { id: string; label: string; discipline: Discipline }[];
export type ChartStyle = typeof CHART_STYLES[number]['id'];
export type ChartStyleSeries<P> = Partial<Record<ChartStyle, P[]>>;

// A line needs two sessions, so a type joins the dropdown once it has two.
export const MIN_CHART_SESSIONS = 2;

export function chartStyleOf(type?: string | null, system?: string | null): ChartStyle | null {
  const style = CHART_STYLES.find(s => s.id === type);
  return style && gradeDiscipline(system) === style.discipline ? style.id : null;
}

export function chartStyleDiscipline(style: ChartStyle): Discipline {
  return CHART_STYLES.find(s => s.id === style)!.discipline;
}

// Types with enough sessions to draw, in dropdown order.
export function chartStylesWithData<P>(series: ChartStyleSeries<P>): ChartStyle[] {
  return CHART_STYLES.filter(s => (series[s.id]?.length ?? 0) >= MIN_CHART_SESSIONS).map(s => s.id);
}

// Which type the chart opens on: the one with the most sends among those
// with enough data. Ties go to the earlier type in the list.
export function defaultChartStyle(
  counts: Partial<Record<ChartStyle, number>>,
  available: ChartStyle[],
): ChartStyle {
  return available.reduce((best, s) => ((counts[s] ?? 0) > (counts[best] ?? 0) ? s : best), available[0]);
}

// Sends per chart type, for picking the default.
export function chartStyleCounts(sends: { type?: string | null; system?: string | null }[]) {
  const counts: Partial<Record<ChartStyle, number>> = {};
  sends.forEach(c => {
    const st = chartStyleOf(c.type, c.system);
    if (st) counts[st] = (counts[st] ?? 0) + 1;
  });
  return counts;
}

// A session's chart point: the average of its 3 hardest scores, so warm-ups
// and easy volume don't drag a hard day down. Sessions with fewer than 3
// average what they have. Returns -1 for an empty list.
export const TOP_SENDS_PER_SESSION = 3;
export function topScoresAverage(scores: number[], n = TOP_SENDS_PER_SESSION): number {
  if (scores.length === 0) return -1;
  const top = [...scores].sort((a, b) => b - a).slice(0, n);
  return top.reduce((sum, v) => sum + v, 0) / top.length;
}

// Custom (gym-specific) grades are free text and can't be ranked, so they're
// left out of every "hardest"/average calculation. They still count as climbs.
export function isCustomGrade(system?: string | null): boolean {
  return system === 'custom';
}
