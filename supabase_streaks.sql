-- ─── Weekly streaks (2026-11-16) ─────────────────────────────────────────────
--
-- Server side of utils/streaks.ts; keep the two in step.
-- A Monday–Sunday week counts when it has at least one session (not deleted)
-- with at least one logged entry (climbs, lift and hangboard all count).
-- The streak is the run of counted weeks in a row.
--
-- Both functions are SECURITY INVOKER, so sessions/climbs RLS still applies:
-- a viewer only gets streaks for people whose sessions they can already see.
-- No new columns or triggers. Safe to re-run.

-- Weeks with a counted session, one row per session, with the session's week.
-- sessions.date is a local 'yyyy-MM-dd' text (sometimes with a time after it).
CREATE OR REPLACE VIEW public.streak_sessions
WITH (security_invoker = true) AS
SELECT
  s.id,
  s.user_id,
  s.date,
  s.started_at,
  date_trunc('week', left(s.date, 10)::date)::date AS wk
FROM public.sessions s
WHERE s.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.climbs c
    WHERE c.session_id = s.id AND c.deleted_at IS NULL
  );

-- ─── get_week_streak ─────────────────────────────────────────────────────────
-- One user's current streak. p_today is the viewer's local date, so "this
-- week" matches the phone. The current week can't break the streak until it's
-- over: if it has no session yet, counting starts from last week.
CREATE OR REPLACE FUNCTION public.get_week_streak(target_user_id uuid, p_today date)
RETURNS int
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH weeks AS (
    SELECT DISTINCT wk FROM public.streak_sessions WHERE user_id = target_user_id
  ),
  anchor AS (
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM weeks WHERE wk = date_trunc('week', p_today)::date)
        THEN date_trunc('week', p_today)::date
      ELSE date_trunc('week', p_today)::date - 7
    END AS wk
  ),
  -- Gaps and islands: weeks in a row share the same (wk - n*7)
  numbered AS (
    SELECT wk, wk - (row_number() OVER (ORDER BY wk))::int * 7 AS grp FROM weeks
  )
  SELECT COALESCE((
    SELECT count(*)::int FROM numbered
    WHERE grp = (SELECT n.grp FROM numbered n, anchor a WHERE n.wk = a.wk)
      AND wk <= (SELECT wk FROM anchor)
  ), 0);
$$;

-- ─── session_streaks ─────────────────────────────────────────────────────────
-- For the feed banner. One banner per streak (run of 2+ weeks): of the given
-- sessions, returns the ones that were the first counted session of a
-- streak's last week, with the length the streak reached. A current streak's
-- banner sits on its newest week and moves forward as it grows; an ended
-- streak keeps its final one.
-- 2026-11-17: was one banner on every week of a streak (2, 3, 4…).
CREATE OR REPLACE FUNCTION public.session_streaks(p_session_ids text[])
RETURNS TABLE (session_id text, streak_weeks int)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH owners AS (
    SELECT DISTINCT user_id FROM public.sessions WHERE id = ANY (p_session_ids)
  ),
  owned AS (
    SELECT ss.* FROM public.streak_sessions ss JOIN owners o USING (user_id)
  ),
  weeks AS (
    SELECT DISTINCT user_id, wk FROM owned
  ),
  numbered AS (
    SELECT user_id, wk,
           wk - (row_number() OVER (PARTITION BY user_id ORDER BY wk))::int * 7 AS grp
    FROM weeks
  ),
  ranked AS (
    SELECT user_id, wk,
           row_number() OVER (PARTITION BY user_id, grp ORDER BY wk)::int AS streak
    FROM numbered
  ),
  firsts AS (
    SELECT DISTINCT ON (user_id, wk) user_id, wk, id
    FROM owned
    ORDER BY user_id, wk, left(date, 10), started_at NULLS LAST, id
  ),
  -- Last week of each run, with the run's length
  run_ends AS (
    SELECT user_id, max(wk) AS wk, max(streak) AS streak
    FROM ranked r JOIN numbered n USING (user_id, wk)
    GROUP BY user_id, n.grp
  )
  SELECT f.id, e.streak
  FROM firsts f
  JOIN run_ends e USING (user_id, wk)
  WHERE f.id = ANY (p_session_ids)
    AND e.streak >= 2;
$$;

GRANT SELECT ON public.streak_sessions TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_week_streak(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.session_streaks(text[]) TO authenticated;
