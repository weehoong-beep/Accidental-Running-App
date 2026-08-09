/**
 * Pure aggregation for the Weekly Running Report — one completed training
 * week's hero stats, technical analysis, and 3D route-ribbon data. No I/O;
 * `useWeeklyReport` in `queries.ts` supplies already-fetched rows.
 *
 * Split out from `stats.ts` (small, generic chart helpers) because this is a
 * single cohesive multi-metric aggregate with its own types, matching how
 * `physiology.ts`/`polyline.ts` are already split out by concern.
 */
import type {
  Activity,
  ActivityDetail,
  ActivitySplit,
  ActivityStreams,
  Insight,
  PersonalRecord,
  Profile,
  SessionType,
  TrainingSession
} from './types'
import { groupSessionsByWeek, type WeekGroup } from './stats'
import { hrZones, zoneForHr, INTENSITY, type HrZone } from './physiology'
import { cumulativeDistances, decodePolyline } from './polyline'
import { shiftDateString } from './timezone'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeroStats {
  totalDistanceM: number
  totalMovingTimeSec: number
  totalElevationGainM: number
  /** Weighted (totalTime/totalDistance), not a mean of per-run paces. */
  avgPaceSecPerKm: number | null
  runCount: number
  plannedDistanceM: number
  distanceVsPlanPct: number | null
}

export interface RunSplitsSummary {
  activityId: string
  sessionId: string
  sessionType: SessionType
  date: string
  splits: ActivitySplit[]
  /** stdev/mean of split pace. Only computed for easy/long runs, where a flat pace is the goal. */
  paceConsistencyCv: number | null
  /** Back-half average pace minus front-half, seconds/km. Negative = negative split. Tempo/interval/race only. */
  negativeSplitSec: number | null
}

export interface HrZoneBreakdown {
  method: 'split-weighted' | 'activity-weighted' | 'unavailable'
  zones: { short: string; label: string; secondsInZone: number; pct: number }[]
}

export interface CadenceSummary {
  avgCadenceSpm: number
  avgStrideLengthM: number | null
  byActivity: { activityId: string; cadenceSpm: number; strideLengthM: number | null }[]
}

export interface ElevationPaceCorrelation {
  method: 'split-level' | 'activity-level' | 'insufficient-data'
  pearsonR: number | null
  sampleSize: number
  gradeAdjustedAvgPaceSecPerKm: number | null
}

export interface TrainingLoadSummary {
  method: 'suffer-score' | 'estimated' | 'mixed'
  totalLoad: number
  byActivity: { activityId: string; load: number; source: 'suffer-score' | 'estimated' }[]
}

export interface WeekTrendPoint {
  weekIndex: number
  km: number
  load: number
  avgPaceSecPerKm: number | null
  elevationM: number
  completionRate: number
}

export interface RecoveryPattern {
  restDaysPlanned: number
  restDaysTaken: number
  activeRecoveryDays: number
  longestRunStreakDays: number
  minGapBetweenHardSessionsDays: number | null
}

export interface SessionAdherence {
  sessionId: string
  sessionType: SessionType
  distancePct: number | null
  paceInTarget: boolean | null
  paceDeltaSec: number | null
  hrZoneMatch: boolean | null
}

export interface PersonalBestHit {
  distanceLabel: string
  distanceM: number
  timeSec: number
  activityId: string
  achievedOn: string
  confidence: 'confirmed-current-best'
}

export interface RoutePoint {
  lat: number
  lng: number
  /** Cumulative distance from this run's start, meters. */
  distanceM: number
  elevationM: number | null
  paceSecPerKm: number | null
  hr: number | null
  hrZone: string | null
}

export interface WeeklyRouteRibbon {
  activityId: string
  sessionId: string
  sessionType: SessionType
  date: string
  distanceM: number
  points: RoutePoint[]
  /** How the points were derived — see buildRouteRibbons. */
  fidelity: 'stream' | 'split-interpolated' | 'polyline-only'
}

export interface DataQualityFlags {
  hasHeartRateData: boolean
  hasCadenceData: boolean
  hasSplitsForAllRuns: boolean
  hasStreamData: boolean
}

export interface WeeklyReport {
  planId: string
  weekIndex: number
  startDate: string | undefined
  endDate: string | undefined
  isCompleted: boolean

  hero: HeroStats
  splits: RunSplitsSummary[]
  hrZones: HrZoneBreakdown
  cadence: CadenceSummary | null
  elevationPace: ElevationPaceCorrelation
  trainingLoad: TrainingLoadSummary
  trend: WeekTrendPoint[]
  recovery: RecoveryPattern
  planAdherence: SessionAdherence[]
  personalBests: PersonalBestHit[]
  narrative: { content: string; generatedAt: string; isStale: boolean } | null
  routeRibbons: WeeklyRouteRibbon[]
  dataQuality: DataQualityFlags
}

export interface BuildWeeklyReportInput {
  planId: string
  weekIndex: number
  /** All sessions for this plan (not just the target week — trend needs prior weeks). */
  allSessions: TrainingSession[]
  /** All of the user's synced activities. */
  allActivities: Activity[]
  profile: Profile | null
  personalRecords: PersonalRecord[]
  /** The `kind: 'week'` insight for this plan/week, if one has been generated. */
  narrativeInsight: Insight | null
  /** How many prior weeks of trend to include. Default 4. */
  trendWeeks?: number
}

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function pearsonR(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 2) return null
  const meanX = mean(xs)
  const meanY = mean(ys)
  let num = 0
  let denX = 0
  let denY = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  const den = Math.sqrt(denX * denY)
  return den > 0 ? num / den : null
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime()
  const db = new Date(b + 'T00:00:00Z').getTime()
  return Math.round((db - da) / 86400000)
}

function activityDetail(activity: Activity): ActivityDetail {
  return (activity.raw ?? {}) as ActivityDetail
}

function findActivity(sessionId: string, activities: Activity[]): Activity | undefined {
  return activities.find((a) => a.matched_session_id === sessionId)
}

const HARD_SESSION_TYPES = new Set<SessionType>(['tempo', 'interval', 'long', 'race_pace', 'race'])

/**
 * Approximate intensity-to-duration weighting when a run has no Strava
 * Relative Effort (no HR recorded). Reuses `physiology.ts`'s Daniels/Gilbert
 * intensity fractions rather than inventing a new formula; this is a relative
 * estimate, not calibrated to Strava's own suffer-score scale.
 */
const SESSION_TYPE_INTENSITY: Partial<Record<SessionType, number>> = {
  easy: INTENSITY.easySlow,
  long: INTENSITY.easySlow,
  cross_train: INTENSITY.easySlow,
  tempo: INTENSITY.threshold,
  interval: INTENSITY.interval,
  race_pace: INTENSITY.marathon,
  race: INTENSITY.repetition
}

// ---------------------------------------------------------------------------
// Per-metric computation
// ---------------------------------------------------------------------------

function computeHeroStats(sessions: TrainingSession[], activities: Activity[]): HeroStats {
  const runnable = sessions.filter((s) => s.session_type !== 'rest')
  const completed = runnable.filter((s) => s.status === 'completed')

  let totalDistanceM = 0
  let totalMovingTimeSec = 0
  let totalElevationGainM = 0

  for (const s of completed) {
    const activity = findActivity(s.id, activities)
    totalDistanceM += activity?.distance_m ?? s.actual_distance_m ?? s.planned_distance_m ?? 0
    totalMovingTimeSec += activity?.moving_time_sec ?? s.actual_duration_sec ?? s.planned_duration_sec ?? 0
    totalElevationGainM += activity?.total_elevation_gain_m ?? 0
  }

  const plannedDistanceM = runnable.reduce((sum, s) => sum + (s.planned_distance_m ?? 0), 0)

  return {
    totalDistanceM,
    totalMovingTimeSec,
    totalElevationGainM,
    avgPaceSecPerKm: totalDistanceM > 0 ? totalMovingTimeSec / (totalDistanceM / 1000) : null,
    runCount: completed.length,
    plannedDistanceM,
    distanceVsPlanPct: plannedDistanceM > 0 ? (totalDistanceM / plannedDistanceM) * 100 : null
  }
}

function computeSplitsSummary(sessions: TrainingSession[], activities: Activity[]): RunSplitsSummary[] {
  const result: RunSplitsSummary[] = []

  for (const s of sessions) {
    if (s.session_type === 'rest') continue
    const activity = findActivity(s.id, activities)
    if (!activity) continue
    const splits = activityDetail(activity).splits_metric ?? []
    if (splits.length === 0) continue

    const paces = splits.map((sp) => (sp.average_speed > 0 ? 1000 / sp.average_speed : null)).filter((p): p is number => p != null)

    let paceConsistencyCv: number | null = null
    let negativeSplitSec: number | null = null

    if ((s.session_type === 'easy' || s.session_type === 'long') && paces.length >= 2) {
      const m = mean(paces)
      const variance = mean(paces.map((p) => (p - m) ** 2))
      paceConsistencyCv = m > 0 ? Math.sqrt(variance) / m : null
    } else if (paces.length >= 2) {
      const half = Math.floor(paces.length / 2)
      negativeSplitSec = mean(paces.slice(paces.length - half)) - mean(paces.slice(0, half))
    }

    result.push({
      activityId: activity.id,
      sessionId: s.id,
      sessionType: s.session_type,
      date: s.session_date,
      splits,
      paceConsistencyCv,
      negativeSplitSec
    })
  }

  return result
}

function computeHrZoneBreakdown(sessions: TrainingSession[], activities: Activity[], zones: HrZone[]): HrZoneBreakdown {
  if (zones.length === 0) return { method: 'unavailable', zones: [] }

  const secondsInZone = new Map<string, number>()
  let usedSplits = false

  for (const s of sessions) {
    if (s.session_type === 'rest') continue
    const activity = findActivity(s.id, activities)
    if (!activity) continue

    const splits = activityDetail(activity).splits_metric ?? []
    const splitsWithHr = splits.filter((sp) => sp.average_heartrate != null)

    if (splitsWithHr.length > 0) {
      usedSplits = true
      for (const sp of splitsWithHr) {
        const zone = zoneForHr(sp.average_heartrate!, zones)
        if (!zone) continue
        secondsInZone.set(zone.short, (secondsInZone.get(zone.short) ?? 0) + sp.moving_time)
      }
    } else if (activity.average_heartrate != null) {
      const zone = zoneForHr(activity.average_heartrate, zones)
      if (zone) secondsInZone.set(zone.short, (secondsInZone.get(zone.short) ?? 0) + (activity.moving_time_sec ?? 0))
    }
  }

  if (secondsInZone.size === 0) return { method: 'unavailable', zones: [] }

  const totalSec = [...secondsInZone.values()].reduce((a, b) => a + b, 0)
  const rows = zones
    .map((z) => ({
      short: z.short,
      label: z.label,
      secondsInZone: secondsInZone.get(z.short) ?? 0,
      pct: totalSec > 0 ? ((secondsInZone.get(z.short) ?? 0) / totalSec) * 100 : 0
    }))
    .filter((z) => z.secondsInZone > 0)

  return { method: usedSplits ? 'split-weighted' : 'activity-weighted', zones: rows }
}

function computeCadenceSummary(sessions: TrainingSession[], activities: Activity[]): CadenceSummary | null {
  const rows: CadenceSummary['byActivity'] = []

  for (const s of sessions) {
    if (s.session_type === 'rest') continue
    const activity = findActivity(s.id, activities)
    if (!activity || activity.average_cadence == null) continue
    const strideLengthM =
      activity.distance_m && activity.moving_time_sec
        ? activity.distance_m / activity.moving_time_sec / (activity.average_cadence / 60)
        : null
    rows.push({ activityId: activity.id, cadenceSpm: activity.average_cadence, strideLengthM })
  }

  if (rows.length === 0) return null

  const strides = rows.map((r) => r.strideLengthM).filter((x): x is number => x != null)
  return {
    avgCadenceSpm: mean(rows.map((r) => r.cadenceSpm)),
    avgStrideLengthM: strides.length > 0 ? mean(strides) : null,
    byActivity: rows
  }
}

/** Sample-size floor below which a correlation coefficient is too noisy to show. */
const MIN_CORRELATION_SAMPLE = 8

function computeElevationPaceCorrelation(sessions: TrainingSession[], activities: Activity[]): ElevationPaceCorrelation {
  const splitGrades: number[] = []
  const splitPaces: number[] = []
  let gapWeightedSum = 0
  let gapWeightTotal = 0

  for (const s of sessions) {
    if (s.session_type === 'rest') continue
    const activity = findActivity(s.id, activities)
    if (!activity) continue
    const splits = activityDetail(activity).splits_metric ?? []
    for (const sp of splits) {
      if (sp.elevation_difference != null && sp.average_speed > 0) {
        splitGrades.push(sp.elevation_difference)
        splitPaces.push(1000 / sp.average_speed)
      }
      if (sp.average_grade_adjusted_speed && sp.average_grade_adjusted_speed > 0) {
        gapWeightedSum += (1000 / sp.average_grade_adjusted_speed) * sp.distance
        gapWeightTotal += sp.distance
      }
    }
  }

  const gradeAdjustedAvgPaceSecPerKm = gapWeightTotal > 0 ? gapWeightedSum / gapWeightTotal : null

  if (splitGrades.length >= MIN_CORRELATION_SAMPLE) {
    return {
      method: 'split-level',
      pearsonR: pearsonR(splitGrades, splitPaces),
      sampleSize: splitGrades.length,
      gradeAdjustedAvgPaceSecPerKm
    }
  }

  const activityPoints: { elev: number; pace: number }[] = []
  for (const s of sessions) {
    if (s.session_type === 'rest') continue
    const activity = findActivity(s.id, activities)
    if (!activity || activity.total_elevation_gain_m == null || !activity.average_pace_sec_per_km) continue
    activityPoints.push({ elev: activity.total_elevation_gain_m, pace: activity.average_pace_sec_per_km })
  }

  if (activityPoints.length >= MIN_CORRELATION_SAMPLE) {
    return {
      method: 'activity-level',
      pearsonR: pearsonR(
        activityPoints.map((p) => p.elev),
        activityPoints.map((p) => p.pace)
      ),
      sampleSize: activityPoints.length,
      gradeAdjustedAvgPaceSecPerKm
    }
  }

  return {
    method: 'insufficient-data',
    pearsonR: null,
    sampleSize: Math.max(splitGrades.length, activityPoints.length),
    gradeAdjustedAvgPaceSecPerKm
  }
}

function computeTrainingLoad(sessions: TrainingSession[], activities: Activity[]): TrainingLoadSummary {
  const byActivity: TrainingLoadSummary['byActivity'] = []
  let hasSufferScore = false
  let hasEstimated = false

  for (const s of sessions) {
    if (s.session_type === 'rest') continue
    const activity = findActivity(s.id, activities)
    if (!activity) continue

    if (activity.suffer_score != null) {
      byActivity.push({ activityId: activity.id, load: activity.suffer_score, source: 'suffer-score' })
      hasSufferScore = true
    } else {
      const durationSec = activity.moving_time_sec ?? s.actual_duration_sec ?? s.planned_duration_sec ?? 0
      const intensity = SESSION_TYPE_INTENSITY[s.session_type] ?? INTENSITY.easySlow
      byActivity.push({ activityId: activity.id, load: (durationSec / 60) * intensity, source: 'estimated' })
      hasEstimated = true
    }
  }

  const totalLoad = byActivity.reduce((a, b) => a + b.load, 0)
  const method: TrainingLoadSummary['method'] = hasSufferScore && hasEstimated ? 'mixed' : hasSufferScore ? 'suffer-score' : 'estimated'
  return { method, totalLoad, byActivity }
}

function computeTrend(weekIndex: number, weeks: WeekGroup[], allActivities: Activity[], trendWeeks: number): WeekTrendPoint[] {
  return weeks
    .filter((w) => w.week < weekIndex && w.week >= weekIndex - trendWeeks)
    .map((w) => {
      const hero = computeHeroStats(w.sessions, allActivities)
      const load = computeTrainingLoad(w.sessions, allActivities)
      return {
        weekIndex: w.week,
        km: hero.totalDistanceM / 1000,
        load: load.totalLoad,
        avgPaceSecPerKm: hero.avgPaceSecPerKm,
        elevationM: hero.totalElevationGainM,
        completionRate: w.runnable > 0 ? w.completed / w.runnable : 0
      }
    })
}

function computeRecoveryPattern(sessions: TrainingSession[], activities: Activity[]): RecoveryPattern {
  const restSessions = sessions.filter((s) => s.session_type === 'rest')
  const runSessions = sessions.filter((s) => s.session_type !== 'rest')

  let restDaysTaken = 0
  let activeRecoveryDays = 0
  for (const r of restSessions) {
    const hasActivity = activities.some((a) => a.local_date === r.session_date)
    if (hasActivity) activeRecoveryDays++
    else restDaysTaken++
  }

  const runDates = [...new Set(runSessions.filter((s) => s.status === 'completed').map((s) => s.session_date))].sort()
  let longestRunStreakDays = 0
  let current = 0
  let prevDate: string | null = null
  for (const d of runDates) {
    current = prevDate && shiftDateString(prevDate, 1) === d ? current + 1 : 1
    longestRunStreakDays = Math.max(longestRunStreakDays, current)
    prevDate = d
  }

  const hardDates = sessions
    .filter((s) => HARD_SESSION_TYPES.has(s.session_type))
    .map((s) => s.session_date)
    .sort()
  let minGapBetweenHardSessionsDays: number | null = null
  for (let i = 1; i < hardDates.length; i++) {
    const gap = daysBetween(hardDates[i - 1], hardDates[i])
    if (minGapBetweenHardSessionsDays === null || gap < minGapBetweenHardSessionsDays) minGapBetweenHardSessionsDays = gap
  }

  return {
    restDaysPlanned: restSessions.length,
    restDaysTaken,
    activeRecoveryDays,
    longestRunStreakDays,
    minGapBetweenHardSessionsDays
  }
}

function computePlanAdherence(sessions: TrainingSession[], activities: Activity[], zones: HrZone[]): SessionAdherence[] {
  return sessions
    .filter((s) => s.session_type !== 'rest' && s.status === 'completed')
    .map((s) => {
      const activity = findActivity(s.id, activities)
      const actualDistanceM = activity?.distance_m ?? s.actual_distance_m ?? null
      const distancePct = s.planned_distance_m && actualDistanceM ? (actualDistanceM / s.planned_distance_m) * 100 : null

      const movingTimeSec = activity?.moving_time_sec ?? s.actual_duration_sec ?? null
      const actualPace =
        activity?.average_pace_sec_per_km ??
        (actualDistanceM && movingTimeSec ? movingTimeSec / (actualDistanceM / 1000) : null)

      let paceInTarget: boolean | null = null
      let paceDeltaSec: number | null = null
      if (actualPace != null && s.target_pace_min_sec != null) {
        const min = s.target_pace_min_sec
        const max = s.target_pace_max_sec ?? min
        if (actualPace >= min && actualPace <= max) {
          paceInTarget = true
          paceDeltaSec = 0
        } else {
          paceInTarget = false
          paceDeltaSec = actualPace < min ? min - actualPace : actualPace - max
        }
      }

      let hrZoneMatch: boolean | null = null
      if (activity?.average_heartrate != null && s.target_hr_zone && zones.length > 0) {
        const zone = zoneForHr(activity.average_heartrate, zones)
        hrZoneMatch = zone?.short === s.target_hr_zone
      }

      return { sessionId: s.id, sessionType: s.session_type, distancePct, paceInTarget, paceDeltaSec, hrZoneMatch }
    })
}

function computePersonalBests(sessions: TrainingSession[], activities: Activity[], personalRecords: PersonalRecord[]): PersonalBestHit[] {
  const weekActivityStravaIds = new Set(
    sessions
      .map((s) => findActivity(s.id, activities)?.strava_activity_id)
      .filter((id): id is number => id != null)
  )

  return personalRecords
    .filter((r) => r.source === 'strava' && r.strava_activity_id != null && weekActivityStravaIds.has(r.strava_activity_id))
    .map((r) => ({
      distanceLabel: r.distance_label,
      distanceM: r.distance_m,
      timeSec: r.time_sec,
      activityId: String(r.strava_activity_id),
      achievedOn: r.achieved_on ?? '',
      confidence: 'confirmed-current-best' as const
    }))
}

// ---------------------------------------------------------------------------
// Route ribbons — three fidelity tiers depending on what's synced for a run.
// See supabase/functions/fetch-week-streams for how 'stream' data is obtained.
// ---------------------------------------------------------------------------

function buildStreamRibbon(activity: Activity, session: TrainingSession, streams: ActivityStreams, zones: HrZone[]): WeeklyRouteRibbon {
  const latlngData = streams.latlng!.data
  const altitude = streams.altitude?.data
  const heartrate = streams.heartrate?.data
  const distance = streams.distance?.data
  const time = streams.time?.data

  const points: RoutePoint[] = latlngData.map(([lat, lng], i) => {
    let paceSecPerKm: number | null = null
    if (distance && time && i > 0) {
      const dd = distance[i] - distance[i - 1]
      const dt = time[i] - time[i - 1]
      paceSecPerKm = dd > 0 ? (dt / dd) * 1000 : null
    }
    const hr = heartrate?.[i] ?? null
    const zone = hr != null ? zoneForHr(hr, zones) : null
    return {
      lat,
      lng,
      distanceM: distance?.[i] ?? 0,
      elevationM: altitude?.[i] ?? null,
      paceSecPerKm,
      hr,
      hrZone: zone?.short ?? null
    }
  })

  return {
    activityId: activity.id,
    sessionId: session.id,
    sessionType: session.session_type,
    date: session.session_date,
    distanceM: distance?.[distance.length - 1] ?? activity.distance_m ?? 0,
    points,
    fidelity: 'stream'
  }
}

/**
 * Stamps each decoded polyline point with the enclosing ~1km split's pace/HR
 * (stepped, not smooth) and linearly interpolates elevation across the split
 * from `ActivitySplit.elevation_difference`. An approximation, not the real
 * per-point signal — see `fidelity: 'split-interpolated'` on the result.
 */
function buildSplitInterpolatedRibbon(
  activity: Activity,
  session: TrainingSession,
  latlngs: [number, number][],
  splits: ActivitySplit[],
  zones: HrZone[]
): WeeklyRouteRibbon {
  const cumDist = cumulativeDistances(latlngs)
  let boundary = 0
  const splitBoundaries = splits.map((sp) => (boundary += sp.distance))

  const points: RoutePoint[] = latlngs.map(([lat, lng], i) => {
    const distanceM = cumDist[i]
    let splitIdx = splitBoundaries.findIndex((b) => distanceM <= b)
    if (splitIdx === -1) splitIdx = splits.length - 1
    const split = splits[splitIdx]
    const splitStart = splitIdx > 0 ? splitBoundaries[splitIdx - 1] : 0
    const splitEnd = splitBoundaries[splitIdx]
    const frac = splitEnd > splitStart ? (distanceM - splitStart) / (splitEnd - splitStart) : 0

    const hr = split.average_heartrate ?? null
    const zone = hr != null ? zoneForHr(hr, zones) : null

    return {
      lat,
      lng,
      distanceM,
      elevationM: (split.elevation_difference ?? 0) * frac,
      paceSecPerKm: split.average_speed > 0 ? 1000 / split.average_speed : null,
      hr,
      hrZone: zone?.short ?? null
    }
  })

  return {
    activityId: activity.id,
    sessionId: session.id,
    sessionType: session.session_type,
    date: session.session_date,
    distanceM: cumDist[cumDist.length - 1] ?? activity.distance_m ?? 0,
    points,
    fidelity: 'split-interpolated'
  }
}

function buildPolylineOnlyRibbon(activity: Activity, session: TrainingSession, latlngs: [number, number][]): WeeklyRouteRibbon {
  const cumDist = cumulativeDistances(latlngs)
  const points: RoutePoint[] = latlngs.map(([lat, lng], i) => ({
    lat,
    lng,
    distanceM: cumDist[i],
    elevationM: null,
    paceSecPerKm: null,
    hr: null,
    hrZone: null
  }))

  return {
    activityId: activity.id,
    sessionId: session.id,
    sessionType: session.session_type,
    date: session.session_date,
    distanceM: cumDist[cumDist.length - 1] ?? activity.distance_m ?? 0,
    points,
    fidelity: 'polyline-only'
  }
}

function buildRouteRibbons(sessions: TrainingSession[], activities: Activity[], zones: HrZone[]): WeeklyRouteRibbon[] {
  const ribbons: WeeklyRouteRibbon[] = []
  const runSessions = sessions
    .filter((s) => s.session_type !== 'rest' && s.status === 'completed')
    .sort((a, b) => a.session_date.localeCompare(b.session_date))

  for (const s of runSessions) {
    const activity = findActivity(s.id, activities)
    if (!activity) continue
    const polyline = activity.raw?.map?.summary_polyline
    if (!polyline) continue
    const latlngs = decodePolyline(polyline)
    if (latlngs.length < 2) continue

    const streams = activity.stream_data
    if (streams?.latlng?.data && streams.latlng.data.length >= 2) {
      ribbons.push(buildStreamRibbon(activity, s, streams, zones))
      continue
    }

    const splits = activityDetail(activity).splits_metric ?? []
    if (splits.length > 0) {
      ribbons.push(buildSplitInterpolatedRibbon(activity, s, latlngs, splits, zones))
      continue
    }

    ribbons.push(buildPolylineOnlyRibbon(activity, s, latlngs))
  }

  return ribbons
}

function computeDataQuality(
  sessions: TrainingSession[],
  activities: Activity[],
  hrZoneBreakdown: HrZoneBreakdown,
  cadence: CadenceSummary | null,
  ribbons: WeeklyRouteRibbon[]
): DataQualityFlags {
  const matchedActivities = sessions
    .filter((s) => s.session_type !== 'rest' && s.status === 'completed')
    .map((s) => findActivity(s.id, activities))
    .filter((a): a is Activity => !!a)

  const hasSplitsForAllRuns =
    matchedActivities.length > 0 && matchedActivities.every((a) => (activityDetail(a).splits_metric?.length ?? 0) > 0)

  return {
    hasHeartRateData: hrZoneBreakdown.method !== 'unavailable',
    hasCadenceData: cadence != null,
    hasSplitsForAllRuns,
    hasStreamData: ribbons.some((r) => r.fidelity === 'stream')
  }
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildWeeklyReport(input: BuildWeeklyReportInput): WeeklyReport | null {
  const { planId, weekIndex, allSessions, allActivities, profile, personalRecords, narrativeInsight, trendWeeks = 4 } = input

  const weeks = groupSessionsByWeek(allSessions)
  const week = weeks.find((w) => w.week === weekIndex)
  if (!week || !week.isCompleted) return null

  const sessions = week.sessions
  const zones = hrZones({
    maxHr: profile?.max_hr,
    restingHr: profile?.resting_hr,
    lthr: profile?.lthr,
    model: profile?.hr_zone_model
  })

  const hero = computeHeroStats(sessions, allActivities)
  const splits = computeSplitsSummary(sessions, allActivities)
  const hrZoneBreakdown = computeHrZoneBreakdown(sessions, allActivities, zones)
  const cadence = computeCadenceSummary(sessions, allActivities)
  const elevationPace = computeElevationPaceCorrelation(sessions, allActivities)
  const trainingLoad = computeTrainingLoad(sessions, allActivities)
  const trend = computeTrend(weekIndex, weeks, allActivities, trendWeeks)
  const recovery = computeRecoveryPattern(sessions, allActivities)
  const planAdherence = computePlanAdherence(sessions, allActivities, zones)
  const personalBests = computePersonalBests(sessions, allActivities, personalRecords)
  const routeRibbons = buildRouteRibbons(sessions, allActivities, zones)
  const dataQuality = computeDataQuality(sessions, allActivities, hrZoneBreakdown, cadence, routeRibbons)

  return {
    planId,
    weekIndex,
    startDate: week.startDate,
    endDate: week.endDate,
    isCompleted: true,
    hero,
    splits,
    hrZones: hrZoneBreakdown,
    cadence,
    elevationPace,
    trainingLoad,
    trend,
    recovery,
    planAdherence,
    personalBests,
    narrative: narrativeInsight
      ? { content: narrativeInsight.content, generatedAt: narrativeInsight.created_at, isStale: !!narrativeInsight.is_stale }
      : null,
    routeRibbons,
    dataQuality
  }
}
