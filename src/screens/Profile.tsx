import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import {
  useActivePlan,
  useDeletePersonalRecord,
  useInsights,
  usePersonalRecords,
  useProfile,
  useRaceEvent,
  useRecalcPlanPaces,
  useSavePersonalRecord,
  useSetPrimaryRecord,
  useUpdateProfile
} from '@/lib/queries'
import type { HrZoneModel, PaceSource, PersonalRecord, Profile as ProfileRow, Sex } from '@/lib/types'
import {
  ageFromDob,
  bmi,
  equivalentTimes,
  estimatedMaxHr,
  hrZones,
  pacesFromVdot,
  vdotFromRace
} from '@/lib/physiology'
import { durationToString, paceRangeToString, paceToString, parseDuration } from '@/lib/format'
import { Field, Row, Section, inputClass } from '@/components/SettingsSection'
import { PageTransition } from '@/components/layout/PageTransition'

/** Distances offered for hand-entered records, mirroring Strava's best-effort set. */
const PR_DISTANCES = [
  { label: '1 Mile', distanceM: 1609 },
  { label: '5K', distanceM: 5000 },
  { label: '10K', distanceM: 10000 },
  { label: '15K', distanceM: 15000 },
  { label: '10 Mile', distanceM: 16093 },
  { label: 'Half Marathon', distanceM: 21097 },
  { label: 'Marathon', distanceM: 42195 }
]

export function Profile() {
  const { user } = useAuth()
  const { data: profile } = useProfile(user?.id)
  const { data: records = [] } = usePersonalRecords(user?.id)
  const { data: plan } = useActivePlan(user?.id)
  const { data: race } = useRaceEvent(plan?.race_event_id)
  const { data: insights = [] } = useInsights(user?.id)
  const updateProfile = useUpdateProfile()
  const setPrimary = useSetPrimaryRecord()
  const deleteRecord = useDeletePersonalRecord()
  const recalc = useRecalcPlanPaces()

  const [editing, setEditing] = useState<PersonalRecord | 'new' | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null)

  // ---- The record that drives derived paces -------------------------------
  // Prefer an explicitly chosen record; otherwise fall back to the one implying
  // the highest VDOT, so a fresh import produces something sensible immediately.
  const primaryRecord = useMemo(() => {
    if (records.length === 0) return null
    const chosen = records.find((r) => r.is_primary)
    if (chosen) return chosen
    return records.reduce((best, r) => {
      const a = vdotFromRace(r.distance_m, r.time_sec) ?? 0
      const b = vdotFromRace(best.distance_m, best.time_sec) ?? 0
      return a > b ? r : best
    })
  }, [records])

  const derivedVdot = primaryRecord
    ? vdotFromRace(primaryRecord.distance_m, primaryRecord.time_sec)
    : null
  const derivedPaces = derivedVdot ? pacesFromVdot(derivedVdot) : null

  const paceSource: PaceSource = profile?.pace_source ?? 'derived'

  // Paces actually in force: the stored columns in manual mode, the derivation
  // otherwise.
  const paces = useMemo(() => {
    if (paceSource === 'manual' && profile) {
      return {
        easyMin: profile.easy_pace_min_sec,
        easyMax: profile.easy_pace_max_sec,
        marathon: profile.marathon_pace_sec,
        threshold: profile.threshold_pace_sec_per_km,
        interval: profile.interval_pace_sec,
        repetition: profile.repetition_pace_sec
      }
    }
    return derivedPaces
  }, [paceSource, profile, derivedPaces])

  const effectiveVdot = paceSource === 'manual' ? (profile?.vdot ?? null) : derivedVdot

  // Persist derived values so the Edge Functions can read paces straight from
  // `profiles` without duplicating the physiology math server-side.
  useEffect(() => {
    if (!user || !profile || paceSource !== 'derived' || !derivedPaces || derivedVdot == null) return
    const roundedVdot = Math.round(derivedVdot * 10) / 10
    const alreadyStored =
      profile.easy_pace_min_sec === derivedPaces.easyMin &&
      profile.easy_pace_max_sec === derivedPaces.easyMax &&
      profile.marathon_pace_sec === derivedPaces.marathon &&
      profile.threshold_pace_sec_per_km === derivedPaces.threshold &&
      profile.interval_pace_sec === derivedPaces.interval &&
      profile.repetition_pace_sec === derivedPaces.repetition &&
      profile.vdot === roundedVdot
    if (alreadyStored || updateProfile.isPending) return
    updateProfile.mutate({
      userId: user.id,
      vdot: roundedVdot,
      easy_pace_min_sec: derivedPaces.easyMin,
      easy_pace_max_sec: derivedPaces.easyMax,
      marathon_pace_sec: derivedPaces.marathon,
      threshold_pace_sec_per_km: derivedPaces.threshold,
      interval_pace_sec: derivedPaces.interval,
      repetition_pace_sec: derivedPaces.repetition
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile, paceSource, derivedPaces, derivedVdot])

  const zones = hrZones({
    maxHr: profile?.max_hr,
    restingHr: profile?.resting_hr,
    lthr: profile?.lthr,
    model: profile?.hr_zone_model
  })

  const staleCount = insights.filter((i) => i.is_stale).length

  function flash(msg: string) {
    setSavedMsg(msg)
    setTimeout(() => setSavedMsg(null), 2500)
  }

  async function handleRecalc() {
    if (!plan) return
    setRecalcMsg(null)
    try {
      const res = await recalc.mutateAsync(plan.id)
      setRecalcMsg(`Updated ${res.updated} sessions.`)
    } catch (e: any) {
      setRecalcMsg(e.message ?? 'Could not update plan paces')
    }
  }

  if (!profile || !user) {
    return (
      <PageTransition>
        <div className="flex h-64 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-accent-purple" />
        </div>
      </PageTransition>
    )
  }

  const age = ageFromDob(profile.date_of_birth)

  return (
    <PageTransition>
      <div className="px-5 pt-6 pb-10 safe-top">
        <div className="flex items-center gap-3">
          <Link to="/settings" className="text-slate-400" aria-label="Back to settings">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <h1 className="text-xl font-extrabold">Runner profile</h1>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Your numbers drive every pace target in the plan and the AI coaching.
        </p>

        <AboutYou profile={profile} userId={user.id} onSaved={() => flash('Profile saved')} />

        <HeartRate
          profile={profile}
          userId={user.id}
          age={age}
          zones={zones}
          onSaved={() => flash('Heart rate saved')}
        />

        {/* ---- Personal records ---- */}
        <Section title="Personal records">
          <p className="text-xs leading-relaxed text-slate-400">
            One race result is enough — it sets your VDOT, which in turn sets every training
            pace. Connect Strava and your best efforts import automatically.
          </p>

          {records.length === 0 && (
            <p className="mt-3 text-sm text-slate-500">No records yet.</p>
          )}

          <div className="mt-3 space-y-2">
            {records.map((r) => {
              const v = vdotFromRace(r.distance_m, r.time_sec)
              const isPrimary = primaryRecord?.id === r.id
              return (
                <div
                  key={r.id}
                  className={`rounded-xl border p-3 ${
                    isPrimary ? 'border-accent-purple/40 bg-accent-purple/10' : 'border-white/10 bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">
                        {r.distance_label} · {durationToString(r.time_sec)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {r.achieved_on ?? 'date unknown'}
                        {r.race_name ? ` · ${r.race_name}` : ''}
                        {v ? ` · VDOT ${v.toFixed(1)}` : ''}
                      </p>
                    </div>
                    <span
                      className={`pill ${
                        r.source === 'strava'
                          ? 'bg-[#FC4C02]/15 text-[#FC4C02]'
                          : 'bg-white/8 text-slate-300'
                      }`}
                    >
                      {r.source === 'strava' ? 'Strava' : 'Manual'}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => setPrimary.mutate({ userId: user.id, id: r.id })}
                      disabled={isPrimary || setPrimary.isPending}
                      className="flex-1 rounded-lg bg-white/8 py-1.5 text-[11px] font-medium disabled:opacity-40"
                    >
                      {isPrimary ? 'Setting my paces' : 'Use for my paces'}
                    </button>
                    {r.source === 'manual' && (
                      <button
                        onClick={() => setEditing(r)}
                        className="rounded-lg bg-white/8 px-3 py-1.5 text-[11px] font-medium"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => deleteRecord.mutate(r.id)}
                      className="rounded-lg bg-white/8 px-3 py-1.5 text-[11px] font-medium text-rose-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <button
            onClick={() => setEditing('new')}
            className="mt-3 w-full rounded-xl bg-white/8 py-2.5 text-sm font-medium"
          >
            Add a record
          </button>
        </Section>

        {/* ---- Training paces ---- */}
        <Section title="Training paces">
          <div className="flex gap-1 rounded-xl bg-white/5 p-1">
            {(['derived', 'manual'] as PaceSource[]).map((s) => (
              <button
                key={s}
                onClick={() => {
                  // Seed the manual fields from the derivation so switching over
                  // starts from the computed values rather than blanks.
                  const seed =
                    s === 'manual' && derivedPaces
                      ? {
                          easy_pace_min_sec: paces?.easyMin ?? derivedPaces.easyMin,
                          easy_pace_max_sec: paces?.easyMax ?? derivedPaces.easyMax,
                          marathon_pace_sec: paces?.marathon ?? derivedPaces.marathon,
                          threshold_pace_sec_per_km: paces?.threshold ?? derivedPaces.threshold,
                          interval_pace_sec: paces?.interval ?? derivedPaces.interval,
                          repetition_pace_sec: paces?.repetition ?? derivedPaces.repetition
                        }
                      : {}
                  updateProfile.mutate({ userId: user.id, pace_source: s, ...seed })
                }}
                className={`flex-1 rounded-lg py-2 text-xs font-medium capitalize transition-colors ${
                  paceSource === s ? 'bg-white/10 text-white' : 'text-slate-400'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs text-slate-400">
            {paceSource === 'derived'
              ? primaryRecord
                ? `Derived from your ${primaryRecord.distance_label} in ${durationToString(primaryRecord.time_sec)} — VDOT ${effectiveVdot?.toFixed(1)}.`
                : 'Add a personal record to derive your paces.'
              : 'Manual paces override the derivation. Records no longer change these.'}
          </p>

          {paceSource === 'derived' ? (
            <div className="mt-3">
              <Row label="Easy" value={paceRangeToString(paces?.easyMin, paces?.easyMax)} />
              <Row label="Marathon" value={paceToString(paces?.marathon)} />
              <Row label="Threshold / tempo" value={paceToString(paces?.threshold)} />
              <Row label="Interval" value={paceToString(paces?.interval)} />
              <Row label="Repetition" value={paceToString(paces?.repetition)} />
            </div>
          ) : (
            <ManualPaces profile={profile} userId={user.id} onSaved={() => flash('Paces saved')} />
          )}

          {plan && paces?.easyMin && (
            <>
              <button
                onClick={handleRecalc}
                disabled={recalc.isPending}
                className="mt-4 w-full rounded-xl bg-accent-gradient py-3 text-sm font-semibold text-black disabled:opacity-60"
              >
                {recalc.isPending ? 'Updating…' : 'Update my plan paces'}
              </button>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                Rewrites pace targets on every session in your plan, including ones you have
                already completed.
              </p>
              {recalcMsg && <p className="mt-2 text-xs text-emerald-400">{recalcMsg}</p>}
              {staleCount > 0 && (
                <p className="mt-2 text-xs text-amber-300">
                  {staleCount} AI {staleCount === 1 ? 'analysis was' : 'analyses were'} written
                  against your old paces. Regenerate {staleCount === 1 ? 'it' : 'them'} from the
                  Runs tab.
                </p>
              )}
            </>
          )}
        </Section>

        {/* ---- Race predictions ---- */}
        {effectiveVdot != null && (
          <Section title="Race predictions">
            <p className="text-xs text-slate-400">
              Equivalent performances at VDOT {effectiveVdot.toFixed(1)}.
            </p>
            <div className="mt-3">
              {equivalentTimes(effectiveVdot).map((eq) => {
                const isGoalRace = race?.distance_m != null && Math.abs(race.distance_m - eq.distanceM) < 500
                const delta =
                  isGoalRace && race?.goal_time_sec ? race.goal_time_sec - eq.timeSec : null
                return (
                  <div key={eq.label}>
                    <Row
                      label={eq.label}
                      value={
                        <span className={isGoalRace ? 'text-accent-teal' : undefined}>
                          {durationToString(eq.timeSec)}
                        </span>
                      }
                    />
                    {delta != null && (
                      <p className="pb-1 text-[11px] leading-relaxed text-slate-400">
                        {delta > 0 ? (
                          <>
                            Your {race?.name} goal of {durationToString(race!.goal_time_sec!)} is{' '}
                            <span className="text-emerald-300">
                              {durationToString(delta)} slower
                            </span>{' '}
                            than this — comfortably within reach.
                          </>
                        ) : delta < 0 ? (
                          <>
                            Your {race?.name} goal of {durationToString(race!.goal_time_sec!)} is{' '}
                            <span className="text-amber-300">
                              {durationToString(Math.abs(delta))} faster
                            </span>{' '}
                            than your current fitness predicts.
                          </>
                        ) : (
                          <>Your goal matches your current fitness exactly.</>
                        )}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {savedMsg && <p className="mt-3 text-center text-xs text-emerald-400">{savedMsg}</p>}
      </div>

      <AnimatePresence>
        {editing && (
          <RecordSheet
            userId={user.id}
            record={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </PageTransition>
  )
}

// ---------------------------------------------------------------------------
// About you
// ---------------------------------------------------------------------------

function AboutYou({
  profile,
  userId,
  onSaved
}: {
  profile: ProfileRow
  userId: string
  onSaved: () => void
}) {
  const update = useUpdateProfile()
  const [form, setForm] = useState({
    full_name: profile.full_name ?? '',
    date_of_birth: profile.date_of_birth ?? '',
    sex: (profile.sex ?? 'unspecified') as Sex,
    height_cm: profile.height_cm?.toString() ?? '',
    weight_kg: profile.weight_kg?.toString() ?? '',
    units: profile.units ?? 'metric',
    timezone: profile.timezone ?? 'Asia/Kuala_Lumpur'
  })

  const age = ageFromDob(form.date_of_birth || null)
  const index = bmi(Number(form.weight_kg) || null, Number(form.height_cm) || null)

  async function save() {
    await update.mutateAsync({
      userId,
      full_name: form.full_name.trim() || null,
      date_of_birth: form.date_of_birth || null,
      sex: form.sex,
      height_cm: form.height_cm ? Number(form.height_cm) : null,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      units: form.units,
      timezone: form.timezone.trim() || 'Asia/Kuala_Lumpur'
    })
    onSaved()
  }

  return (
    <Section title="About you">
      <Field label="Name">
        <input
          className={inputClass}
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
        />
      </Field>
      <Field label="Date of birth" hint={age != null ? `${age} years old` : undefined}>
        <input
          type="date"
          className={inputClass}
          value={form.date_of_birth}
          onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
        />
      </Field>
      <Field label="Sex" hint="Used for heart-rate and VDOT context.">
        <select
          className={inputClass}
          value={form.sex}
          onChange={(e) => setForm({ ...form, sex: e.target.value as Sex })}
        >
          <option value="unspecified">Prefer not to say</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
        </select>
      </Field>
      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Height (cm)">
            <input
              type="number"
              inputMode="decimal"
              className={inputClass}
              value={form.height_cm}
              onChange={(e) => setForm({ ...form, height_cm: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Weight (kg)">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              className={inputClass}
              value={form.weight_kg}
              onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
            />
          </Field>
        </div>
      </div>
      {index != null && (
        <p className="mt-1.5 text-[11px] text-slate-500">BMI {index}</p>
      )}
      <Field label="Units">
        <select
          className={inputClass}
          value={form.units}
          onChange={(e) => setForm({ ...form, units: e.target.value })}
        >
          <option value="metric">Metric (km)</option>
          <option value="imperial">Imperial (miles)</option>
        </select>
      </Field>
      <Field label="Timezone">
        <input
          className={inputClass}
          value={form.timezone}
          onChange={(e) => setForm({ ...form, timezone: e.target.value })}
        />
      </Field>
      <button
        onClick={save}
        disabled={update.isPending}
        className="mt-3 w-full rounded-xl bg-white/8 py-2.5 text-sm font-medium disabled:opacity-60"
      >
        {update.isPending ? 'Saving…' : 'Save'}
      </button>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Heart rate
// ---------------------------------------------------------------------------

function HeartRate({
  profile,
  userId,
  age,
  zones,
  onSaved
}: {
  profile: ProfileRow
  userId: string
  age: number | null
  zones: ReturnType<typeof hrZones>
  onSaved: () => void
}) {
  const update = useUpdateProfile()
  const [form, setForm] = useState({
    resting_hr: profile.resting_hr?.toString() ?? '',
    max_hr: profile.max_hr?.toString() ?? '',
    lthr: profile.lthr?.toString() ?? '',
    hr_zone_model: (profile.hr_zone_model ?? 'karvonen') as HrZoneModel
  })

  const estimate = age != null ? estimatedMaxHr(age) : null

  async function save() {
    await update.mutateAsync({
      userId,
      resting_hr: form.resting_hr ? Number(form.resting_hr) : null,
      max_hr: form.max_hr ? Number(form.max_hr) : null,
      lthr: form.lthr ? Number(form.lthr) : null,
      hr_zone_model: form.hr_zone_model
    })
    onSaved()
  }

  return (
    <Section title="Heart rate">
      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="Resting HR">
            <input
              type="number"
              inputMode="numeric"
              className={inputClass}
              value={form.resting_hr}
              onChange={(e) => setForm({ ...form, resting_hr: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Max HR">
            <input
              type="number"
              inputMode="numeric"
              className={inputClass}
              value={form.max_hr}
              onChange={(e) => setForm({ ...form, max_hr: e.target.value })}
            />
          </Field>
        </div>
      </div>
      {!form.max_hr && estimate != null && (
        <button
          onClick={() => setForm({ ...form, max_hr: String(estimate) })}
          className="mt-2 text-[11px] text-accent-teal underline"
        >
          Use age estimate ({estimate} bpm)
        </button>
      )}
      <Field label="Threshold HR (LTHR)" hint="Average HR over a hard 30-minute effort, if you know it.">
        <input
          type="number"
          inputMode="numeric"
          className={inputClass}
          value={form.lthr}
          onChange={(e) => setForm({ ...form, lthr: e.target.value })}
        />
      </Field>
      <Field label="Zone model">
        <select
          className={inputClass}
          value={form.hr_zone_model}
          onChange={(e) => setForm({ ...form, hr_zone_model: e.target.value as HrZoneModel })}
        >
          <option value="karvonen">Heart-rate reserve (Karvonen)</option>
          <option value="max_hr">Percentage of max HR</option>
          <option value="lthr">Percentage of threshold HR</option>
        </select>
      </Field>
      <button
        onClick={save}
        disabled={update.isPending}
        className="mt-3 w-full rounded-xl bg-white/8 py-2.5 text-sm font-medium disabled:opacity-60"
      >
        {update.isPending ? 'Saving…' : 'Save'}
      </button>

      {zones.length > 0 ? (
        <div className="mt-4 border-t border-white/5 pt-3">
          {zones.map((z) => (
            <Row
              key={z.short}
              label={`${z.short} · ${z.label}`}
              value={z.max == null ? `${z.min}+ bpm` : `${z.min}–${z.max} bpm`}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          Enter the values your chosen model needs to see your zones.
        </p>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Manual pace entry
// ---------------------------------------------------------------------------

const MANUAL_PACE_FIELDS = [
  { key: 'easy_pace_min_sec', label: 'Easy — fast end' },
  { key: 'easy_pace_max_sec', label: 'Easy — slow end' },
  { key: 'marathon_pace_sec', label: 'Marathon' },
  { key: 'threshold_pace_sec_per_km', label: 'Threshold / tempo' },
  { key: 'interval_pace_sec', label: 'Interval' },
  { key: 'repetition_pace_sec', label: 'Repetition' }
] as const

function ManualPaces({
  profile,
  userId,
  onSaved
}: {
  profile: ProfileRow
  userId: string
  onSaved: () => void
}) {
  const update = useUpdateProfile()
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      MANUAL_PACE_FIELDS.map(({ key }) => {
        const sec = profile[key] as number | null
        return [key, sec ? durationToString(sec) : '']
      })
    )
  )
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const patch: Record<string, number | null> = {}
    for (const { key, label } of MANUAL_PACE_FIELDS) {
      const raw = form[key]?.trim()
      if (!raw) {
        patch[key] = null
        continue
      }
      const sec = parseDuration(raw)
      if (sec == null) {
        setError(`${label}: use m:ss, e.g. 5:30`)
        return
      }
      patch[key] = sec
    }
    setError(null)
    await update.mutateAsync({ userId, ...patch })
    onSaved()
  }

  return (
    <div className="mt-3">
      {MANUAL_PACE_FIELDS.map(({ key, label }) => (
        <Field key={key} label={`${label} (min:sec per km)`}>
          <input
            className={inputClass}
            placeholder="5:30"
            value={form[key]}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          />
        </Field>
      ))}
      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
      <button
        onClick={save}
        disabled={update.isPending}
        className="mt-3 w-full rounded-xl bg-white/8 py-2.5 text-sm font-medium disabled:opacity-60"
      >
        {update.isPending ? 'Saving…' : 'Save paces'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add / edit a record
// ---------------------------------------------------------------------------

function RecordSheet({
  userId,
  record,
  onClose
}: {
  userId: string
  record: PersonalRecord | null
  onClose: () => void
}) {
  const save = useSavePersonalRecord()
  const [distanceM, setDistanceM] = useState(record?.distance_m ?? 10000)
  const [time, setTime] = useState(record ? durationToString(record.time_sec) : '')
  const [achievedOn, setAchievedOn] = useState(record?.achieved_on ?? '')
  const [raceName, setRaceName] = useState(record?.race_name ?? '')
  const [error, setError] = useState<string | null>(null)

  const timeSec = parseDuration(time)
  const preview = timeSec ? vdotFromRace(distanceM, timeSec) : null

  async function handleSave() {
    if (!timeSec) {
      setError('Enter a time as m:ss or h:mm:ss')
      return
    }
    const option = PR_DISTANCES.find((d) => d.distanceM === distanceM)
    setError(null)
    try {
      await save.mutateAsync({
        user_id: userId,
        distance_m: distanceM,
        distance_label: option?.label ?? `${(distanceM / 1000).toFixed(1)}K`,
        time_sec: timeSec,
        achieved_on: achievedOn || null,
        race_name: raceName.trim() || null,
        source: 'manual'
      })
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Could not save record')
    }
  }

  return (
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-bg-900 p-5 safe-bottom"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />
        <p className="text-center text-sm font-semibold">
          {record ? 'Edit record' : 'Add a record'}
        </p>

        <Field label="Distance">
          <select
            className={inputClass}
            value={distanceM}
            onChange={(e) => setDistanceM(Number(e.target.value))}
          >
            {PR_DISTANCES.map((d) => (
              <option key={d.distanceM} value={d.distanceM}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Time"
          hint={preview ? `VDOT ${preview.toFixed(1)}` : 'e.g. 48:20 or 1:52:30'}
        >
          <input
            className={inputClass}
            placeholder="48:20"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
        <Field label="Date">
          <input
            type="date"
            className={inputClass}
            value={achievedOn}
            onChange={(e) => setAchievedOn(e.target.value)}
          />
        </Field>
        <Field label="Race name (optional)">
          <input
            className={inputClass}
            placeholder="KL Marathon 10K"
            value={raceName}
            onChange={(e) => setRaceName(e.target.value)}
          />
        </Field>

        {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}

        <button
          onClick={handleSave}
          disabled={save.isPending}
          className="mt-4 w-full rounded-xl bg-accent-gradient py-3 text-sm font-semibold text-black disabled:opacity-60"
        >
          {save.isPending ? 'Saving…' : 'Save record'}
        </button>
        <button onClick={onClose} className="mt-2 w-full py-2 text-xs text-slate-500">
          Cancel
        </button>
      </motion.div>
    </>
  )
}
