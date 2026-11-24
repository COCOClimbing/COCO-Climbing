-- Adds photos to projects (notes/location columns are added too, in case they're missing).
alter table projects add column if not exists notes text;
alter table projects add column if not exists location text;
-- APPLY THIS IN PRODUCTION BEFORE SHIPPING THE OTA THAT SENDS media_uris ON PROJECTS.
alter table projects add column if not exists media_uris text[];
alter table projects add column if not exists media_types text[];

-- The R2 cleanup keeps only files this RPC (or the device) still references.
-- Include project photos so the cleanup never deletes them — including when
-- it runs from an older copy of the app that doesn't know projects have photos.
CREATE OR REPLACE FUNCTION public.get_own_media_refs_including_deleted()
RETURNS TABLE(media_uris text[], media_uri text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT media_uris, NULL::text AS media_uri FROM public.sessions WHERE user_id = auth.uid()
  UNION ALL
  SELECT media_uris, media_uri FROM public.climbs WHERE user_id = auth.uid()
  UNION ALL
  SELECT media_uris, NULL::text FROM public.projects WHERE user_id = auth.uid();
$$;
