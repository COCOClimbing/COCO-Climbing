-- Add hometown to profiles
alter table public.profiles add column if not exists hometown text;

-- Allow any authenticated user to view accepted friendships
-- (needed to compute follower/following counts on friend profiles)
create policy if not exists "Authenticated users can view accepted friendships"
  on public.friendships
  for select
  using (auth.uid() is not null and status = 'accepted');
