-- ─── Fix: soft-deleting a climb/session always failed under RLS ─────────────
-- climbs and sessions each have two SELECT policies that require
-- `deleted_at IS NULL` (one scoped to the owner, one to friends/public — see
-- supabase_soft_delete_climbs_sessions.sql and
-- supabase_public_view_respects_soft_delete.sql).
--
-- Postgres enforces UPDATE row security by combining ALL policies applicable
-- to the role for BOTH the UPDATE command and SELECT (a row must be
-- selectable to be targeted at all), and it re-checks that same combined
-- condition against the RESULTING row to block using UPDATE side effects to
-- probe rows the role couldn't otherwise see. Since every SELECT policy on
-- these tables requires deleted_at IS NULL, any UPDATE that sets deleted_at
-- to a non-null value produces a resulting row that can never satisfy that
-- combined condition — so a soft-delete performed as the authenticated
-- client (`UPDATE climbs SET deleted_at = now() ...`) ALWAYS failed with
-- "new row violates row-level security policy", regardless of ownership,
-- network, or retries. This has apparently been broken since soft-delete was
-- introduced — every previously "successfully deleted" row found while
-- diagnosing this was set directly via the linked CLI during past debugging
-- sessions, not by the app itself.
--
-- Fix: perform the soft-delete inside a SECURITY DEFINER function (same
-- pattern already used by get_own_media_refs_including_deleted), which runs
-- with elevated privileges and so isn't subject to this recheck. Ownership
-- is still enforced explicitly in the WHERE clause via auth.uid().

CREATE OR REPLACE FUNCTION public.soft_delete_climb(p_climb_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.climbs SET deleted_at = now()
  WHERE id = p_climb_id AND user_id = auth.uid() AND deleted_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.soft_delete_session(p_session_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.climbs SET deleted_at = now()
  WHERE session_id = p_session_id AND user_id = auth.uid() AND deleted_at IS NULL;
  UPDATE public.sessions SET deleted_at = now()
  WHERE id = p_session_id AND user_id = auth.uid() AND deleted_at IS NULL;
$function$;

REVOKE ALL ON FUNCTION public.soft_delete_climb(text) FROM public;
REVOKE ALL ON FUNCTION public.soft_delete_session(text) FROM public;
GRANT EXECUTE ON FUNCTION public.soft_delete_climb(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_session(text) TO authenticated;
