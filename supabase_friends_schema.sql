-- Add username to profiles
alter table public.profiles add column if not exists username text unique;
create unique index if not exists profiles_username_idx on public.profiles (lower(username));

-- Friendships table
create table if not exists public.friendships (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references auth.users on delete cascade not null,
  receiver_id uuid references auth.users on delete cascade not null,
  status text not null default 'pending',
  created_at timestamptz default now(),
  constraint unique_friendship unique (sender_id, receiver_id)
);

alter table public.friendships enable row level security;

create policy "Users can view their own friendships" on public.friendships
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can send friend requests" on public.friendships
  for insert with check (auth.uid() = sender_id);

create policy "Users can update friendships they received" on public.friendships
  for update using (auth.uid() = receiver_id or auth.uid() = sender_id);

create policy "Users can delete their own friendships" on public.friendships
  for delete using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Allow users to see basic profile info of friends/requesters
create policy "Users can view profiles of friends or requesters" on public.profiles
  for select using (
    auth.uid() = id
    or exists (
      select 1 from public.friendships f
      where (f.sender_id = auth.uid() and f.receiver_id = id)
         or (f.receiver_id = auth.uid() and f.sender_id = id)
    )
  );

-- ─── Follow list RPCs ────────────────────────────────────────────────────────
-- Collapse the friendships -> profiles two-step lookup used by getFollowing /
-- getFollowers in friendsApi.ts into a single round trip.

create or replace function public.get_following(target_user_id uuid)
returns table (
  id uuid,
  name text,
  username text,
  avatar_url text,
  hometown text,
  is_private boolean
)
language sql stable security definer as $$
  select p.id, p.name, p.username, p.avatar_url, p.hometown, p.is_private
  from public.profiles p
  join public.friendships f on f.receiver_id = p.id
  where f.sender_id = target_user_id
    and f.status = 'accepted';
$$;

create or replace function public.get_followers(target_user_id uuid)
returns table (
  id uuid,
  name text,
  username text,
  avatar_url text,
  hometown text,
  is_private boolean
)
language sql stable security definer as $$
  select p.id, p.name, p.username, p.avatar_url, p.hometown, p.is_private
  from public.profiles p
  join public.friendships f on f.sender_id = p.id
  where f.receiver_id = target_user_id
    and f.status = 'accepted';
$$;
