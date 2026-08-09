/**
 * Pure lat/lng/elevation -> local 3D coordinate math for the Weekly Report's
 * route ribbon. No three.js import here — this is unit-testable independent
 * of the renderer, following the split `physiology.ts` uses for VDOT math.
 */

export interface GeoPoint {
  lat: number
  lng: number
  elevationM?: number | null
}

export interface ProjectedPoint {
  x: number
  y: number
  z: number
}

const EARTH_RADIUS_M = 6371000

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Projects a single run's GPS points onto a local tangent plane (ENU)
 * centered on that run's own centroid — accurate enough at the few-km scale
 * of one run, and avoids distortion from projecting the whole week onto one
 * shared origin when runs start in different places.
 *
 * `elevationM` maps to `y`, offset so the run's lowest point sits at 0 and
 * scaled by `verticalExaggeration` — real elevation change over a few km is
 * visually tiny next to horizontal spread, so it needs exaggerating to read.
 */
export function projectRun(points: GeoPoint[], verticalExaggeration = 3): ProjectedPoint[] {
  if (points.length === 0) return []

  const lat0 = points.reduce((sum, p) => sum + p.lat, 0) / points.length
  const lng0 = points.reduce((sum, p) => sum + p.lng, 0) / points.length
  const cosLat0 = Math.cos(toRadians(lat0))
  const elevations = points.map((p) => p.elevationM ?? 0)
  const minElevation = Math.min(...elevations)

  return points.map((p) => ({
    x: toRadians(p.lng - lng0) * cosLat0 * EARTH_RADIUS_M,
    z: toRadians(p.lat - lat0) * EARTH_RADIUS_M,
    y: ((p.elevationM ?? 0) - minElevation) * verticalExaggeration
  }))
}

export interface BoundsXZ {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export function boundsXZ(points: ProjectedPoint[]): BoundsXZ {
  return points.reduce(
    (b, p) => ({
      minX: Math.min(b.minX, p.x),
      maxX: Math.max(b.maxX, p.x),
      minZ: Math.min(b.minZ, p.z),
      maxZ: Math.max(b.maxZ, p.z)
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
  )
}

/**
 * Lays out a week's independently-projected runs side by side along X so
 * they read as a coherent group of ribbons instead of overlapping — a week's
 * runs rarely share a start point, so naively sharing one origin would place
 * unrelated routes on top of each other. Order runs by day (oldest first)
 * before calling this so the arrangement reads left-to-right through the week.
 *
 * Returns new point arrays offset in place; does not mutate the input.
 */
export function arrangeRunsSideBySide<T extends ProjectedPoint>(runs: T[][], gap = 15): T[][] {
  let cursor = 0
  const arranged: T[][] = []
  for (const run of runs) {
    if (run.length === 0) {
      arranged.push(run)
      continue
    }
    const b = boundsXZ(run)
    const width = b.maxX - b.minX
    // Shift this run so its bounding box starts at `cursor`, then advance the
    // cursor past it (plus a gap) for the next run.
    const shiftX = cursor - b.minX
    arranged.push(run.map((p) => ({ ...p, x: p.x + shiftX })))
    cursor += width + gap
  }

  // Re-center the whole arrangement on the origin so the camera's default
  // framing isn't biased toward the first run.
  const totalWidth = cursor - gap
  const recenter = totalWidth / 2
  return arranged.map((run) => run.map((p) => ({ ...p, x: p.x - recenter })))
}
