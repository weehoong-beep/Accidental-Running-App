import type { Activity } from './types'

/**
 * Decodes Google's encoded polyline algorithm format, used by Strava's
 * `map.summary_polyline`. Returns [lat, lng] pairs.
 */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let result = 0
    let shift = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1

    result = 0
    shift = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1

    points.push([lat / 1e5, lng / 1e5])
  }

  return points
}

/** Strava stores the activity summary (including `map.summary_polyline`) wholesale in `raw`. */
export function getSummaryPolyline(activity: Activity): string | null {
  return activity.raw?.map?.summary_polyline ?? null
}

/** `matched_session_id` -> polyline, built once for a list of activities. */
export function buildPolylineMap(activities: Activity[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const a of activities) {
    if (!a.matched_session_id) continue
    const polyline = getSummaryPolyline(a)
    if (polyline) map.set(a.matched_session_id, polyline)
  }
  return map
}

const EARTH_RADIUS_M = 6371000

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Great-circle distance between two [lat, lng] points, in meters. */
function haversineM(a: [number, number], b: [number, number]): number {
  const [lat1, lng1] = a
  const [lat2, lng2] = b
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)))
}

/**
 * Cumulative distance in meters at each point of a decoded polyline, starting
 * at 0. Used to line up a summary polyline (lat/lng only) against per-split
 * distance data for the Weekly Report's route ribbon.
 */
export function cumulativeDistances(points: [number, number][]): number[] {
  const out: number[] = []
  let total = 0
  for (let i = 0; i < points.length; i++) {
    if (i > 0) total += haversineM(points[i - 1], points[i])
    out.push(total)
  }
  return out
}
