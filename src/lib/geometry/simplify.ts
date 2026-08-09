/**
 * Douglas-Peucker polyline simplification for 3D points, used to bring the
 * route ribbon's vertex count down to a budget low-end mobile GPUs can handle.
 * No three.js import — pure math, unit-testable like `project.ts`.
 */

export interface Point3 {
  x: number
  y: number
  z: number
}

function distSq(a: Point3, b: Point3): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return dx * dx + dy * dy + dz * dz
}

/** Squared perpendicular distance from `p` to the line segment `a`-`b`. */
function perpendicularDistSq(p: Point3, a: Point3, b: Point3): number {
  const segLenSq = distSq(a, b)
  if (segLenSq === 0) return distSq(p, a)

  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y) + (p.z - a.z) * (b.z - a.z)) / segLenSq
  const clampedT = Math.max(0, Math.min(1, t))
  const projection: Point3 = {
    x: a.x + clampedT * (b.x - a.x),
    y: a.y + clampedT * (b.y - a.y),
    z: a.z + clampedT * (b.z - a.z)
  }
  return distSq(p, projection)
}

/**
 * Simplifies a polyline so no removed point deviated from its replacement
 * segment by more than `tolerance` (same units as the input coordinates).
 * Always keeps the first and last point.
 */
export function simplify<T extends Point3>(points: T[], tolerance: number): T[] {
  if (points.length <= 2) return points
  const toleranceSq = tolerance * tolerance
  const keep = new Array(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true

  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [start, end] = stack.pop()!
    if (end - start < 2) continue

    let maxDistSq = -1
    let maxIndex = -1
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistSq(points[i], points[start], points[end])
      if (d > maxDistSq) {
        maxDistSq = d
        maxIndex = i
      }
    }

    if (maxDistSq > toleranceSq) {
      keep[maxIndex] = true
      stack.push([start, maxIndex], [maxIndex, end])
    }
  }

  return points.filter((_, i) => keep[i])
}

/**
 * Binary-searches a tolerance so the simplified polyline has at most
 * `maxPoints` — used to cap the ribbon's total vertex budget for low-end
 * mobile GPUs regardless of how dense the source GPS stream is.
 */
export function simplifyToBudget<T extends Point3>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points

  let lo = 0
  // A generous upper bound: the full span of the route in any one axis.
  let hi = points.reduce((max, p) => {
    return Math.max(max, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z))
  }, 1)
  let best = points

  let foundWithinBudget = false
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const candidate = simplify(points, mid)
    if (candidate.length <= maxPoints) {
      best = candidate
      foundWithinBudget = true
      hi = mid
    } else {
      lo = mid
    }
  }

  // Extreme case (budget tighter than `hi` can reach): fall back to the
  // widest tolerance tried, which is still the best reduction available.
  return foundWithinBudget ? best : simplify(points, hi)
}
