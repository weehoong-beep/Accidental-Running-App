export function paceToString(secPerKm: number | null | undefined): string {
  if (!secPerKm) return '—'
  const min = Math.floor(secPerKm / 60)
  const sec = Math.round(secPerKm % 60)
  return `${min}:${sec.toString().padStart(2, '0')}/km`
}

export function paceRangeToString(min?: number | null, max?: number | null): string {
  if (!min && !max) return '—'
  if (min === max || !max) return paceToString(min)
  return `${paceToString(min).replace('/km', '')}–${paceToString(max)}`
}

export function metersToKm(m: number | null | undefined, digits = 1): string {
  if (m == null) return '—'
  return (m / 1000).toFixed(digits)
}

export function durationToString(sec: number | null | undefined): string {
  if (!sec) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.round(sec % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatWeekday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

export function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return dateStr === today
}

export function isPast(dateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return dateStr < today
}
