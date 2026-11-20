import { Climb, CLIMB_TYPES } from '../../utils/theme';
import { gradeToNum, isCustomGrade, CHART_STYLES, Discipline } from '../../utils/gradeUtils';
import { isTrainingClimb } from '../../utils/sessionHelpers';
import type { ShareData } from '../ShareModal';

// Everything a share card can show, worked out once from either a full climb
// list (your own sessions) or the summary counts a friend's feed entry carries.
export interface ShareStats {
  typeLabel: string;           // "Boulder", "Top Rope", "Boulder + TR"…
  disciplines: Discipline[];   // which icons to draw: chalk bag (boulder) and/or carabiner (rope)
  climbs: number;
  sends: number;
  flashes: number;
  attempts: number | null;     // null when we only have summary counts (friend entries)
  sendRate: number | null;     // whole percent; null when there are no climbs
  hardest: string | null;      // "V7" or "V7 / 5.12a"; null when nothing was sent (cards skip it)
  location?: string;
}

function disciplineOf(type?: string | null): Discipline | null {
  return CHART_STYLES.find(s => s.id === type)?.discipline ?? null;
}

function typeLabel(id?: string | null): string | null {
  return id ? (CLIMB_TYPES.find(t => t.id === id)?.label ?? id) : null;
}

// The type with the most climbs; ties go to whichever was logged first.
function topType(climbs: Climb[]): string | undefined {
  const counts: Record<string, number> = {};
  climbs.forEach(c => { counts[c.type] = (counts[c.type] ?? 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
}

// Short names for the combined boulder + rope title.
const SHORT_LABEL: Record<string, string> = {
  boulder: 'Boulder',
  board: 'Board',
  top_rope: 'TR',
  sport: 'Sport',
  trad: 'Trad',
  auto_belay: 'Auto',
};

// A rope session that mixes rope types (e.g. Sport + TR + Auto) just says
// "Ropes"; one rope type keeps its own name.
function sideLabel(d: Discipline, climbs: Climb[], short: boolean): string {
  if (d === 'rope' && new Set(climbs.map(c => c.type)).size > 1) return 'Ropes';
  // Boulder and Board together: spelled out alone, but just "Boulder" in a
  // boulder + rope title so it stays short ("Boulder + Ropes").
  if (d === 'boulder' && new Set(climbs.map(c => c.type)).size > 1) return short ? 'Boulder' : 'Boulder + Board';
  const top = topType(climbs);
  return (short ? (top && SHORT_LABEL[top]) : typeLabel(top)) ?? 'Climbing';
}

function hardestSend(climbs: Climb[]): string | null {
  return [...climbs]
    .filter(c => (c.outcome === 'send' || c.outcome === 'flash') && !isCustomGrade(c.gradeSystem))
    .sort((a, b) => gradeToNum(b.grade, b.gradeSystem) - gradeToNum(a.grade, a.gradeSystem))[0]?.grade ?? null;
}

export function computeShareStats(data: ShareData): ShareStats {
  if (!data.climbs) {
    const climbs = data.climbCount ?? 0;
    const sends = data.sendCount ?? 0;
    const d = disciplineOf(data.climbType);
    return {
      typeLabel: typeLabel(data.climbType) ?? 'Climbing',
      disciplines: d ? [d] : [],
      climbs,
      sends,
      flashes: data.flashCount ?? 0,
      attempts: null,
      sendRate: climbs > 0 ? Math.round((sends / climbs) * 100) : null,
      hardest: data.hardestGrade || null,
      location: data.location,
    };
  }

  const graded = data.climbs.filter(c => !isTrainingClimb(c));
  const sends = graded.filter(c => c.outcome === 'send' || c.outcome === 'flash').length;
  const flashes = graded.filter(c => c.outcome === 'flash').length;
  const attempts = graded.reduce((sum, c) => sum + (c.outcome === 'flash' ? 1 : (c.attempts || 1)), 0);

  // Group by discipline so a boulder + rope session gets a two-part title and a
  // hardest grade for each, rather than comparing V grades against YDS.
  const byDiscipline: Partial<Record<Discipline, Climb[]>> = {};
  graded.forEach(c => {
    const d = disciplineOf(c.type);
    if (d) (byDiscipline[d] ??= []).push(c);
  });
  const disciplines = (['boulder', 'rope'] as Discipline[]).filter(d => byDiscipline[d]?.length);

  let label: string;
  if (disciplines.length > 1) {
    // Name the main type on each side, short so the title stays compact:
    // "Boulder + TR", "Board + Sport". (Not "Mixed": mixed climbing is its
    // own discipline, rock + ice.)
    label = disciplines.map(d => sideLabel(d, byDiscipline[d]!, true)).join(' + ');
  } else {
    // One discipline: full type name ("Top Rope", "Auto Belay"), or "Ropes".
    label = disciplines.length ? sideLabel(disciplines[0], byDiscipline[disciplines[0]]!, false) : 'Climbing';
  }

  const hardestParts = disciplines.map(d => hardestSend(byDiscipline[d]!)).filter(Boolean) as string[];

  return {
    typeLabel: label,
    disciplines,
    climbs: graded.length,
    sends,
    flashes,
    attempts,
    sendRate: graded.length > 0 ? Math.round((sends / graded.length) * 100) : null,
    hardest: hardestParts.length ? hardestParts.join(' / ') : null,
    location: data.location,
  };
}
