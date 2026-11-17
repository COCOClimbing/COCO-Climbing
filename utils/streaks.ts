// Weekly streaks, Strava-style: a Monday–Sunday week counts when it has at
// least one session with a logged entry (climbs, lift and hangboard all
// count). The streak is the run of counted weeks in a row ending this week.
// The current week can't break it until it's over, so a streak that last
// week kept alive still shows while this week is empty.
//
// Session dates are local `yyyy-MM-dd` strings, so weeks need no timezone math.
// supabase_streaks.sql mirrors this logic for other users' profiles and the
// feed banner; keep the two in step.

import { addWeeks, format, parseISO, startOfWeek } from 'date-fns';

// Monday of the week containing `date`, as `yyyy-MM-dd`
export function weekStartOf(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date.slice(0, 10)) : date;
  return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

// A streak only counts (chip, banner, calendar stripe) once it's 2+ weeks.
// supabase_streaks.sql uses the same threshold for the feed banner.
export const MIN_STREAK_WEEKS = 2;

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

  // Walk back from this week, or from last week while this one is still open
  let current = 0;
  let cursor = parseISO(thisWeekLogged ? thisWeek : weekStartOf(addWeeks(parseISO(thisWeek), -1)));
  while (weeks.has(format(cursor, 'yyyy-MM-dd'))) {
    current++;
    cursor = addWeeks(cursor, -1);
  }

  // Longest: count runs over the sorted week list
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const wk of [...weeks].sort()) {
    run = prev && format(addWeeks(parseISO(prev), 1), 'yyyy-MM-dd') === wk ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = wk;
  }

  return { current, longest, thisWeekLogged, weeks };
}

// Mondays of the counted weeks that belong to a run of 2+ weeks — the weeks
// the Sessions calendar draws a streak band across. A lone week gets none.
export function streakBandWeeks(dates: string[]): Set<string> {
  const weeks = new Set(dates.filter(Boolean).map(d => weekStartOf(d)));
  const shift = (wk: string, n: number) => format(addWeeks(parseISO(wk), n), 'yyyy-MM-dd');
  return new Set([...weeks].filter(wk => weeks.has(shift(wk, -1)) || weeks.has(shift(wk, 1))));
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
  const sorted = [...firstByWeek.keys()].sort();
  let run = 0;
  sorted.forEach((wk, i) => {
    const prev = sorted[i - 1];
    run = prev && format(addWeeks(parseISO(prev), 1), 'yyyy-MM-dd') === wk ? run + 1 : 1;
    // Last week of its run: the next counted week isn't the week after
    const next = sorted[i + 1];
    const runEnds = !next || format(addWeeks(parseISO(wk), 1), 'yyyy-MM-dd') !== next;
    if (runEnds && run >= MIN_STREAK_WEEKS) out[firstByWeek.get(wk)!.id] = run;
  });
  return out;
}
