-- ─── Climbers at your gyms (2026-11-19) ──────────────────────────────────────
--
-- Find Friends shows public climbers who've logged sessions where you have.
-- Sessions only store a typed location name, so "Ascend PB" and the gym's
-- street address would never match by name. The app now also saves rough
-- coordinates for each session (utils/sessionCoords.ts), and matching is by
-- distance, with an exact (cleaned-up) name match as a fallback for sessions
-- that have no coordinates.
--
-- Privacy:
--   * Coordinates live in their own table that only the owner can read, NOT on
--     sessions (whose rows public profiles expose to everyone). The app rounds
--     them to ~100 m before upload.
--   * climbers_at_my_gyms() is SECURITY DEFINER so it can compare against other
--     people's coordinates, but it only returns names/avatars plus the name of
--     YOUR gym they matched — never anyone's coordinates or location text.
--   * Private profiles, blocked users (either way) and people you already
--     follow or have requested are never returned.
--
-- Paste into the Supabase SQL editor and run. Safe to re-run.

begin;

-- ─── Coordinates per session (owner-only) ────────────────────────────────────

create table if not exists public.session_coords (
  session_id text primary key references public.sessions(id) on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  updated_at timestamptz not null default now()
);

create index if not exists session_coords_lat_idx on public.session_coords (lat);
create index if not exists session_coords_user_idx on public.session_coords (user_id);

alter table public.session_coords enable row level security;

drop policy if exists "Own session coords: read" on public.session_coords;
create policy "Own session coords: read"
on public.session_coords for select
using (auth.uid() = user_id);

drop policy if exists "Own session coords: insert" on public.session_coords;
create policy "Own session coords: insert"
on public.session_coords for insert
with check (
  auth.uid() = user_id
  and exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid())
);

drop policy if exists "Own session coords: update" on public.session_coords;
create policy "Own session coords: update"
on public.session_coords for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Own session coords: delete" on public.session_coords;
create policy "Own session coords: delete"
on public.session_coords for delete
using (auth.uid() = user_id);

-- ─── Helpers ─────────────────────────────────────────────────────────────────

-- "ASCEND Point Breeze, Pittsburgh" -> "ascendpointbreezepittsburgh"
create or replace function public.norm_gym(t text)
returns text
language sql immutable as $$
  select regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '', 'g');
$$;

-- Great-circle distance in metres
create or replace function public.gym_distance_m(lat1 double precision, lng1 double precision,
                                                 lat2 double precision, lng2 double precision)
returns double precision
language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- ─── The suggestion list ─────────────────────────────────────────────────────
-- Radius: 250 m between two indoor sessions (same building), 1 km if either is
-- outdoor (crags are spread out). Their sessions must be from the last 180 days.

create or replace function public.climbers_at_my_gyms(max_results int default 30)
returns table (
  id              uuid,
  name            text,
  username        text,
  avatar_url      text,
  gym             text,
  shared_sessions int,
  last_climbed    timestamptz
)
language sql stable security definer
set search_path = public
as $$
  with mine as (
    select s.location, s.environment, c.lat, c.lng, norm_gym(s.location) as norm
    from sessions s
    left join session_coords c on c.session_id = s.id
    where s.user_id = auth.uid()
      and s.deleted_at is null
      and norm_gym(s.location) <> ''
  ),
  theirs as (
    select s.id, s.user_id, s.environment, c.lat, c.lng, norm_gym(s.location) as norm,
           coalesce(s.started_at, s.synced_at) as at
    from sessions s
    join profiles p on p.id = s.user_id and p.is_private = false
    left join session_coords c on c.session_id = s.id
    where s.user_id <> auth.uid()
      and s.deleted_at is null
      and norm_gym(s.location) <> ''
      and coalesce(s.started_at, s.synced_at) > now() - interval '180 days'
  ),
  matches as (
    select t.id, t.user_id, t.at, m.location as my_gym
    from theirs t
    join mine m on (
      (
        t.lat is not null and m.lat is not null
        -- cheap box first (~1.1 km lat), then the real distance
        and abs(t.lat - m.lat) < 0.01
        and abs(t.lng - m.lng) < 0.02
        and gym_distance_m(t.lat, t.lng, m.lat, m.lng)
            <= case when t.environment = 'outdoor' or m.environment = 'outdoor' then 1000 else 250 end
      )
      or (
        (t.lat is null or m.lat is null) and t.norm = m.norm
      )
    )
  ),
  per_user as (
    select user_id,
           count(distinct id)::int as shared,
           max(at) as last_at,
           (array_agg(my_gym order by at desc))[1] as gym
    from matches
    group by user_id
  )
  select p.id, p.name, p.username, p.avatar_url, u.gym, u.shared, u.last_at
  from per_user u
  join profiles p on p.id = u.user_id
  where auth.uid() is not null
    and not public.is_blocked(auth.uid(), u.user_id)
    and not exists (
      select 1 from friendships f
      where f.sender_id = auth.uid() and f.receiver_id = u.user_id
    )
  order by u.shared desc, u.last_at desc nulls last
  limit greatest(1, least(coalesce(max_results, 30), 50));
$$;

revoke all on function public.climbers_at_my_gyms(int) from public, anon;
grant execute on function public.climbers_at_my_gyms(int) to authenticated;

commit;
