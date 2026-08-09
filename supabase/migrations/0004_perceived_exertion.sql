-- Captures Strava's athlete-entered RPE (Rate of Perceived Exertion, 1-10)
-- so the Weekly Report can show an "Avg RPE" stat. Strava returns this on the
-- same activity-list payload strava-sync already fetches — no extra API call.

alter table public.activities
  add column if not exists perceived_exertion numeric;

comment on column public.activities.perceived_exertion is
  'Athlete-entered Rate of Perceived Exertion (1-10) from Strava, when set. Null if the athlete didn''t log one.';
