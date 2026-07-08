-- ─── Privacy fix: profiles.is_private was not enforced by RLS ────────────────
-- "Anyone can read profiles" (USING true) let unauthenticated requests read
-- name/username/avatar for accounts marked private. Username-availability
-- checks during signup need SOME public lookup, so that's carved out into a
-- narrow RPC instead of a blanket table read.

DROP POLICY IF EXISTS "Anyone can read profiles" ON public.profiles;

CREATE POLICY "Users can read own, non-private, or connected profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR is_private = false
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.sender_id = auth.uid() AND f.receiver_id = id)
          OR (f.receiver_id = auth.uid() AND f.sender_id = id))
    )
  );

CREATE OR REPLACE FUNCTION public.is_username_available(check_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = lower(check_username)
  );
$$;


-- ─── Privacy fix: session_likes / session_comments were fully public ─────────
-- These were "USING (true)" with no ownership or friendship check at all,
-- unlike sessions/climbs which correctly gate by friendship. This let anyone
-- with the anon key dump every comment/like in the app, including on private
-- users' sessions, with zero authentication.

DROP POLICY IF EXISTS "Anyone can view likes" ON public.session_likes;
DROP POLICY IF EXISTS "Anyone can view comments" ON public.session_comments;

CREATE POLICY "Session owner or friends can view likes"
  ON public.session_likes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_likes.session_id
        AND (
          s.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.friendships f
            WHERE f.status = 'accepted'
              AND ((f.sender_id = auth.uid() AND f.receiver_id = s.user_id)
                OR (f.receiver_id = auth.uid() AND f.sender_id = s.user_id))
          )
        )
    )
  );

CREATE POLICY "Session owner or friends can view comments"
  ON public.session_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_comments.session_id
        AND (
          s.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.friendships f
            WHERE f.status = 'accepted'
              AND ((f.sender_id = auth.uid() AND f.receiver_id = s.user_id)
                OR (f.receiver_id = auth.uid() AND f.sender_id = s.user_id))
          )
        )
    )
  );
