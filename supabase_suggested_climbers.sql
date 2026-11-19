-- ─── Suggested climbers (2026-11-19) ─────────────────────────────────────────
--
-- Find Friends → Suggested tab. Two kinds of suggestion:
--   * people who follow you that you don't follow back ("Follows you")
--   * people followed by people you follow ("Followed by Milo and 2 others")
-- (Climbers at your gyms are a separate tab: supabase_climbers_at_my_gyms.sql.)
--
-- Only public profiles are suggested. People you already follow or have
-- requested, and anyone blocked either way, are left out. The "Followed by"
-- name is always someone YOU follow (accepted), so it never reveals a
-- stranger's follows.
--
-- Paste into the Supabase SQL editor and run. Safe to re-run.

begin;

create or replace function public.suggested_climbers(max_results int default 30)
returns table (
  id            uuid,
  name          text,
  username      text,
  avatar_url    text,
  hometown      text,
  follows_you   boolean,
  mutual_count  int,
  mutual_name   text
)
language sql stable security definer
set search_path = public
as $$
  with my_follows as (            -- people I follow (accepted)
    select f.receiver_id as uid
    from friendships f
    where f.sender_id = auth.uid() and f.status = 'accepted'
  ),
  already as (                    -- anyone I follow or have requested
    select f.receiver_id as uid from friendships f where f.sender_id = auth.uid()
  ),
  via_friends as (                -- followed by people I follow
    select f.receiver_id as uid, f.sender_id as via
    from friendships f
    join my_follows m on m.uid = f.sender_id
    where f.status = 'accepted'
  ),
  followers as (                  -- they follow me
    select f.sender_id as uid
    from friendships f
    where f.receiver_id = auth.uid() and f.status = 'accepted'
  ),
  candidates as (
    select uid from via_friends
    union
    select uid from followers
  ),
  scored as (
    select c.uid,
           exists (select 1 from followers fo where fo.uid = c.uid) as follows_you,
           (select count(distinct v.via) from via_friends v where v.uid = c.uid)::int as mutual_count,
           (select vp.name
              from via_friends v join profiles vp on vp.id = v.via
             where v.uid = c.uid
             order by vp.name
             limit 1) as mutual_name
    from candidates c
  )
  select p.id, p.name, p.username, p.avatar_url, p.hometown,
         s.follows_you, s.mutual_count, s.mutual_name
  from scored s
  join profiles p on p.id = s.uid
  where auth.uid() is not null
    and s.uid <> auth.uid()
    and p.is_private = false
    and not exists (select 1 from already a where a.uid = s.uid)
    and not public.is_blocked(auth.uid(), s.uid)
  order by s.follows_you desc, s.mutual_count desc, p.name
  limit greatest(1, least(coalesce(max_results, 30), 50));
$$;

revoke all on function public.suggested_climbers(int) from public, anon;
grant execute on function public.suggested_climbers(int) to authenticated;

commit;
