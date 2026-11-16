-- ─── Report comment snapshot (2026-11-16) ────────────────────────────────────
--
-- Comments are hard-deleted, and a report only stored the comment's id, so a
-- reported comment deleted afterwards left admins with nothing to review.
-- Now, when a comment report is filed, the database copies the comment's
-- text, author and time into the report. The copy is taken server-side by a
-- trigger, so a reporter can't supply fake text, and reported_user_id is
-- forced to the comment's real author.
-- Run after supabase_admin_reports.sql. Safe to re-run.

ALTER TABLE public.content_reports ADD COLUMN IF NOT EXISTS snapshot_text       text;
ALTER TABLE public.content_reports ADD COLUMN IF NOT EXISTS snapshot_author_id  uuid;
ALTER TABLE public.content_reports ADD COLUMN IF NOT EXISTS snapshot_created_at timestamptz;

CREATE OR REPLACE FUNCTION public.snapshot_reported_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
BEGIN
  IF NEW.content_type = 'comment' THEN
    SELECT text, user_id, created_at INTO c
    FROM public.session_comments
    WHERE id::text = NEW.content_id;
    IF FOUND THEN
      NEW.snapshot_text       := c.text;
      NEW.snapshot_author_id  := c.user_id;
      NEW.snapshot_created_at := c.created_at;
      NEW.reported_user_id    := c.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_reported_comment ON public.content_reports;
CREATE TRIGGER snapshot_reported_comment
  BEFORE INSERT ON public.content_reports
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_reported_comment();

-- Backfill reports filed before this, where the comment still exists.
UPDATE public.content_reports r
SET snapshot_text = c.text, snapshot_author_id = c.user_id, snapshot_created_at = c.created_at
FROM public.session_comments c
WHERE r.content_type = 'comment' AND r.snapshot_text IS NULL AND c.id::text = r.content_id;

-- admin_reports, now also returning the saved copy as 'comment_snapshot'.
CREATE OR REPLACE FUNCTION public.admin_reports(
  p_include_resolved boolean     DEFAULT false,
  p_before           timestamptz DEFAULT NULL,
  p_limit            int         DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(t.item ORDER BY t.created_at DESC)
    FROM (
      SELECT r.created_at, jsonb_build_object(
        'id', r.id,
        'content_type', r.content_type,
        'content_id', r.content_id,
        'reason', r.reason,
        'created_at', r.created_at,
        'resolved_at', r.resolved_at,
        'reporter', (SELECT jsonb_build_object('id', p.id, 'name', p.name, 'username', p.username, 'avatar_url', p.avatar_url)
                     FROM public.profiles p WHERE p.id = r.reporter_id),
        'reported', (SELECT jsonb_build_object('id', p.id, 'name', p.name, 'username', p.username, 'avatar_url', p.avatar_url)
                     FROM public.profiles p WHERE p.id = r.reported_user_id),
        'session', CASE WHEN r.content_type = 'session' THEN (
          SELECT jsonb_build_object('id', s.id, 'title', s.title, 'notes', s.notes, 'date', s.date,
                                    'deleted', s.deleted_at IS NOT NULL)
          FROM public.sessions s WHERE s.id = r.content_id
        ) END,
        'comment', CASE WHEN r.content_type = 'comment' THEN (
          SELECT jsonb_build_object('id', c.id, 'text', c.text, 'session_id', c.session_id, 'created_at', c.created_at)
          FROM public.session_comments c WHERE c.id::text = r.content_id
        ) END,
        'comment_snapshot', CASE WHEN r.content_type = 'comment' AND r.snapshot_text IS NOT NULL THEN
          jsonb_build_object('text', r.snapshot_text, 'created_at', r.snapshot_created_at)
        END
      ) AS item
      FROM public.content_reports r
      WHERE (p_include_resolved OR r.resolved_at IS NULL)
        AND (p_before IS NULL OR r.created_at < p_before)
      ORDER BY r.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100)
    ) t
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reports(boolean, timestamptz, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_reports(boolean, timestamptz, int) TO authenticated;
