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
--      supabase_hometown_schema.sql) — checked directly against the live
--      database before applying this fix; this policy was NOT actually
--      present in production, so this finding didn't apply live. Left the
--      DROP POLICY IF EXISTS in place below as a harmless no-op guard in
--      case it's ever added.
--   4. Blocking (blocked_users table) was enforced nowhere at the database
--      level — a blocked user could immediately re-friend (auto-accepted)
--      whoever blocked them, and keep liking/commenting on their sessions.
--
-- STATUS: applied to production (oexaqytotrxqbxmzqabu) on 2026-07-12 via
-- `supabase db query --linked -f supabase_prelaunch_security_fix.sql`, after
-- verifying live schema/policies/functions matched what's assumed below and
-- that the app's accept/decline/remove-friend code paths are compatible with
-- the new triggers. Verified post-apply via pg_trigger/pg_policies/pg_proc
-- inspection — all objects created as expected. The search_path/anon-execute
-- hardening section at the bottom was added after `supabase db advisors`
-- flagged the newly-created functions for mutable search_path and anon
-- executability, and has also been applied.
--
-- Kept in the repo as a record of what was run and why. Safe to re-run
-- (all objects use CREATE OR REPLACE / DROP...IF EXISTS / IF NOT EXISTS),
-- but there should be nothing left to apply against the linked project.


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
-- Verified compatible with the app's actual UPDATE calls: acceptFriendRequest
-- (utils/friendsApi.ts) is only ever invoked by the receiver after reading
-- their own pending requests; declineFriendRequest sets status='declined'
-- (untouched by this trigger's accept-specific check); removeFriend uses
-- DELETE, not UPDATE, so it's unaffected entirely.

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
-- See the STATUS note at the top — this policy was not actually present in
-- production. Left as a no-op guard in case it's ever (re)added; the app
-- reads counts via profiles.following_count/followers_count and the
-- get_following/get_followers RPCs fixed below, so it's not needed.

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


-- ─── Hardening: search_path pinning + anon execution ────────────────────────
-- `supabase db advisors --linked`, run immediately after applying the fixes
-- above, flagged all 5 SECURITY DEFINER functions touched by this file for
-- mutable search_path (a search-path-hijacking risk: a caller could create a
-- same-named object earlier in their search_path to redirect what the
-- function resolves against) and for being executable by the unauthenticated
-- `anon` role. Pin search_path on all of them, and revoke anon execution on
-- the three that are directly callable by clients (is_blocked, get_following,
-- get_followers) — trigger functions can't be called directly by clients at
-- all (Postgres rejects calling a trigger-return-type function outside
-- trigger context), so revoking anon there isn't meaningful.

ALTER FUNCTION public.is_blocked(uuid, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_friendship_insert_status() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_friendship_update_status() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_following(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_followers(uuid) SET search_path = public, pg_temp;

-- New functions get an implicit EXECUTE grant to the PUBLIC pseudo-role,
-- which anon/authenticated inherit from unless revoked directly — revoking
-- from `anon` alone (a first attempt, left here as a lesson) is a no-op
-- while PUBLIC still has it. Revoke from PUBLIC, then re-grant to
-- authenticated only.
REVOKE EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_following(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_followers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_following(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_followers(uuid) TO authenticated;


-- ─── Not fixed here — needs an app-level decision, not just SQL ─────────────
-- - send-notification edge function trusts client-supplied recipientId(s)
--   and senderId with no relationship/friendship check — a caller can push-
--   spam or spoof-attribute notifications to anyone. Being addressed
--   separately as a code change to supabase/functions/send-notification.
-- - Media (R2 bucket) is served from a fully public, unauthenticated URL —
--   a leaked link is viewable by anyone regardless of privacy/block state.
--   Fixing this properly means signed/expiring URLs, a bigger change than a
--   policy tweak.
-- - `supabase db advisors --linked` also surfaced a number of pre-existing,
--   lower-severity WARN-level items unrelated to this fix: auth_rls_initplan
--   (auth.uid() not wrapped in a subselect in several older policies — a
--   query-planner performance nit, not a security hole) and
--   multiple_permissive_policies (several tables have more than one
--   permissive policy for the same action, which Postgres evaluates as OR'd
--   — correct but slightly less efficient than consolidating). Neither is
--   urgent; worth a cleanup pass separately from this security fix.
-- - No rate limiting found in-repo for friend requests, comments, likes, or
--   edge-function calls. Worth confirming Supabase-project-level protections
--   (or adding application-level throttling) before a traffic spike.
