import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { decodePolyline } from '@/lib/polyline'

/**
 * A real, pannable/zoomable map with the run's GPS route drawn on top —
 * OpenStreetMap tiles (no API key) via Leaflet, in the spirit of Strava's
 * activity page map. Renders nothing when there's no usable route.
 */
export function RouteMap({
  polyline,
  points: pointsProp,
  className = 'h-52 w-full'
}: {
  polyline?: string | null
  /** Pre-decoded [lat, lng] points — an alternative to `polyline` when the caller already has them. */
  points?: [number, number][]
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const hasRoute = !!polyline || (pointsProp?.length ?? 0) >= 2

  useEffect(() => {
    if (!containerRef.current) return
    const points = pointsProp ?? (polyline ? decodePolyline(polyline) : [])
    if (points.length < 2) return

    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      attributionControl: true,
      zoomControl: true
    })
    mapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map)

    const latLngs = points.map(([lat, lng]) => L.latLng(lat, lng))
    const line = L.polyline(latLngs, { color: '#FF7A59', weight: 4, opacity: 0.9, lineCap: 'round' }).addTo(map)

    L.circleMarker(latLngs[0], { radius: 5, color: '#ffffff', weight: 2, fillColor: '#2DD4BF', fillOpacity: 1 }).addTo(map)
    L.circleMarker(latLngs[latLngs.length - 1], {
      radius: 5,
      color: '#ffffff',
      weight: 2,
      fillColor: '#FF7A59',
      fillOpacity: 1
    }).addTo(map)

    map.fitBounds(line.getBounds(), { padding: [16, 16] })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [polyline, pointsProp])

  if (!hasRoute) return null

  return <div ref={containerRef} className={`overflow-hidden rounded-2xl ${className}`} />
}
