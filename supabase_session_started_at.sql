-- ─── Session start times ─────────────────────────────────────────────────────
-- The app never uploaded a session's start time, so sessions.started_at was
-- empty on the server and friends' feeds showed the time of the LAST climb
-- instead of when the session started. The app now uploads it; this fills in
-- every existing session from its first climb, and stops an empty value from
-- the app wiping it out later (older sessions have no start time stored on
-- the phone, so the app sends null for them).
--
-- Safe to re-run this whole file.


-- ─── Keep start times once set ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.keep_session_started_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.started_at IS NOT NULL AND NEW.started_at IS NULL THEN
    NEW.started_at := OLD.started_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS keep_session_started_at ON public.sessions;
CREATE TRIGGER keep_session_started_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.keep_session_started_at();


-- ─── Backfill from each session's first climb ────────────────────────────────
-- started_at was added outside these SQL files, so handle it being text (an
-- ISO string like the app writes) or timestamptz. Climb dates that don't parse
-- are skipped (try_timestamptz comes from supabase_auto_end_idle_sessions.sql).

DO $$
DECLARE
  v_text  boolean;
  v_count integer;
BEGIN
  SELECT data_type = 'text' INTO v_text
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'started_at';

  IF v_text THEN
    UPDATE public.sessions se
       SET started_at = to_char(fc.first_climb AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      FROM (
        SELECT session_id, min(public.try_timestamptz(date)) AS first_climb
          FROM public.climbs
         WHERE session_id IS NOT NULL
         GROUP BY session_id
      ) fc
     WHERE fc.session_id = se.id
       AND fc.first_climb IS NOT NULL
       AND se.started_at IS NULL;
  ELSE
    UPDATE public.sessions se
       SET started_at = fc.first_climb
      FROM (
        SELECT session_id, min(public.try_timestamptz(date)) AS first_climb
          FROM public.climbs
         WHERE session_id IS NOT NULL
         GROUP BY session_id
      ) fc
     WHERE fc.session_id = se.id
       AND fc.first_climb IS NOT NULL
       AND se.started_at IS NULL;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Filled in started_at for % sessions', v_count;
END;
$$;
