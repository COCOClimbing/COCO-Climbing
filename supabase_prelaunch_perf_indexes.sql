-- ─── Pre-launch performance indexes (2026-07-11 audit) ───────────────────────
--
-- The schema files in this repo defined no indexes beyond primary keys on
-- any of the hot-path filter columns used by the app's most frequent
-- queries (the Activity feed's per-friend session/climb fetches, RLS
-- friendship-existence subqueries on nearly every table, likes/comments
-- lookups by session, push token lookups on every notification send).
-- Invisible at the row counts this app has today; would degrade sharply
-- once sessions/climbs grow into the tens of thousands of rows.
--
-- STATUS: applied to production (oexaqytotrxqbxmzqabu) on 2026-07-12 via
-- `supabase db query --linked -f supabase_prelaunch_perf_indexes.sql`,
-- verified present afterward via pg_indexes. All indexes below match actual
-- query patterns in the codebase (utils/friendsApi.ts's date-range filters,
-- friendship-direction lookups in RLS policies and send-notification, etc.)
-- rather than being speculative.
--
-- Safe to re-run (IF NOT EXISTS throughout).

CREATE INDEX IF NOT EXISTS idx_sessions_user_id_date ON public.sessions (user_id, date);
CREATE INDEX IF NOT EXISTS idx_climbs_user_id_date ON public.climbs (user_id, date);
CREATE INDEX IF NOT EXISTS idx_climbs_session_id ON public.climbs (session_id);
CREATE INDEX IF NOT EXISTS idx_session_likes_session_id ON public.session_likes (session_id);
CREATE INDEX IF NOT EXISTS idx_session_comments_session_id ON public.session_comments (session_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON public.comment_likes (comment_id);
CREATE INDEX IF NOT EXISTS idx_friendships_sender_id ON public.friendships (sender_id);
CREATE INDEX IF NOT EXISTS idx_friendships_receiver_id ON public.friendships (receiver_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker_id ON public.blocked_users (blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_id ON public.blocked_users (blocked_id);

-- Not addressed here — a larger, separate piece of work: the Activity
-- feed's per-friend query fan-out (app/friends.tsx's loadFeed) still issues
-- 2+ Supabase round-trips per followed user with no batching, which these
-- indexes make individually faster but don't eliminate. That needs an
-- actual query restructure (e.g. a single batched RPC keyed by an array of
-- friend ids) rather than a schema change.
