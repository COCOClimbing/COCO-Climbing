-- ─── Admin flag (2026-11-16) ─────────────────────────────────────────────────
--
-- Marks which accounts are COCO admins (Jack, Milo and the test account), to gate the in-app
-- admin button.
--
-- Why a separate table instead of profiles.is_admin: profiles is readable by
-- everyone ("Anyone can read profiles") and "Users can update own profile" has
-- no column restriction, so an is_admin column there could be flipped to true
-- by any user from a hostile client, and would publish who the admins are.
--
-- This table has NO insert/update/delete policies, so the client can never
-- write it. Rows are added only from the SQL editor (service role). Each user
-- can read only their own row, which is all the app needs to know.

CREATE TABLE IF NOT EXISTS public.admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see own admin row" ON public.admins;
CREATE POLICY "Users can see own admin row"
  ON public.admins FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Server-side check for future admin-only RPCs / policies:
--   IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ─── Admin feed ──────────────────────────────────────────────────────────────
-- Every non-deleted session from every user (private accounts included), newest
-- first, with its climbs, owner, partners, likes, comments and comment likes in
-- one payload. SECURITY DEFINER so it ignores RLS; the is_admin() check is the
-- only thing standing between this and a full data dump, so keep it first.
-- Read-only: nothing here writes. Keyset-paginated on (date, id): pass the last
-- row's session date and id to get the next page.
CREATE OR REPLACE FUNCTION public.admin_feed(
  p_before_date text DEFAULT NULL,
  p_before_id   text DEFAULT NULL,
  p_limit       int  DEFAULT 20
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
    SELECT jsonb_agg(t.item ORDER BY t.date DESC, t.id DESC)
    FROM (
      SELECT s.date, s.id, jsonb_build_object(
        'session', to_jsonb(s),
        'profile', (
          SELECT jsonb_build_object('id', p.id, 'name', p.name, 'username', p.username,
                                    'avatar_url', p.avatar_url, 'is_private', p.is_private)
          FROM public.profiles p WHERE p.id = s.user_id
        ),
        'partners', CASE WHEN jsonb_typeof(to_jsonb(s.friends)) = 'array' THEN (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'id', f->>'id',
                   'name', COALESCE(fp.name, f->>'name'),
                   'avatar_url', fp.avatar_url)), '[]'::jsonb)
          FROM jsonb_array_elements(to_jsonb(s.friends)) f
          LEFT JOIN public.profiles fp ON fp.id::text = f->>'id'
        ) ELSE '[]'::jsonb END,
        'climbs', COALESCE((
          SELECT jsonb_agg(to_jsonb(c) ORDER BY c.date)
          FROM public.climbs c
          WHERE c.session_id = s.id AND c.deleted_at IS NULL
        ), '[]'::jsonb),
        'likes', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id', l.id, 'session_id', l.session_id, 'user_id', l.user_id,
                   'created_at', l.created_at,
                   'profile', jsonb_build_object('name', COALESCE(lp.name, 'Unknown'),
                                                 'avatar_url', lp.avatar_url))
                 ORDER BY l.created_at)
          FROM public.session_likes l
          LEFT JOIN public.profiles lp ON lp.id = l.user_id
          WHERE l.session_id = s.id
        ), '[]'::jsonb),
        'comments', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id', sc.id, 'session_id', sc.session_id, 'user_id', sc.user_id,
                   'text', sc.text, 'created_at', sc.created_at,
                   'profile', jsonb_build_object('name', COALESCE(cp.name, 'Unknown'),
                                                 'username', COALESCE(cp.username, ''),
                                                 'avatar_url', cp.avatar_url),
                   'liked_by', COALESCE((
                     SELECT jsonb_agg(cl.user_id) FROM public.comment_likes cl
                     WHERE cl.comment_id = sc.id
                   ), '[]'::jsonb))
                 ORDER BY sc.created_at)
          FROM public.session_comments sc
          LEFT JOIN public.profiles cp ON cp.id = sc.user_id
          WHERE sc.session_id = s.id
        ), '[]'::jsonb)
      ) AS item
      FROM public.sessions s
      WHERE s.deleted_at IS NULL
        AND (p_before_date IS NULL OR (s.date, s.id) < (p_before_date, p_before_id))
      ORDER BY s.date DESC, s.id DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
    ) t
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_feed(text, text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_feed(text, text, int) TO authenticated;

-- ─── Grant admin to Jack, Milo and the test account ────────────────────────────────────────────
-- Replace the usernames below, then run.
INSERT INTO public.admins (user_id)
SELECT id FROM public.profiles
WHERE lower(username) IN ('JACK_USERNAME', 'MILO_USERNAME', 'TEST_USERNAME')
ON CONFLICT DO NOTHING;

-- Check: should list exactly three rows.
SELECT p.username, a.created_at
FROM public.admins a JOIN public.profiles p ON p.id = a.user_id;
