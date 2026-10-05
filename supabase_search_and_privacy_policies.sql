-- COCO: privacy + search fixes
-- Applied to production 2026-10-05. The profiles SELECT policy here was later
-- replaced by supabase_pending_request_profile_visibility.sql.
-- Paste into Supabase SQL editor (COCO Climbing project) and run.
-- Runs as one transaction: if any statement fails, nothing changes.

begin;

-- 1. PROFILES: own, public, or accepted connection
drop policy if exists "Users can read own, non-private, or connected profiles" on public.profiles;
drop policy if exists "Users can view profiles of friends, requesters, or public" on public.profiles;
drop policy if exists "Users can view own, public, or connected profiles" on public.profiles;
create policy "Users can view own, public, or accepted-connection profiles"
on public.profiles for select
using (
  auth.uid() = profiles.id
  or profiles.is_private = false
  or exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.sender_id = auth.uid() and f.receiver_id = profiles.id)
        or (f.receiver_id = auth.uid() and f.sender_id = profiles.id))
  )
);

-- 2. SESSIONS: own, or (public or accepted friend) and not blocked
drop policy if exists "Friends or public can view sessions" on public.sessions;
drop policy if exists "Users can view own or friends' non-deleted sessions" on public.sessions;
create policy "View own, public, or accepted-friend sessions"
on public.sessions for select
using (
  deleted_at is null
  and (
    auth.uid() = sessions.user_id
    or (
      not public.is_blocked(auth.uid(), sessions.user_id)
      and (
        exists (select 1 from public.profiles p where p.id = sessions.user_id and p.is_private = false)
        or exists (select 1 from public.friendships f
                   where f.status = 'accepted'
                     and ((f.sender_id = auth.uid() and f.receiver_id = sessions.user_id)
                       or (f.receiver_id = auth.uid() and f.sender_id = sessions.user_id)))
      )
    )
  )
);

-- CLIMBS: same rule
drop policy if exists "Friends or public can view climbs" on public.climbs;
drop policy if exists "Users can view own or friends' non-deleted climbs" on public.climbs;
create policy "View own, public, or accepted-friend climbs"
on public.climbs for select
using (
  deleted_at is null
  and (
    auth.uid() = climbs.user_id
    or (
      not public.is_blocked(auth.uid(), climbs.user_id)
      and (
        exists (select 1 from public.profiles p where p.id = climbs.user_id and p.is_private = false)
        or exists (select 1 from public.friendships f
                   where f.status = 'accepted'
                     and ((f.sender_id = auth.uid() and f.receiver_id = climbs.user_id)
                       or (f.receiver_id = auth.uid() and f.sender_id = climbs.user_id)))
      )
    )
  )
);

-- COMMENTS / LIKES: only on sessions you can see (sessions rule above applies inside the subquery)
drop policy if exists "Session owner or friends can view comments" on public.session_comments;
create policy "View comments on visible sessions"
on public.session_comments for select
using (exists (select 1 from public.sessions s where s.id = session_comments.session_id));

drop policy if exists "Users can comment" on public.session_comments;
create policy "Comment on visible sessions"
on public.session_comments for insert
with check (auth.uid() = user_id and exists (select 1 from public.sessions s where s.id = session_comments.session_id));

drop policy if exists "Session owner or friends can view likes" on public.session_likes;
create policy "View likes on visible sessions"
on public.session_likes for select
using (exists (select 1 from public.sessions s where s.id = session_likes.session_id));

drop policy if exists "Users can like" on public.session_likes;
create policy "Like visible sessions"
on public.session_likes for insert
with check (auth.uid() = user_id and exists (select 1 from public.sessions s where s.id = session_likes.session_id));

drop policy if exists "Users can read all comment likes" on public.comment_likes;
create policy "View likes on visible comments"
on public.comment_likes for select
using (exists (select 1 from public.session_comments c where c.id = comment_likes.comment_id));

drop policy if exists "Users can like comments" on public.comment_likes;
create policy "Like visible comments"
on public.comment_likes for insert
with check (auth.uid() = user_id and exists (select 1 from public.session_comments c where c.id = comment_likes.comment_id));

-- 3. SEARCH: everyone findable by name or username (private users too)
create or replace function public.search_profiles(q text, max_results int default 10)
returns table (id uuid, name text, username text, avatar_url text, hometown text, is_private boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.username, p.avatar_url,
         case when p.is_private then null else p.hometown end,
         p.is_private
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and length(trim(q)) > 0
    and (p.username ilike '%' || trim(q) || '%' or p.name ilike '%' || trim(q) || '%')
    and not public.is_blocked(auth.uid(), p.id)
  order by
    (lower(p.username) = lower(trim(q)) or lower(p.name) = lower(trim(q))) desc,
    (p.username ilike trim(q) || '%' or p.name ilike trim(q) || '%') desc,
    p.username
  limit least(max_results, 50);
$$;

revoke all on function public.search_profiles(text, int) from public, anon;
grant execute on function public.search_profiles(text, int) to authenticated;

commit;

-- After running, check every SELECT/INSERT rule that's now in place:
-- select c.relname, p.polname, p.polcmd
-- from pg_policy p join pg_class c on c.oid = p.polrelid
-- where c.relnamespace = 'public'::regnamespace
-- order by 1, 3, 2;
