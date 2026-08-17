-- ─── Fix: R2 media cleanup was blind to soft-deleted rows ────────────────────
-- cleanupOrphanedR2Media (utils/cloudSync.ts) decides which R2 files are
-- still "referenced" by querying climbs/sessions media_uris through the
-- normal RLS-bound client. Since supabase_soft_delete_climbs_sessions.sql
-- added "deleted_at IS NULL" to the SELECT policies, that query can no
-- longer see a soft-deleted row's media_uris — so a soft-deleted session's
-- photos looked orphaned and could be purged from R2 immediately, well
-- before the 30-day recovery window the soft-delete was meant to provide.
--
-- Fix: a SECURITY DEFINER RPC that returns media refs for the CALLING
-- user's own rows regardless of deleted_at (it takes no user_id parameter —
-- always auth.uid() — so it can't be used to read anyone else's data; same
-- safety property the normal RLS-scoped query had).

CREATE OR REPLACE FUNCTION public.get_own_media_refs_including_deleted()
RETURNS TABLE(media_uris text[], media_uri text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT media_uris, NULL::text AS media_uri FROM public.sessions WHERE user_id = auth.uid()
  UNION ALL
  SELECT media_uris, media_uri FROM public.climbs WHERE user_id = auth.uid();
$$;
