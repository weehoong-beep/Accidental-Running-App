-- Runner profile details, personal records, and richer Strava activity data.
--
-- Motivation: profiles already declared resting_hr / max_hr /
-- threshold_pace_sec_per_km / vdot / weight_kg but nothing wrote them, and there
-- was no way to record a race result. Training paces were hardcoded constants in
-- the seed-plan function. These columns let a single race record drive VDOT,
-- training paces, and heart-rate zones for the whole plan.

-- ---------------------------------------------------------------------------
-- profiles: physical details, HR references, and pace overrides
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists height_cm numeric,
  add column if not exists date_of_birth date,
  add column if not exists sex text,
  add column if not exists lthr int,
  add column if not exists hr_zone_model text default 'karvonen',
  add column if not exists pace_source text default 'derived',
  add column if not exists easy_pace_min_sec int,
  add column if not exists easy_pace_max_sec int,
  add column if not exists marathon_pace_sec int,
  add column if not exists interval_pace_sec int,
  add column if not exists repetition_pace_sec int,
  add column if not exists long_run_day int default 6,
  add column if not exists days_per_week int default 5;

alter table public.profiles
  add constraint profiles_sex_check
    check (sex is null or sex in ('male', 'female', 'unspecified')),
  add constraint profiles_hr_zone_model_check
    check (hr_zone_model in ('max_hr', 'karvonen', 'lthr')),
  add constraint profiles_pace_source_check
    check (pace_source in ('derived', 'manual')),
  add constraint profiles_long_run_day_check
    check (long_run_day is null or long_run_day between 0 and 6);

comment on column public.profiles.lthr is 'Lactate threshold heart rate, bpm';
comment on column public.profiles.hr_zone_model is 'Which formula hrZones() uses: max_hr | karvonen | lthr';
comment on column public.profiles.pace_source is 'derived = compute from primary personal record; manual = use the *_pace_* columns';
comment on column public.profiles.long_run_day is '0 = Monday .. 6 = Sunday';

-- ---------------------------------------------------------------------------
-- personal_records: race results, entered by hand or imported from Strava
-- ---------------------------------------------------------------------------
create table if not exists public.personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  distance_m int not null,
  distance_label text not null,
  time_sec int not null,
  achieved_on date,
  source text not null default 'manual',
  strava_activity_id bigint,
  race_name text,
  is_primary boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint personal_records_source_check check (source in ('manual', 'strava')),
  constraint personal_records_distance_check check (distance_m > 0),
  constraint personal_records_time_check check (time_sec > 0),
  -- a Strava-imported record must say which activity it came from
  constraint personal_records_strava_activity_check
    check (source <> 'strava' or strava_activity_id is not null)
);

-- One hand-entered row and one imported row per distance: editing replaces
-- rather than stacks, and a re-sync updates the imported best rather than adding
-- a row per activity. Kept as a plain (non-partial) index so PostgREST can infer
-- it as an upsert conflict target.
create unique index if not exists personal_records_distance_source_uniq
  on public.personal_records (user_id, distance_m, source);
-- Supports "fastest effort per distance" lookups.
create index if not exists personal_records_best_idx
  on public.personal_records (user_id, distance_m, time_sec);

alter table public.personal_records enable row level security;

create policy "own personal_records" on public.personal_records
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- activities: fields the list endpoint returns but we were discarding, plus a
-- marker for the rate-limited per-activity detail fetch
-- ---------------------------------------------------------------------------
alter table public.activities
  add column if not exists fetched_detail_at timestamptz,
  add column if not exists workout_type int,
  add column if not exists average_cadence numeric,
  add column if not exists average_temp numeric,
  add column if not exists suffer_score numeric,
  add column if not exists gear_id text;

comment on column public.activities.fetched_detail_at is
  'When GET /activities/{id} was last merged into raw. Null = detail (best_efforts, laps, splits) not yet fetched.';
comment on column public.activities.workout_type is
  'Strava workout_type for runs: 0 default, 1 race, 2 long run, 3 workout';
comment on column public.activities.average_cadence is
  'True steps per minute. Strava reports one leg, so sync stores its value doubled.';

-- Finds the next batch of runs needing a detail fetch.
create index if not exists activities_detail_pending_idx
  on public.activities (user_id, start_date_local desc)
  where fetched_detail_at is null;

-- ---------------------------------------------------------------------------
-- insights: mark analyses written against superseded pace targets
-- ---------------------------------------------------------------------------
alter table public.insights
  add column if not exists is_stale boolean default false;

comment on column public.insights.is_stale is
  'True when plan pace targets were recalculated after this analysis was generated.';
