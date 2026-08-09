-- Weekly Running Report: caches Strava per-point streams for the 3D route
-- ribbon, and lets the AI insight generator write a per-week narrative.
--
-- Motivation: the 3D route ribbon on the new Weekly Report screen needs true
-- per-point GPS/elevation/heart-rate data, which `strava-sync` never fetches
-- (it only pulls the activity-list summary and, for detail, splits/laps/best
-- efforts). Streams are fetched on demand — only for the week a user actually
-- opens a report for — by the new `fetch-week-streams` Edge Function, and
-- cached here so repeat views don't re-hit Strava's API.

alter table public.activities
  add column if not exists stream_data jsonb;

comment on column public.activities.stream_data is
  'Cached Strava GET /activities/{id}/streams response (latlng, altitude, heartrate, distance, time), fetched on demand by fetch-week-streams. Null = not yet fetched.';

alter table public.insights
  add column if not exists week_index int;

comment on column public.insights.week_index is
  'Set together with plan_id for kind=''week'' narratives — the completed training week this insight summarizes.';

create index if not exists insights_week_lookup_idx
  on public.insights (plan_id, week_index)
  where kind = 'week';
