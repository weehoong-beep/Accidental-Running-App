// Reads the training paces a user's profile already holds.
//
// The physiology math (VDOT, pace derivation, HR zones) lives in one place only:
// src/lib/physiology.ts on the client, which persists its results to the
// `profiles` columns. These functions just read those columns, so there is no
// second implementation of the formulas to keep in sync.

export interface Paces {
  /** Fast end of the easy range, sec/km. */
  easyMin: number
  /** Slow end of the easy range, sec/km. */
  easyMax: number
  marathon: number
  threshold: number
  interval: number
  repetition: number
}

/**
 * Fallback paces for a runner with no profile data yet — the original hardcoded
 * targets for this plan (easy 8:00–8:43, tempo 7:00, interval 6:26 per km).
 */
export const DEFAULT_PACES: Paces = {
  easyMin: 480,
  easyMax: 523,
  marathon: 450,
  threshold: 420,
  interval: 386,
  repetition: 360
}

export interface PaceProfileRow {
  easy_pace_min_sec?: number | null
  easy_pace_max_sec?: number | null
  marathon_pace_sec?: number | null
  threshold_pace_sec_per_km?: number | null
  interval_pace_sec?: number | null
  repetition_pace_sec?: number | null
}

/** Profile paces, falling back per-field so a partly-filled profile still works. */
export function pacesFromProfile(profile: PaceProfileRow | null | undefined): Paces {
  if (!profile) return { ...DEFAULT_PACES }
  return {
    easyMin: profile.easy_pace_min_sec ?? DEFAULT_PACES.easyMin,
    easyMax: profile.easy_pace_max_sec ?? DEFAULT_PACES.easyMax,
    marathon: profile.marathon_pace_sec ?? DEFAULT_PACES.marathon,
    threshold: profile.threshold_pace_sec_per_km ?? DEFAULT_PACES.threshold,
    interval: profile.interval_pace_sec ?? DEFAULT_PACES.interval,
    repetition: profile.repetition_pace_sec ?? DEFAULT_PACES.repetition
  }
}

/** True when the profile carries at least one real pace of its own. */
export function hasOwnPaces(profile: PaceProfileRow | null | undefined): boolean {
  if (!profile) return false
  return [
    profile.easy_pace_min_sec,
    profile.easy_pace_max_sec,
    profile.marathon_pace_sec,
    profile.threshold_pace_sec_per_km,
    profile.interval_pace_sec,
    profile.repetition_pace_sec
  ].some((v) => v != null)
}

/** Pace target a session type should carry, as [min, max] in sec/km. */
export function paceTargetForType(
  sessionType: string,
  p: Paces
): [number | null, number | null] {
  switch (sessionType) {
    case "easy":
    case "long":
      return [p.easyMin, p.easyMax]
    case "tempo":
      return [p.threshold, p.threshold]
    case "interval":
      return [p.interval, p.interval]
    case "race_pace":
      return [p.marathon, p.marathon]
    default:
      // Cross-training, rest, and races carry no pace target.
      return [null, null]
  }
}

/**
 * Heart-rate zone each session type should be run in. Mirrors
 * SESSION_TYPE_HR_ZONE in src/lib/physiology.ts.
 */
export const SESSION_TYPE_HR_ZONE: Record<string, string | null> = {
  easy: "Z2",
  long: "Z2",
  cross_train: "Z2",
  race_pace: "Z3",
  tempo: "Z4",
  interval: "Z5",
  race: "Z4",
  rest: null
}

/** Formats sec/km as m:ss for prompt and description text. */
export function paceStr(secPerKm: number | null | undefined): string {
  if (!secPerKm) return "unknown"
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${s.toString().padStart(2, "0")}/km`
}
