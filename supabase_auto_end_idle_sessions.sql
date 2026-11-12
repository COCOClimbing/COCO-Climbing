-- ─── Auto-end idle sessions on the server ─────────────────────────────────────
-- Sessions are meant to end 1.5 hours after the last climb. The app only did
-- that on the owner's phone, the next time they opened it — so abandoned
-- sessions stayed open on the server and tagged friends never got their
-- "you were tagged" push. This runs the same rule on the server every
-- 5 minutes: it ends the session at the time of its last climb and sends the
-- tag notifications itself.
--
-- Safe to re-run this whole file.
--
-- PREVIEW (read-only) — what the first run will close, and which of those
-- will send tag notifications. Run this on its own first if you want to look:
--
--   SELECT se.id, se.user_id, se.date, se.friends IS NOT NULL AS tagged,
--          max(c.date::timestamptz) AS last_climb,
--          coalesce(se.friends IS NOT NULL AND max(c.date::timestamptz) > now() - interval '1 day', false) AS will_notify
--     FROM public.sessions se
--     LEFT JOIN public.climbs c ON c.session_id = se.id AND c.deleted_at IS NULL
--    WHERE se.ended_at IS NULL AND se.deleted_at IS NULL
--    GROUP BY se.id
--   HAVING coalesce(max(c.date::timestamptz), se.started_at::text::timestamptz) < now() - interval '90 minutes'
--    ORDER BY last_climb DESC NULLS LAST;
--
-- Requires pg_cron (already used by the soft-delete purge job) and pg_net. If
-- an extension line errors with a permissions issue, enable it from
-- Database → Extensions in the dashboard and re-run.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE INDEX IF NOT EXISTS climbs_session_id_idx ON public.climbs (session_id);
-- Lets each run look at only the open sessions instead of the whole table
CREATE INDEX IF NOT EXISTS sessions_open_idx
  ON public.sessions (id) WHERE ended_at IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_session_tag_idx
  ON public.notifications (session_id, type, recipient_id);


-- ─── Never let a session be reopened ─────────────────────────────────────────
-- The app upserts its local copy of a session, and while the owner's phone
-- still thinks the session is in progress it sends ended_at = null. Without
-- this, that would undo the server ending it (and the job would end it again
-- next run). The app never reopens a session on purpose.

CREATE OR REPLACE FUNCTION public.keep_session_ended()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.ended_at IS NOT NULL AND NEW.ended_at IS NULL THEN
    NEW.ended_at := OLD.ended_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS keep_session_ended ON public.sessions;
CREATE TRIGGER keep_session_ended
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.keep_session_ended();


-- ─── Helpers ─────────────────────────────────────────────────────────────────

-- climbs.date / sessions.started_at are ISO strings written by the app; any
-- that don't parse are ignored rather than failing the whole job.
CREATE OR REPLACE FUNCTION public.try_timestamptz(t text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN t::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;


-- Sends the "you were tagged" notification for one session to every tagged
-- friend who hasn't had one for it yet. The notifications table is the record
-- of who's been told, so this and the send-notification edge function never
-- notify the same person twice. Respects notification_prefs.session_tag.
CREATE OR REPLACE FUNCTION public.send_session_tag_notifications(p_session_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner   uuid;
  v_friends jsonb;
  v_name    text;
  v_ids     uuid[];
  v_tokens  text[];
  v_title   text := 'You were tagged in a session';
  v_body    text;
BEGIN
  SELECT user_id, friends INTO v_owner, v_friends
    FROM sessions WHERE id = p_session_id AND deleted_at IS NULL;
  IF v_owner IS NULL OR v_friends IS NULL OR jsonb_typeof(v_friends) <> 'array' THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(name, 'Someone') INTO v_name FROM profiles WHERE id = v_owner;
  v_body := COALESCE(v_name, 'Someone') || ' tagged you in a climbing session';

  SELECT array_agg(DISTINCT fid) INTO v_ids
    FROM (
      SELECT (f->>'id')::uuid AS fid
        FROM jsonb_array_elements(v_friends) f
       WHERE f->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) t
   WHERE fid <> v_owner
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = fid)
     AND NOT EXISTS (
       SELECT 1 FROM notifications n
        WHERE n.session_id = p_session_id AND n.type = 'session_tag' AND n.recipient_id = fid
     )
     AND COALESCE(
       (SELECT p.notification_prefs->>'session_tag' FROM profiles p WHERE p.id = fid),
       'true'
     ) <> 'false';

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO notifications (recipient_id, sender_id, type, session_id, title, body)
  SELECT rid, v_owner, 'session_tag', p_session_id, v_title, v_body
    FROM unnest(v_ids) AS rid;

  SELECT array_agg(token) INTO v_tokens FROM push_tokens WHERE user_id = ANY (v_ids);

  IF v_tokens IS NOT NULL THEN
    PERFORM net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
      body    := (
        SELECT jsonb_agg(jsonb_build_object(
          'to', tok,
          'title', v_title,
          'body', v_body,
          'sound', 'default',
          'data', jsonb_build_object('sessionId', p_session_id, 'type', 'session_tag')
        ))
        FROM unnest(v_tokens) AS tok
      )
    );
  END IF;

  RETURN array_length(v_ids, 1);
END;
$$;


-- ─── The job ─────────────────────────────────────────────────────────────────
-- Ends every open session whose last climb (or start, if it has no climbs) was
-- more than 1.5 hours ago, setting ended_at to that last-activity time. Tag
-- notifications only go out for sessions with climbs whose last climb was in
-- the past day — so the first run quietly closes old abandoned sessions
-- without sending stale notifications for them.
CREATE OR REPLACE FUNCTION public.end_idle_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s       record;
  v_ended integer := 0;
  v_text  boolean;
BEGIN
  -- ended_at was added outside these SQL files; handle it being text (ISO
  -- string like the app writes) or timestamptz.
  SELECT data_type = 'text' INTO v_text
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'ended_at';

  FOR s IN
    SELECT se.id,
           lc.last_climb,
           COALESCE(lc.last_climb, try_timestamptz(se.started_at::text)) AS last_activity
      FROM sessions se
      LEFT JOIN LATERAL (
        SELECT max(try_timestamptz(c.date)) AS last_climb
          FROM climbs c
         WHERE c.session_id = se.id AND c.deleted_at IS NULL
      ) lc ON true
     WHERE se.ended_at IS NULL
       AND se.deleted_at IS NULL
  LOOP
    CONTINUE WHEN s.last_activity IS NULL
               OR s.last_activity > now() - interval '90 minutes';

    IF v_text THEN
      UPDATE sessions
         SET ended_at = to_char(s.last_activity AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
       WHERE id = s.id AND ended_at IS NULL;
    ELSE
      UPDATE sessions SET ended_at = s.last_activity WHERE id = s.id AND ended_at IS NULL;
    END IF;
    v_ended := v_ended + 1;

    IF s.last_climb IS NOT NULL AND s.last_climb > now() - interval '1 day' THEN
      PERFORM send_session_tag_notifications(s.id);
    END IF;
  END LOOP;

  RETURN v_ended;
END;
$$;

-- These run as the table owner (SECURITY DEFINER), so make sure no app user
-- can call them through the API — only the cron job.
REVOKE ALL ON FUNCTION public.end_idle_sessions()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_session_tag_notifications(text) FROM PUBLIC, anon, authenticated;


-- ─── Schedule ────────────────────────────────────────────────────────────────

SELECT cron.unschedule(jobid)
  FROM cron.job WHERE jobname = 'end-idle-sessions';

SELECT cron.schedule(
  'end-idle-sessions',
  '*/5 * * * *',  -- every 5 minutes
  $$SELECT public.end_idle_sessions();$$
);
