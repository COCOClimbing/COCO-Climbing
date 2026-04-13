-- ─── DROP EVERYTHING ─────────────────────────────────────────────────────────
-- Run this first, then run supabase_complete_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Triggers
DROP TRIGGER IF EXISTS friendships_follow_counts ON public.friendships;

-- Functions
DROP FUNCTION IF EXISTS sync_follow_counts();
DROP FUNCTION IF EXISTS increment_follow_counts(uuid, uuid);
DROP FUNCTION IF EXISTS decrement_follow_counts(uuid, uuid);

-- Tables (order matters due to foreign keys)
DROP TABLE IF EXISTS public.session_comments CASCADE;
DROP TABLE IF EXISTS public.session_likes    CASCADE;
DROP TABLE IF EXISTS public.friendships      CASCADE;
DROP TABLE IF EXISTS public.projects         CASCADE;
DROP TABLE IF EXISTS public.climbs           CASCADE;
DROP TABLE IF EXISTS public.sessions         CASCADE;
DROP TABLE IF EXISTS public.profiles         CASCADE;

-- Realtime publication (reset to empty)
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.profiles;
