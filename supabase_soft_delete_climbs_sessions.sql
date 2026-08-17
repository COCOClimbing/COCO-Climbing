-- ─── Soft-delete climbs & sessions ────────────────────────────────────────────
-- Defense-in-depth after the reinstall/new-device data-loss bug (fixed
-- client-side in cleanupOrphanedCloudRecords, see utils/cloudSync.ts). Hard
-- deletes from the client are now impossible at the RLS layer — deletes
-- become an UPDATE that sets deleted_at, rows are hidden from all normal
-- reads (own + friends) via RLS, and a scheduled job purges anything older
-- than 30 days. Any future bug that deletes rows it shouldn't now has a
-- 30-day recovery window instead of being instantly unrecoverable.

ALTER TABLE public.climbs   ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS climbs_deleted_at_idx
  ON public.climbs (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS sessions_deleted_at_idx
  ON public.sessions (deleted_at) WHERE deleted_at IS NOT NULL;


-- ─── Sessions policies: replace the old FOR ALL "manage own" + separate ──────
-- "friends can view" with one SELECT policy (own or friend, non-deleted),
-- explicit INSERT/UPDATE for the owner, and NO delete policy at all — the
-- client can no longer hard-delete a session row under any circumstances.

DROP POLICY IF EXISTS "Users can manage own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Friends can view sessions"      ON public.sessions;
DROP POLICY IF EXISTS "Users can view own or friends' non-deleted sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users can insert own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.sessions;

CREATE POLICY "Users can view own or friends' non-deleted sessions"
  ON public.sessions FOR SELECT
  USING (
    deleted_at IS NULL AND (
      auth.uid() = user_id OR
      EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'accepted'
          AND ((f.sender_id = auth.uid() AND f.receiver_id = user_id)
            OR (f.receiver_id = auth.uid() AND f.sender_id = user_id))
      )
    )
  );

CREATE POLICY "Users can insert own sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON public.sessions FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ─── Climbs policies: same shape as sessions above ────────────────────────────

DROP POLICY IF EXISTS "Users can manage own climbs" ON public.climbs;
DROP POLICY IF EXISTS "Friends can view climbs"      ON public.climbs;
DROP POLICY IF EXISTS "Users can view own or friends' non-deleted climbs" ON public.climbs;
DROP POLICY IF EXISTS "Users can insert own climbs" ON public.climbs;
DROP POLICY IF EXISTS "Users can update own climbs" ON public.climbs;

CREATE POLICY "Users can view own or friends' non-deleted climbs"
  ON public.climbs FOR SELECT
  USING (
    deleted_at IS NULL AND (
      auth.uid() = user_id OR
      EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'accepted'
          AND ((f.sender_id = auth.uid() AND f.receiver_id = user_id)
            OR (f.receiver_id = auth.uid() AND f.sender_id = user_id))
      )
    )
  );

CREATE POLICY "Users can insert own climbs"
  ON public.climbs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own climbs"
  ON public.climbs FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ─── Scheduled purge (30-day trash window) ────────────────────────────────────
-- Runs as SECURITY DEFINER (bypasses RLS — this is the one place hard
-- deletes still happen). If a row never gets purged because the free-tier
-- project was paused when the job would've fired, the failure mode is
-- "keeps the row a bit longer," never data loss.

CREATE OR REPLACE FUNCTION public.purge_soft_deleted_records()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.climbs   WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days';
  DELETE FROM public.sessions WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days';
$$;

-- Requires the pg_cron extension. If this errors with a permissions issue,
-- enable "pg_cron" from Database → Extensions in the dashboard, then re-run
-- just the block below.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotent: safe to re-run this whole file without creating a duplicate job.
SELECT cron.unschedule(jobid)
  FROM cron.job WHERE jobname = 'purge-soft-deleted-climbs-sessions';

SELECT cron.schedule(
  'purge-soft-deleted-climbs-sessions',
  '0 3 * * *',  -- daily at 03:00 UTC
  $$SELECT public.purge_soft_deleted_records();$$
);
