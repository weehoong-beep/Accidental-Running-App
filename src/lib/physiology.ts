/**
 * Running physiology math — VDOT, training paces, race equivalents, HR zones.
 *
 * Pure functions, no I/O. This is the single implementation of these formulas in
 * the app: the Profile screen computes with them and persists the results to
 * `profiles` (vdot, easy_pace_min_sec, …), so the Edge Functions only ever read
 * stored columns and never re-derive anything.
 *
 * VDOT and pace derivation follow Jack Daniels & Jimmy Gilbert's model as
 * published in Daniels' Running Formula.
 */

/** Coefficients of the Daniels/Gilbert oxygen-cost curve, VO2 as a function of velocity. */
const VO2_C = -4.6
const VO2_B = 0.182258
const VO2_A = 0.000104

/**
 * Fraction of VO2max sustainable for a given duration. Falls from ~1.0 at a few
 * minutes toward ~0.8 for very long efforts.
 */
function fractionOfVo2max(minutes: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * minutes) +
    0.2989558 * Math.exp(-0.1932605 * minutes)
  )
}

/** Oxygen cost (ml/kg/min) of running at `metersPerMin`. */
function vo2AtVelocity(metersPerMin: number): number {
  return VO2_C + VO2_B * metersPerMin + VO2_A * metersPerMin * metersPerMin
}

/**
 * Velocity (m/min) at a given oxygen cost — the inverse of `vo2AtVelocity`,
 * taking the positive root of the quadratic.
 */
function velocityAtVo2(vo2: number): number {
  const discriminant = VO2_B * VO2_B + 4 * VO2_A * (vo2 - VO2_C)
  if (discriminant <= 0) return 0
  return (-VO2_B + Math.sqrt(discriminant)) / (2 * VO2_A)
}

/**
 * VDOT implied by a race performance.
 *
 * A 5K in 20:00 gives ~49.8; a 10K in 40:00 gives ~51.9.
 */
export function vdotFromRace(distanceM: number, timeSec: number): number | null {
  if (!(distanceM > 0) || !(timeSec > 0)) return null
  const minutes = timeSec / 60
  const metersPerMin = distanceM / minutes
  const vo2 = vo2AtVelocity(metersPerMin)
  const fraction = fractionOfVo2max(minutes)
  if (!(fraction > 0) || !(vo2 > 0)) return null
  return vo2 / fraction
}

/** Pace in seconds per km for a velocity in metres per minute. */
function paceFromVelocity(metersPerMin: number): number {
  if (!(metersPerMin > 0)) return 0
  return 60000 / metersPerMin
}

/**
 * Intensity of each training zone as a fraction of VO2max.
 *
 * Calibrated against Daniels' published pace tables rather than the wider
 * textbook bands — e.g. at VDOT 50 these yield E 5:38–5:07, M 4:29, T 4:15,
 * I 3:50, R 3:30 per km.
 */
export const INTENSITY = {
  easySlow: 0.62,
  easyFast: 0.7,
  marathon: 0.825,
  threshold: 0.88,
  interval: 1.0,
  repetition: 1.12
} as const

export interface TrainingPaces {
  /** Fast end of the easy range, sec/km (the smaller number). */
  easyMin: number
  /** Slow end of the easy range, sec/km (the larger number). */
  easyMax: number
  marathon: number
  threshold: number
  interval: number
  repetition: number
}

/** Training paces in seconds per km for a given VDOT. */
export function pacesFromVdot(vdot: number): TrainingPaces | null {
  if (!(vdot > 0)) return null
  const paceAt = (fraction: number) =>
    Math.round(paceFromVelocity(velocityAtVo2(vdot * fraction)))
  return {
    easyMin: paceAt(INTENSITY.easyFast),
    easyMax: paceAt(INTENSITY.easySlow),
    marathon: paceAt(INTENSITY.marathon),
    threshold: paceAt(INTENSITY.threshold),
    interval: paceAt(INTENSITY.interval),
    repetition: paceAt(INTENSITY.repetition)
  }
}

/**
 * Race time at `toDistanceM` predicted from a performance at `fromDistanceM`,
 * using Peter Riegel's endurance model: T2 = T1 * (D2/D1)^1.06.
 */
export function predictTime(
  fromDistanceM: number,
  fromTimeSec: number,
  toDistanceM: number
): number | null {
  if (!(fromDistanceM > 0) || !(fromTimeSec > 0) || !(toDistanceM > 0)) return null
  return Math.round(fromTimeSec * Math.pow(toDistanceM / fromDistanceM, 1.06))
}

/**
 * Time to cover `distanceM` at a given VDOT.
 *
 * `vdotFromRace` decreases monotonically as time grows for a fixed distance, so
 * a bisection converges reliably. Bounds span a 30 s/km to 30 min/km pace.
 */
export function timeForDistanceAtVdot(vdot: number, distanceM: number): number | null {
  if (!(vdot > 0) || !(distanceM > 0)) return null
  let low = (distanceM / 1000) * 30
  let high = (distanceM / 1000) * 1800
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2
    const guess = vdotFromRace(distanceM, mid)
    if (guess == null) return null
    if (guess > vdot) low = mid
    else high = mid
  }
  return Math.round((low + high) / 2)
}

export const RACE_DISTANCES: { label: string; distanceM: number }[] = [
  { label: '5K', distanceM: 5000 },
  { label: '10K', distanceM: 10000 },
  { label: '15K', distanceM: 15000 },
  { label: 'Half Marathon', distanceM: 21097 },
  { label: 'Marathon', distanceM: 42195 }
]

export interface EquivalentTime {
  label: string
  distanceM: number
  timeSec: number
}

/** Equivalent race times across standard distances for a given VDOT. */
export function equivalentTimes(vdot: number): EquivalentTime[] {
  if (!(vdot > 0)) return []
  return RACE_DISTANCES.flatMap(({ label, distanceM }) => {
    const timeSec = timeForDistanceAtVdot(vdot, distanceM)
    return timeSec == null ? [] : [{ label, distanceM, timeSec }]
  })
}

// ---------------------------------------------------------------------------
// Heart rate
// ---------------------------------------------------------------------------

export type HrZoneModel = 'max_hr' | 'karvonen' | 'lthr'

export interface HrZone {
  label: string
  /** Short name, e.g. "Z2". */
  short: string
  /** Lower bound in bpm, inclusive. */
  min: number
  /** Upper bound in bpm. `null` on the top zone, which is open-ended. */
  max: number | null
}

const ZONE_NAMES = [
  { short: 'Z1', label: 'Recovery' },
  { short: 'Z2', label: 'Easy / aerobic' },
  { short: 'Z3', label: 'Steady / marathon' },
  { short: 'Z4', label: 'Threshold' },
  { short: 'Z5', label: 'VO2max' }
] as const

/** Zone edges as fractions, indexed to match ZONE_NAMES. */
const ZONE_BOUNDS: Record<HrZoneModel, number[]> = {
  // Percentage of maximum heart rate.
  max_hr: [0.5, 0.6, 0.7, 0.8, 0.9],
  // Percentage of heart-rate reserve (Karvonen).
  karvonen: [0.5, 0.6, 0.7, 0.8, 0.9],
  // Percentage of lactate threshold heart rate, after Friel.
  lthr: [0.65, 0.81, 0.9, 0.94, 1.0]
}

export interface HrZoneInput {
  maxHr?: number | null
  restingHr?: number | null
  lthr?: number | null
  model?: HrZoneModel | null
}

/**
 * Five heart-rate training zones.
 *
 * Returns an empty array when the chosen model's required inputs are missing —
 * Karvonen needs both max and resting HR, the LTHR model needs a threshold HR.
 */
export function hrZones({ maxHr, restingHr, lthr, model }: HrZoneInput): HrZone[] {
  const chosen: HrZoneModel = model ?? 'karvonen'

  let toBpm: (fraction: number) => number
  if (chosen === 'lthr') {
    if (!(lthr && lthr > 0)) return []
    toBpm = (f) => lthr * f
  } else if (chosen === 'karvonen') {
    if (!(maxHr && maxHr > 0) || !(restingHr && restingHr > 0) || restingHr >= maxHr) return []
    toBpm = (f) => restingHr + f * (maxHr - restingHr)
  } else {
    if (!(maxHr && maxHr > 0)) return []
    toBpm = (f) => maxHr * f
  }

  const bounds = ZONE_BOUNDS[chosen]
  return ZONE_NAMES.map((zone, i) => ({
    ...zone,
    min: Math.round(toBpm(bounds[i])),
    max: i === ZONE_NAMES.length - 1 ? null : Math.round(toBpm(bounds[i + 1])) - 1
  }))
}

/** The zone a heart rate falls in, or null if it sits below Z1 or zones are unknown. */
export function zoneForHr(bpm: number, zones: HrZone[]): HrZone | null {
  if (!(bpm > 0) || zones.length === 0) return null
  for (let i = zones.length - 1; i >= 0; i--) {
    if (bpm >= zones[i].min) return zones[i]
  }
  return null
}

/**
 * Age-predicted maximum heart rate (Tanaka et al., 2001) — more accurate across
 * adult ages than the old 220-minus-age rule. Only ever a starting estimate;
 * a measured max is always better.
 */
export function estimatedMaxHr(age: number): number | null {
  if (!(age > 0) || age > 120) return null
  return Math.round(208 - 0.7 * age)
}

// ---------------------------------------------------------------------------
// Body metrics
// ---------------------------------------------------------------------------

/** Body mass index, or null if either input is missing. */
export function bmi(weightKg?: number | null, heightCm?: number | null): number | null {
  if (!(weightKg && weightKg > 0) || !(heightCm && heightCm > 0)) return null
  const heightM = heightCm / 100
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10
}

/** Whole years between `dateOfBirth` and `on` (defaults to today). */
export function ageFromDob(dateOfBirth?: string | null, on: Date = new Date()): number | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth + 'T00:00:00')
  if (Number.isNaN(dob.getTime())) return null
  let age = on.getFullYear() - dob.getFullYear()
  const beforeBirthday =
    on.getMonth() < dob.getMonth() ||
    (on.getMonth() === dob.getMonth() && on.getDate() < dob.getDate())
  if (beforeBirthday) age--
  return age >= 0 && age <= 120 ? age : null
}

/**
 * Which zone each session type should be run in. Used to populate
 * `training_sessions.target_hr_zone`, and mirrored in the recalc Edge Function.
 */
export const SESSION_TYPE_HR_ZONE: Record<string, string> = {
  easy: 'Z2',
  long: 'Z2',
  cross_train: 'Z2',
  marathon: 'Z3',
  race_pace: 'Z3',
  tempo: 'Z4',
  interval: 'Z5',
  race: 'Z4',
  rest: ''
}
