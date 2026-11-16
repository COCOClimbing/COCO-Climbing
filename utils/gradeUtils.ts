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

// Charts split by discipline rather than grading system: V + Font is
// bouldering (board climbs included), YDS + French + British is rope (top
// rope, sport, trad, auto belay). Scores share a scale within a discipline.
export type Discipline = 'boulder' | 'rope';

export function gradeDiscipline(system?: string | null): Discipline | null {
  if (system === 'v-scale' || system === 'font') return 'boulder';
  if (system === 'yds' || system === 'french' || system === 'british') return 'rope';
  return null;
}

// Which discipline a chart opens on: whichever has more climbs, among the
// ones that have anything to plot. Boulder wins a tie.
export function defaultDiscipline(
  counts: Record<Discipline, number>,
  available: Discipline[],
): Discipline {
  if (available.length === 1) return available[0];
  return counts.rope > counts.boulder ? 'rope' : 'boulder';
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
