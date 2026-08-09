import { RouteMap } from '@/components/RouteMap'
import type { WeeklyRouteRibbon } from '@/lib/weeklyReport'

/**
 * Renders when WebGL is unavailable or the user prefers reduced motion —
 * the week's runs as flat Leaflet maps instead of the 3D route ribbon.
 */
export function RibbonFallback({ ribbons }: { ribbons: WeeklyRouteRibbon[] }) {
  if (ribbons.length === 0) return null

  return (
    <div className="space-y-3">
      {ribbons.map((ribbon) => (
        <div key={ribbon.activityId} className="card overflow-hidden">
          <RouteMap points={ribbon.points.map((p) => [p.lat, p.lng])} />
        </div>
      ))}
    </div>
  )
}
