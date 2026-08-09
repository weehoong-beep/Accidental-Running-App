import * as THREE from 'three'
import type { WeeklyRouteRibbon } from '@/lib/weeklyReport'
import { arrangeRunsSideBySide, projectRun, type ProjectedPoint } from '@/lib/geometry/project'
import { simplifyToBudget } from '@/lib/geometry/simplify'

/** Total vertex budget across the whole week's ribbons, split evenly per run — keeps low-end mobile GPUs smooth regardless of GPS sample density. */
const TOTAL_POINT_BUDGET = 700
const MIN_POINTS_PER_RUN = 12
const TUBE_RADIUS = 0.35
const RADIAL_SEGMENTS = 6
const RUN_GAP = 18
const VERTICAL_EXAGGERATION = 3

export type ColorMode = 'pace' | 'hr'

interface RibbonPoint extends ProjectedPoint {
  paceSecPerKm: number | null
  hr: number | null
  hrZone: string | null
}

export interface RibbonMesh {
  activityId: string
  sessionId: string
  date: string
  geometry: THREE.TubeGeometry
}

// Matches tailwind.config.js's `accent-gradient` (purple -> teal -> coral) so
// the ribbon reads as part of the same visual system as the rest of the app.
const COLOR_STOPS: [number, THREE.Color][] = [
  [0, new THREE.Color('#8B6BFF')],
  [0.55, new THREE.Color('#2DD4BF')],
  [1, new THREE.Color('#FF7A59')]
]

function colorForT(t: number): THREE.Color {
  const clamped = Math.max(0, Math.min(1, t))
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    const [t0, c0] = COLOR_STOPS[i - 1]
    const [t1, c1] = COLOR_STOPS[i]
    if (clamped <= t1) {
      const localT = t1 > t0 ? (clamped - t0) / (t1 - t0) : 0
      return c0.clone().lerp(c1, localT)
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1][1].clone()
}

const HR_ZONE_ORDER = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']

/** 0 (fast/low) .. 1 (slow/high) position for one point, given the week's overall range. */
function colorT(point: RibbonPoint, mode: ColorMode, paceRange: [number, number]): number {
  if (mode === 'hr') {
    if (!point.hrZone) return 0.5
    const idx = HR_ZONE_ORDER.indexOf(point.hrZone)
    return idx === -1 ? 0.5 : idx / (HR_ZONE_ORDER.length - 1)
  }
  if (point.paceSecPerKm == null) return 0.5
  const [min, max] = paceRange
  // Faster (lower sec/km) -> 0, slower -> 1, so effort reads intuitively as
  // "hotter" color the harder/slower the segment.
  return max > min ? (point.paceSecPerKm - min) / (max - min) : 0.5
}

/**
 * Projects, simplifies, and arranges a week's route ribbons into three.js
 * tube geometries with vertex colors. Pure three.js — no react-three-fiber
 * import — so it's usable from a plain `useMemo` inside the R3F scene.
 */
export function buildWeekRibbons(ribbons: WeeklyRouteRibbon[], colorMode: ColorMode = 'pace'): RibbonMesh[] {
  if (ribbons.length === 0) return []

  const perRunBudget = Math.max(MIN_POINTS_PER_RUN, Math.floor(TOTAL_POINT_BUDGET / ribbons.length))

  const allPaces = ribbons.flatMap((r) => r.points.map((p) => p.paceSecPerKm).filter((p): p is number => p != null))
  const paceRange: [number, number] = allPaces.length > 0 ? [Math.min(...allPaces), Math.max(...allPaces)] : [0, 1]

  const projectedRuns: RibbonPoint[][] = ribbons.map((ribbon) => {
    const projected = projectRun(
      ribbon.points.map((p) => ({ lat: p.lat, lng: p.lng, elevationM: p.elevationM })),
      VERTICAL_EXAGGERATION
    )
    const withData: RibbonPoint[] = projected.map((pp, i) => ({
      ...pp,
      paceSecPerKm: ribbon.points[i].paceSecPerKm,
      hr: ribbon.points[i].hr,
      hrZone: ribbon.points[i].hrZone
    }))
    return simplifyToBudget(withData, perRunBudget)
  })

  const arranged = arrangeRunsSideBySide(projectedRuns, RUN_GAP)

  return arranged.map((points, i) => {
    const ribbon = ribbons[i]
    const curvePoints = points.map((p) => new THREE.Vector3(p.x, p.y, p.z))
    const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'catmullrom', 0.2)

    const tubularSegments = Math.max(8, points.length * 2)
    const geometry = new THREE.TubeGeometry(curve, tubularSegments, TUBE_RADIUS, RADIAL_SEGMENTS, false)

    // Sample colors along the curve at the same resolution as the tube's
    // length segments, and paint every radial vertex at a given length
    // position the same color so bands wrap the tube with no seam artifacts.
    const colorAttr = new Float32Array((tubularSegments + 1) * (RADIAL_SEGMENTS + 1) * 3)
    for (let seg = 0; seg <= tubularSegments; seg++) {
      const t = seg / tubularSegments
      const sourceIndex = Math.min(points.length - 1, Math.round(t * (points.length - 1)))
      const color = colorForT(colorT(points[sourceIndex], colorMode, paceRange))
      for (let rad = 0; rad <= RADIAL_SEGMENTS; rad++) {
        const vertexIndex = seg * (RADIAL_SEGMENTS + 1) + rad
        colorAttr[vertexIndex * 3] = color.r
        colorAttr[vertexIndex * 3 + 1] = color.g
        colorAttr[vertexIndex * 3 + 2] = color.b
      }
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colorAttr, 3))

    return { activityId: ribbon.activityId, sessionId: ribbon.sessionId, date: ribbon.date, geometry }
  })
}
