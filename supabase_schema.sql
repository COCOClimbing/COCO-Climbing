-- Run this in your Supabase SQL editor

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text,
  avatar_url text,
  updated_at timestamptz default now()
);

create table if not exists public.sessions (
  id text primary key,
  user_id uuid references auth.users on delete cascade not null,
  date text not null,
  environment text not null default 'indoor',
  location text,
  notes text,
  synced_at timestamptz default now()
);

create table if not exists public.climbs (
  id text primary key,
  user_id uuid references auth.users on delete cascade not null,
  session_id text,
  date text,
  type text,
  outcome text,
  styles jsonb default '[]',
  environment text,
  grade text,
  grade_system text,
  route_name text,
  location text,
  notes text,
  attempts int default 1,
  media_uri text,
  media_type text,
  project_id text,
  project_name text,
  synced_at timestamptz default now()
);

create table if not exists public.projects (
  id text primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  grade text,
  type text,
  styles jsonb default '[]',
  created_at_local text,
  send_date text,
  notes text,
  location text,
  media_uri text,
  media_type text,
  synced_at timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.climbs enable row level security;
alter table public.projects enable row level security;

-- Profiles policies
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Sessions policies
create policy "Users can manage own sessions" on public.sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Climbs policies
create policy "Users can manage own climbs" on public.climbs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Projects policies
create policy "Users can manage own projects" on public.projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
