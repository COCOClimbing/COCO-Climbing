-- ─── Pre-launch security fix (2026-07-11 audit) ──────────────────────────────
--
-- Addresses the Critical/High findings from a pre-marketing security audit:
--   1. Private-account follow requests could be inserted directly with
--      status='accepted' from a hostile client, bypassing the entire privacy
--      model (utils/friendsApi.ts's isPrivate check is client-side only).
--   2. get_following/get_followers RPCs (SECURITY DEFINER) had no auth check
--      at all — any authenticated user could dump any account's full
--      follow/follower list, private or not.
--   3. "Authenticated users can view accepted friendships" (from
--      supabase_hometown_schema.sql) granted every logged-in user SELECT on
--      ALL accepted friendship rows, a second path to the same leak as #2.
--   4. Blocking (blocked_users table) was enforced nowhere at the database
--      level — a blocked user could immediately re-friend (auto-accepted)
--      whoever blocked them, and keep liking/commenting on their sessions.
--
-- UNLIKE the other supabase_*_fix.sql files in this repo, this one is NOT a
-- "just run it" file. It changes core social-graph RLS/trigger behavior.
-- Review each section against your actual production data before running,
-- and ideally test against a staging Supabase project first. Written from
-- the schema files in this repo (supabase_complete_schema.sql,
-- supabase_friends_schema.sql, supabase_hometown_schema.sql,
-- supabase_moderation_schema.sql, supabase_comment_permissions_fix.sql) —
-- if your live database has drifted from those files, verify column/policy
-- names match before running.
--
-- Safe to run multiple times (all objects use CREATE OR REPLACE / DROP...IF
-- EXISTS / IF NOT EXISTS).


-- ─── Helper: bidirectional block check ───────────────────────────────────────
-- blocked_users' own RLS policy ("Users manage their own blocks", USING
-- auth.uid() = blocker_id) means a plain EXISTS subquery inside another
-- table's policy would only see rows where the CURRENT caller is the
-- blocker, missing the case where they were blocked BY the other person.
-- SECURITY DEFINER bypasses that so the check is correctly bidirectional.

CREATE OR REPLACE FUNCTION public.is_blocked(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  );
$$;


-- ─── Fix 1: server-side friendship status, ignoring client-supplied status ───
-- INSERT: force status to 'pending' for private targets, 'accepted' for
-- public ones, regardless of what the client sent. Also reject the insert
-- outright if either party has blocked the other.

CREATE OR REPLACE FUNCTION public.enforce_friendship_insert_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  target_private boolean;
BEGIN
  IF public.is_blocked(NEW.sender_id, NEW.receiver_id) THEN
    RAISE EXCEPTION 'Cannot follow a blocked user';
  END IF;

  SELECT is_private INTO target_private FROM public.profiles WHERE id = NEW.receiver_id;
  NEW.status := CASE WHEN target_private THEN 'pending' ELSE 'accepted' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friendships_enforce_insert_status ON public.friendships;
CREATE TRIGGER friendships_enforce_insert_status
  BEFORE INSERT ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_friendship_insert_status();

-- UPDATE: only the receiver may move a request from 'pending' to 'accepted'
-- (stops a sender from self-accepting their own outbound request), and
-- reject any update that would (re)activate a friendship across a block.

CREATE OR REPLACE FUNCTION public.enforce_friendship_update_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' AND auth.uid() <> OLD.receiver_id THEN
    RAISE EXCEPTION 'Only the recipient can accept a friend request';
  END IF;
  IF public.is_blocked(NEW.sender_id, NEW.receiver_id) THEN
    RAISE EXCEPTION 'Cannot modify a friendship involving a blocked user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friendships_enforce_update_status ON public.friendships;
CREATE TRIGGER friendships_enforce_update_status
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_friendship_update_status();


-- ─── Fix 2: remove the blanket "view all accepted friendships" policy ───────
-- This was added (supabase_hometown_schema.sql) to compute follower/following
-- counts on a friend's profile, but grants every logged-in user SELECT on
-- every accepted friendship row in the table. The app now reads counts via
-- profiles.following_count/followers_count (denormalized, kept in sync by
-- sync_follow_counts()) and via the get_following/get_followers RPCs fixed
-- below — this blanket policy is redundant as well as a leak. The existing
-- "Users can view own friendships" policy (auth.uid() IN (sender_id,
-- receiver_id)) remains and is sufficient.

DROP POLICY IF EXISTS "Authenticated users can view accepted friendships" ON public.friendships;


-- ─── Fix 3: scope get_following / get_followers ──────────────────────────────
-- Only return results if the caller IS the target, the target's profile is
-- public, or the caller has an accepted mutual friendship with the target.

CREATE OR REPLACE FUNCTION public.get_following(target_user_id uuid)
RETURNS TABLE (
  id uuid, name text, username text, avatar_url text, hometown text, is_private boolean
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.id, p.name, p.username, p.avatar_url, p.hometown, p.is_private
  FROM public.profiles p
  JOIN public.friendships f ON f.receiver_id = p.id
  WHERE f.sender_id = target_user_id
    AND f.status = 'accepted'
    AND (
      target_user_id = auth.uid()
      OR NOT EXISTS (SELECT 1 FROM public.profiles tp WHERE tp.id = target_user_id AND tp.is_private)
      OR EXISTS (
        SELECT 1 FROM public.friendships mf
        WHERE mf.status = 'accepted'
          AND ((mf.sender_id = auth.uid() AND mf.receiver_id = target_user_id)
            OR (mf.receiver_id = auth.uid() AND mf.sender_id = target_user_id))
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.get_followers(target_user_id uuid)
RETURNS TABLE (
  id uuid, name text, username text, avatar_url text, hometown text, is_private boolean
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.id, p.name, p.username, p.avatar_url, p.hometown, p.is_private
  FROM public.profiles p
  JOIN public.friendships f ON f.sender_id = p.id
  WHERE f.receiver_id = target_user_id
    AND f.status = 'accepted'
    AND (
      target_user_id = auth.uid()
      OR NOT EXISTS (SELECT 1 FROM public.profiles tp WHERE tp.id = target_user_id AND tp.is_private)
      OR EXISTS (
        SELECT 1 FROM public.friendships mf
        WHERE mf.status = 'accepted'
          AND ((mf.sender_id = auth.uid() AND mf.receiver_id = target_user_id)
            OR (mf.receiver_id = auth.uid() AND mf.sender_id = target_user_id))
      )
    );
$$;


-- ─── Fix 4: block enforcement on likes / comments / comment-likes ───────────
-- A blocked relationship should stop new likes/comments in both directions,
-- not just hide them client-side.

DROP POLICY IF EXISTS "Users can like" ON public.session_likes;
CREATE POLICY "Users can like"
  ON public.session_likes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_likes.session_id
        AND public.is_blocked(auth.uid(), s.user_id)
    )
  );

DROP POLICY IF EXISTS "Users can comment" ON public.session_comments;
CREATE POLICY "Users can comment"
  ON public.session_comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_comments.session_id
        AND public.is_blocked(auth.uid(), s.user_id)
    )
  );

DROP POLICY IF EXISTS "Users can like comments" ON public.comment_likes;
CREATE POLICY "Users can like comments"
  ON public.comment_likes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.session_comments c
      JOIN public.sessions s ON s.id = c.session_id
      WHERE c.id = comment_likes.comment_id
        AND public.is_blocked(auth.uid(), s.user_id)
    )
  );


-- ─── Not fixed here — needs an app-level decision, not just SQL ─────────────
-- - send-notification edge function trusts client-supplied recipientId(s)
--   and senderId with no relationship/friendship check — a caller can push-
--   spam or spoof-attribute notifications to anyone. Needs a code change in
--   supabase/functions/send-notification/index.ts (verify an accepted
--   friendship exists between the authenticated caller and each recipient,
--   and force senderId = the authenticated caller's id rather than trusting
--   the request body).
-- - Media (R2 bucket) is served from a fully public, unauthenticated URL —
--   a leaked link is viewable by anyone regardless of privacy/block state.
--   Fixing this properly means signed/expiring URLs, a bigger change than a
--   policy tweak.
-- - No rate limiting found in-repo for friend requests, comments, likes, or
--   edge-function calls. Worth confirming Supabase-project-level protections
--   (or adding application-level throttling) before a traffic spike.
