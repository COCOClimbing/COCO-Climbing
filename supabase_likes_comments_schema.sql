-- Run this in your Supabase SQL editor

-- Likes on sessions
create table if not exists public.session_likes (
  id uuid default gen_random_uuid() primary key,
  session_id text not null,
  user_id uuid references auth.users on delete cascade not null,
  created_at timestamptz default now(),
  constraint unique_session_like unique (session_id, user_id)
);

alter table public.session_likes enable row level security;

create policy "Anyone can view likes" on public.session_likes for select using (true);
create policy "Users can like" on public.session_likes for insert with check (auth.uid() = user_id);
create policy "Users can unlike" on public.session_likes for delete using (auth.uid() = user_id);

-- Comments on sessions
create table if not exists public.session_comments (
  id uuid default gen_random_uuid() primary key,
  session_id text not null,
  user_id uuid references auth.users on delete cascade not null,
  text text not null,
  created_at timestamptz default now()
);

alter table public.session_comments enable row level security;

create policy "Anyone can view comments" on public.session_comments for select using (true);
create policy "Users can comment" on public.session_comments for insert with check (auth.uid() = user_id);
create policy "Users can delete own comments" on public.session_comments for delete using (auth.uid() = user_id);
