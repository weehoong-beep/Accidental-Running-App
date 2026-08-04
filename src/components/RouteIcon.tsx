import { useMemo } from 'react'
import { decodePolyline } from '@/lib/polyline'

/**
 * A small line-drawing thumbnail of a run's actual GPS route, decoded from
 * Strava's summary polyline. Hand-rolled SVG, no map tiles/library — in the
 * same spirit as ProgressRing/BarChart/LineChart. Renders nothing when there's
 * no usable route, so callers can fall back to a generic icon.
 */
export function RouteIcon({
  polyline,
  className = 'h-6 w-6',
  strokeColor = '#ffffff'
}: {
  polyline?: string | null
  className?: string
  strokeColor?: string
}) {
  const path = useMemo(() => {
    if (!polyline) return null
    const points = decodePolyline(polyline)
    if (points.length < 2) return null

    const lats = points.map((p) => p[0])
    const lngs = points.map((p) => p[1])
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)

    // Longitude degrees are shorter than latitude degrees away from the
    // equator — scale by cos(avg latitude) so the route isn't stretched.
    const avgLat = (minLat + maxLat) / 2
    const lngScale = Math.cos((avgLat * Math.PI) / 180) || 1

    const spanLat = maxLat - minLat || 1e-6
    const spanLng = (maxLng - minLng) * lngScale || 1e-6
    const span = Math.max(spanLat, spanLng)
    const pad = 8
    const size = 100 - pad * 2

    return points
      .map(([lat, lng], i) => {
        const x = pad + (((lng - minLng) * lngScale) / span) * size
        // SVG y grows downward; latitude grows northward, so flip it.
        const y = pad + (1 - (lat - minLat) / span) * size
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ')
  }, [polyline])

  if (!path) return null

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className={className} role="img" aria-label="Route shape">
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
