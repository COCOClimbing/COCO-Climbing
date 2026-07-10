-- ─── Allow session owners to delete any comment on their own session ────────
-- Comment authors could already delete their own comments (session_comments'
-- original DELETE policy: auth.uid() = user_id). The Activity feed UI
-- (app/friends.tsx) already lets a session owner attempt to delete ANY
-- comment on their own session — see the `isOwn` check at the SwipeableComment
-- call site, which ORs in `entry.friend.id === user?.id` — but the DB policy
-- never granted that, so owner-deletes on other people's comments were
-- silently rejected by RLS. This aligns the policy with what the UI already
-- assumed worked.

DROP POLICY IF EXISTS "Users can delete own comments" ON public.session_comments;

CREATE POLICY "Users can delete own comments or comments on own session"
  ON public.session_comments FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_comments.session_id AND s.user_id = auth.uid()
    )
  );


-- ─── Backfill: comment_likes table ───────────────────────────────────────────
-- This table already exists in production (created directly via the Supabase
-- dashboard/SQL editor) but was never committed to a migration file. This
-- documents it going forward. Uses IF NOT EXISTS / DROP POLICY IF EXISTS
-- throughout so it's safe to run even though the objects likely already
-- exist — if a live policy has a different name than the one below, this
-- just adds a second (redundant but harmless) permissive policy; RLS
-- policies are OR'd together, so no functional conflict.

CREATE TABLE IF NOT EXISTS public.comment_likes (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id uuid REFERENCES public.session_comments ON DELETE CASCADE NOT NULL,
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_comment_like UNIQUE (comment_id, user_id)
);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Session owner or friends can view comment likes" ON public.comment_likes;
CREATE POLICY "Session owner or friends can view comment likes"
  ON public.comment_likes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.session_comments c
      JOIN public.sessions s ON s.id = c.session_id
      WHERE c.id = comment_likes.comment_id
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

DROP POLICY IF EXISTS "Users can like comments" ON public.comment_likes;
CREATE POLICY "Users can like comments" ON public.comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike comments" ON public.comment_likes;
CREATE POLICY "Users can unlike comments" ON public.comment_likes FOR DELETE USING (auth.uid() = user_id);
