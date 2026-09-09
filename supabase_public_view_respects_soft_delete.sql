-- ─── Fix: "Friends or public can view" policies leaked soft-deleted rows ─────
-- climbs and sessions each carry two permissive SELECT policies:
--   1. "Users can view own or friends' non-deleted {climbs,sessions}"
--      (added by supabase_soft_delete_climbs_sessions.sql) — correctly
--      requires deleted_at IS NULL.
--   2. "Friends or public can view {climbs,sessions}" — added later for the
--      friends/public activity-feed feature, granting access whenever
--      auth.uid() = user_id (i.e. you're the owner), OR your profile is
--      public, OR you're accepted friends with the owner — with NO
--      deleted_at check at all.
--
-- Postgres OR's multiple permissive policies of the same command together, so
-- satisfying policy #2 alone is enough — and its very first clause,
-- "auth.uid() = user_id", is unconditionally true whenever you're querying
-- your own data. That means every account's own soft-deleted climbs/sessions
-- were visible to itself the entire time policy #2 existed, regardless of
-- deleted_at, completely bypassing the soft-delete every client-side sync fix
-- in this codebase assumed was in effect. This is what caused deleted
-- sessions to keep reappearing after a reinstall no matter what the app-side
-- merge/tombstone logic did — no client fix can hide a row Supabase itself
-- hands back.
--
-- Fix: add deleted_at IS NULL to policy #2 on both tables, so every access
-- path (owner, friend, or public viewer) respects the soft-delete.

ALTER POLICY "Friends or public can view climbs" ON public.climbs
  USING (deleted_at IS NULL AND (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = climbs.user_id AND p.is_private = false)
    OR EXISTS (
      SELECT 1 FROM friendships f
      WHERE f.status = 'accepted'
        AND ((f.sender_id = auth.uid() AND f.receiver_id = climbs.user_id)
          OR (f.receiver_id = auth.uid() AND f.sender_id = climbs.user_id))
    )
  ));

ALTER POLICY "Friends or public can view sessions" ON public.sessions
  USING (deleted_at IS NULL AND (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = sessions.user_id AND p.is_private = false)
    OR EXISTS (
      SELECT 1 FROM friendships f
      WHERE f.status = 'accepted'
        AND ((f.sender_id = auth.uid() AND f.receiver_id = sessions.user_id)
          OR (f.receiver_id = auth.uid() AND f.sender_id = sessions.user_id))
    )
  ));
