-- Move saved photo/video/avatar links from Cloudflare's rate-limited r2.dev
-- address to COCO's own cached domain. Same files, same paths: only the host
-- changes, so the r2.dev links keep working for anything not rewritten
-- (old app versions, a phone's local copy). Media cleanup matches files by
-- path, not host (cloudSync.ts mediaKeyFromUrl), so nothing looks orphaned.
--
-- Undo: run the same statements with the two addresses swapped.

begin;

update public.climbs
set media_uri = replace(media_uri, 'https://pub-e8f4259d0a3b483390deba3d351353b6.r2.dev/', 'https://media.cococlimbing.com/')
where media_uri like 'https://pub-e8f4259d0a3b483390deba3d351353b6.r2.dev/%';

update public.climbs
set media_uris = (
  select array_agg(replace(u, 'https://pub-e8f4259d0a3b483390deba3d351353b6.r2.dev/', 'https://media.cococlimbing.com/') order by i)
  from unnest(media_uris) with ordinality as t(u, i)
)
where array_to_string(media_uris, ' ') like '%pub-e8f4259d0a3b483390deba3d351353b6.r2.dev/%';

update public.sessions
set media_uris = (
  select array_agg(replace(u, 'https://pub-e8f4259d0a3b483390deba3d351353b6.r2.dev/', 'https://media.cococlimbing.com/') order by i)
  from unnest(media_uris) with ordinality as t(u, i)
)
where array_to_string(media_uris, ' ') like '%pub-e8f4259d0a3b483390deba3d351353b6.r2.dev/%';

update public.projects
set media_uris = (
  select array_agg(replace(u, 'https://pub-e8f4259d0a3b483390deba3d351353b6.r2.dev/', 'https://media.cococlimbing.com/') order by i)
  from unnest(media_uris) with ordinality as t(u, i)
)
where array_to_string(media_uris, ' ') like '%pub-e8f4259d0a3b483390deba3d351353b6.r2.dev/%';

update public.profiles
set avatar_url = replace(avatar_url, 'https://pub-e8f4259d0a3b483390deba3d351353b6.r2.dev/', 'https://media.cococlimbing.com/')
where avatar_url like 'https://pub-e8f4259d0a3b483390deba3d351353b6.r2.dev/%';

commit;
