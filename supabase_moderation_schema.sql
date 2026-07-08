-- Moderation: blocked users
create table if not exists blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique(blocker_id, blocked_id)
);
alter table blocked_users enable row level security;
create policy "Users manage their own blocks" on blocked_users
  for all using (auth.uid() = blocker_id);

-- Moderation: content reports
create table if not exists content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null check (content_type in ('session', 'comment', 'user')),
  content_id text not null,
  reason text not null,
  created_at timestamptz default now()
);
alter table content_reports enable row level security;
create policy "Users can create reports" on content_reports
  for insert with check (auth.uid() = reporter_id);
create policy "Users can view own reports" on content_reports
  for select using (auth.uid() = reporter_id);
