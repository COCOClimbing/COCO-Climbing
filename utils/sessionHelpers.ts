import { Climb } from './theme';
import { gradeToNum } from './gradeUtils';
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

export function climbCount(c: Climb): number {
  if (c.type === 'hangboard' || c.type === 'lift') return 0;
  if (c.outcome === 'flash' || c.outcome === 'hang') return 1;
  return c.attempts ?? 1;
}

export function sessionStats(day: DaySession) {
  const gradedClimbs = day.climbs.filter(c => c.type !== 'hangboard' && c.type !== 'lift');
  const sends = gradedClimbs.filter(c => c.outcome === 'send' || c.outcome === 'flash').length;
  const hardest = [...gradedClimbs]
    .filter(c => c.outcome === 'send' || c.outcome === 'flash')
    .sort((a, b) => gradeToNum(b.grade, b.gradeSystem) - gradeToNum(a.grade, a.gradeSystem))[0];
  const projecting = sends === 0 && gradedClimbs.length > 0 && gradedClimbs.every(c => c.projectId);
  const gradedCount = day.climbs.reduce((sum, c) => sum + climbCount(c), 0);
  return { sends, hardest, projecting, gradedCount };
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
