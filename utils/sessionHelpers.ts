import { Climb } from './theme';
import { gradeToNum, isCustomGrade } from './gradeUtils';
import { getTodayISO } from './storage';
import { format, parseISO } from 'date-fns';

export interface DaySession {
  date: string;
  sessionId: string;
  climbs: Climb[];
  startedAt: string;
  lastClimbAt?: string;
  title?: string;
  notes?: string;
  friends?: { id: string; name: string }[];
  location?: string;
  mediaUris?: string[];
  mediaTypes?: ('photo' | 'video')[];
}

// Hangboard and lift entries are training, not climbs — they never count towards climb totals.
export function isTrainingClimb(c: Pick<Climb, 'type'>): boolean {
  return c.type === 'hangboard' || c.type === 'lift';
}

export type TrainingKind = 'lift' | 'hangboard' | 'both';

// For a session made up only of hangboard/lift entries, which kind(s) it holds; null if it has any climbs.
export function trainingKind(climbs: Pick<Climb, 'type'>[]): TrainingKind | null {
  if (climbs.length === 0 || !climbs.every(isTrainingClimb)) return null;
  const hasLift = climbs.some(c => c.type === 'lift');
  const hasHang = climbs.some(c => c.type === 'hangboard');
  return hasLift && hasHang ? 'both' : hasLift ? 'lift' : 'hangboard';
}

export const TRAINING_KIND_LABEL: Record<TrainingKind, string> = { lift: 'Lift', hangboard: 'Hangboard', both: 'Lift + Hang' };

export function climbCount(c: Climb): number {
  if (isTrainingClimb(c)) return 0;
  if (c.outcome === 'flash' || c.outcome === 'hang') return 1;
  return c.attempts ?? 1;
}

export function sessionStats(day: DaySession) {
  const gradedClimbs = day.climbs.filter(c => c.type !== 'hangboard' && c.type !== 'lift');
  const sends = gradedClimbs.filter(c => c.outcome === 'send' || c.outcome === 'flash').length;
  const hardest = [...gradedClimbs]
    .filter(c => (c.outcome === 'send' || c.outcome === 'flash') && !isCustomGrade(c.gradeSystem))
    .sort((a, b) => gradeToNum(b.grade, b.gradeSystem) - gradeToNum(a.grade, a.gradeSystem))[0];
  const projecting = sends === 0 && gradedClimbs.length > 0 && gradedClimbs.every(c => c.projectId);
  const gradedCount = day.climbs.reduce((sum, c) => sum + climbCount(c), 0);
  const training = trainingKind(day.climbs);
  return { sends, hardest, projecting, gradedCount, training };
}

export function mergeClimbs(climbs: Climb[]): Climb[] {
  const groups: Record<string, { total: number; notes: string[]; rep: Climb }> = {};
  const result: Climb[] = [];
  climbs.forEach(c => {
    const key = c.projectId && c.outcome === 'attempt' ? c.projectId : null;
    if (key) {
      if (!groups[key]) { groups[key] = { total: 0, notes: [], rep: c }; result.push(c); }
      groups[key].total += c.attempts ?? 0;
      if (c.notes?.trim()) groups[key].notes.push(c.notes.trim());
    } else {
      result.push(c);
    }
  });
  return result.map(c => {
    const key = c.projectId && c.outcome === 'attempt' ? c.projectId : null;
    if (key && groups[key]) {
      const g = groups[key];
      return { ...g.rep, attempts: g.total, notes: g.notes.length > 1 ? g.notes.map(n => `• ${n}`).join('\n') : g.notes[0] };
    }
    return c;
  });
}

export function sessionTimeOfDay(day: DaySession): string {
  const isoTime = day.startedAt || day.lastClimbAt || day.climbs[0]?.date;
  if (!isoTime) return 'Climbing Session';
  const d = new Date(isoTime);
  if (isNaN(d.getTime())) return 'Climbing Session';
  const hour = d.getHours();
  if (hour < 12) return 'Morning Climb';
  if (hour < 17) return 'Afternoon Climb';
  return 'Evening Climb';
}

export function formatSessionLabel(s: DaySession): { top: string; bottom: string } {
  const todayISO = getTodayISO();
  const hasRealTime = !!s.startedAt && s.startedAt.length > 0 && !s.startedAt.endsWith('T00:00:00.000Z');

  if (s.date === todayISO) {
    const timeStr = hasRealTime ? format(new Date(s.startedAt), 'h:mm a') : null;
    return { top: 'TODAY', bottom: timeStr ?? format(new Date(), 'MMM d, yyyy') };
  }
  const date = parseISO(s.date);
  return {
    top: format(date, 'EEE').toUpperCase(),
    bottom: format(date, 'MMM d, yyyy'),
  };
}
