-- Initial schema for Accidental Running App
-- Mirrors the migration applied via Supabase MCP to project hvhmzxbrilsrpvukuwog

create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  timezone text default 'Asia/Kuala_Lumpur',
  units text default 'metric',
  resting_hr int,
  max_hr int,
  threshold_pace_sec_per_km int,
  vdot numeric,
  weight_kg numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.race_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  race_date date not null,
  distance_m int,
  distance_label text,
  goal_time_sec int,
  priority text default 'A',
  location text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  race_event_id uuid references public.race_events(id) on delete set null,
  name text,
  methodology text default 'higdon',
  start_date date not null,
  weeks int not null,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  session_date date not null,
  week_index int not null,
  day_index int not null,
  session_type text not null,
  title text,
  planned_distance_m int,
  planned_duration_sec int,
  target_pace_min_sec int,
  target_pace_max_sec int,
  target_hr_zone text,
  structured_steps jsonb,
  description text,
  status text not null default 'planned',
  actual_distance_m int,
  actual_duration_sec int,
  original_session_date date,
  swapped_with_session_id uuid references public.training_sessions(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on public.training_sessions (user_id, session_date);
create index on public.training_sessions (plan_id, week_index, day_index);

create table public.strava_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  athlete_id bigint,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  athlete jsonb,
  last_sync_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.integration_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  strava_client_id text,
  strava_client_secret text,
  anthropic_api_key text,
  updated_at timestamptz default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strava_activity_id bigint unique,
  name text,
  sport_type text,
  start_date timestamptz,
  start_date_local timestamptz,
  local_date date,
  distance_m numeric,
  moving_time_sec int,
  elapsed_time_sec int,
  average_speed_mps numeric,
  average_pace_sec_per_km int,
  average_heartrate numeric,
  max_heartrate numeric,
  total_elevation_gain_m numeric,
  matched_session_id uuid references public.training_sessions(id) on delete set null,
  match_status text,
  raw jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on public.activities (user_id, local_date);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  activity_id uuid references public.activities(id) on delete cascade,
  session_id uuid references public.training_sessions(id) on delete cascade,
  plan_id uuid references public.training_plans(id) on delete cascade,
  insight_date date,
  content text,
  model text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.race_events enable row level security;
alter table public.training_plans enable row level security;
alter table public.training_sessions enable row level security;
alter table public.strava_connections enable row level security;
alter table public.integration_settings enable row level security;
alter table public.activities enable row level security;
alter table public.insights enable row level security;

create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own race_events" on public.race_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own training_plans" on public.training_plans for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own training_sessions" on public.training_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own strava_connections" on public.strava_connections for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own integration_settings" on public.integration_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own activities" on public.activities for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own insights" on public.insights for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
