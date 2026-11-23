// Weekly streaks, Strava-style: a Monday–Sunday week counts when it has at
// least one session with a logged entry (climbs, lift and hangboard all
// count). The streak is the run of counted weeks in a row ending this week,
// capped by the time the run actually covers (see `cappedLength`).
// The current week can't break it until it's over, so a streak that last
// week kept alive still shows while this week is empty.
//
// Session dates are local `yyyy-MM-dd` strings, so weeks need no timezone math.
// supabase_streaks.sql mirrors this logic for other users' profiles and the
// feed banner; keep the two in step.

import { addWeeks, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';

// Monday of the week containing `date`, as `yyyy-MM-dd`
export function weekStartOf(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date.slice(0, 10)) : date;
  return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

// A streak only counts (chip, banner, calendar stripe) once it's 2+ weeks.
// supabase_streaks.sql uses the same threshold for the feed banner.
export const MIN_STREAK_WEEKS = 2;

// A run's length is the smaller of its weeks in a row and the weeks its
// sessions span: floor(days from first to last session / 7) + 1. Without the
// cap, a Saturday and the next Monday (two days apart, either side of a
// Sunday) read as a "2 week streak". With it, streaks still count up one week
// at a time, and someone climbing about weekly sees the same numbers as before.
export function cappedLength(weeksInRow: number, firstDate: string, lastDate: string): number {
  const days = differenceInCalendarDays(parseISO(lastDate.slice(0, 10)), parseISO(firstDate.slice(0, 10)));
  return Math.min(weeksInRow, Math.floor(days / 7) + 1);
}

type Run = { weeks: string[]; first: string; last: string; length: number };

// Group session dates into runs of consecutive weeks, oldest first, each with
// its capped length.
function streakRuns(dates: string[]): Run[] {
  const byWeek = new Map<string, { first: string; last: string }>();
  for (const raw of dates.filter(Boolean)) {
    const d = raw.slice(0, 10);
    const wk = weekStartOf(d);
    const cur = byWeek.get(wk);
    if (!cur) byWeek.set(wk, { first: d, last: d });
    else { if (d < cur.first) cur.first = d; if (d > cur.last) cur.last = d; }
  }
  const runs: Run[] = [];
  let prev: string | null = null;
  for (const wk of [...byWeek.keys()].sort()) {
    const { first, last } = byWeek.get(wk)!;
    const continues = prev && format(addWeeks(parseISO(prev), 1), 'yyyy-MM-dd') === wk;
    if (continues) {
      const r = runs[runs.length - 1];
      r.weeks.push(wk);
      r.last = last;
    } else {
      runs.push({ weeks: [wk], first, last, length: 0 });
    }
    prev = wk;
  }
  runs.forEach(r => { r.length = cappedLength(r.weeks.length, r.first, r.last); });
  return runs;
}

export type StreakInfo = {
  current: number;           // weeks in a row, ending this week (or last week if this one is empty)
  longest: number;           // longest run ever
  thisWeekLogged: boolean;   // the current week already counts
  weeks: Set<string>;        // Monday of every counted week
};

// `dates`: the date of every session that has at least one entry
export function computeStreak(dates: string[], today: Date = new Date()): StreakInfo {
  const weeks = new Set(dates.filter(Boolean).map(d => weekStartOf(d)));
  const thisWeek = weekStartOf(today);
  const thisWeekLogged = weeks.has(thisWeek);

  // Current: the run that ends this week, or last week while this one is still open
  const anchor = thisWeekLogged ? thisWeek : weekStartOf(addWeeks(parseISO(thisWeek), -1));
  const runs = streakRuns(dates);
  const current = runs.find(r => r.weeks[r.weeks.length - 1] === anchor)?.length ?? 0;
  const longest = runs.reduce((m, r) => Math.max(m, r.length), 0);

  return { current, longest, thisWeekLogged, weeks };
}

// Mondays of the counted weeks that belong to a streak (capped length 2+) —
// the weeks the Sessions calendar draws a streak band across.
export function streakBandWeeks(dates: string[]): Set<string> {
  return new Set(streakRuns(dates).filter(r => r.length >= MIN_STREAK_WEEKS).flatMap(r => r.weeks));
}

// Dates of the local sessions that have at least one entry
export function activeSessionDates(
  sessions: { id: string; date: string }[],
  climbs: { sessionId?: string | null }[],
): string[] {
  const withEntries = new Set(climbs.map(c => c.sessionId).filter(Boolean));
  return sessions.filter(s => withEntries.has(s.id)).map(s => s.date.slice(0, 10));
}

// Feed banner data for your own sessions, matching session_streaks() in
// supabase_streaks.sql. One banner per streak (run of MIN_STREAK_WEEKS+
// weeks), on the first session of the streak's last week, with the length it
// reached — so weekly climbing shows one banner that moves forward, not
// 4, 5, 6… down the feed, and an ended streak keeps its final banner.
// `sessions` must all have entries.
export function sessionStreakMap(
  sessions: { id: string; date: string; startedAt?: string | null }[],
): Record<string, number> {
  const firstByWeek = new Map<string, { id: string; key: string }>();
  for (const s of sessions) {
    const wk = weekStartOf(s.date);
    const key = `${s.date.slice(0, 10)}|${s.startedAt || '￿'}|${s.id}`;
    const cur = firstByWeek.get(wk);
    if (!cur || key < cur.key) firstByWeek.set(wk, { id: s.id, key });
  }
  const out: Record<string, number> = {};
  for (const run of streakRuns(sessions.map(s => s.date))) {
    if (run.length < MIN_STREAK_WEEKS) continue;
    out[firstByWeek.get(run.weeks[run.weeks.length - 1])!.id] = run.length;
  }
  return out;
}
