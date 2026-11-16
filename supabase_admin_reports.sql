-- ─── Admin reports (2026-11-16) ──────────────────────────────────────────────
--
-- Lets admins (public.admins, see supabase_admins.sql) see and resolve
-- content_reports from the app, and get a notification when one is filed.
-- Run after supabase_admins.sql. Safe to re-run.

-- Resolution state. Only admins can set it, through admin_resolve_report.
ALTER TABLE public.content_reports ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.content_reports ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users ON DELETE SET NULL;

-- Which report an admin's "New report" notification is about. Also lets the
-- send-notification function refuse to announce the same report twice.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES public.content_reports ON DELETE CASCADE;

-- ─── admin_reports ───────────────────────────────────────────────────────────
-- Newest first, with both people's profiles and a preview of what was
-- reported (the session's title/notes, or the comment's text). Open reports
-- only unless p_include_resolved. Paginate with the last row's created_at.
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
        ) END
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

-- ─── admin_resolve_report ────────────────────────────────────────────────────
-- Mark a report resolved (p_resolved = true) or reopen it (false).
CREATE OR REPLACE FUNCTION public.admin_resolve_report(p_id uuid, p_resolved boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.content_reports
  SET resolved_at = CASE WHEN p_resolved THEN now() ELSE NULL END,
      resolved_by = CASE WHEN p_resolved THEN auth.uid() ELSE NULL END
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_report(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(uuid, boolean) TO authenticated;
