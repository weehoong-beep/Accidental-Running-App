/**
 * All "today"/"this week" calculations anchor to Malaysia time, regardless of
 * the viewer's device timezone — the plan and race live in Kuala Lumpur.
 */
export const MY_TIMEZONE = 'Asia/Kuala_Lumpur'

const myDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

/** 'yyyy-MM-dd' for the given instant (default: now), in Malaysia time. */
export function toMYDateString(date: Date = new Date()): string {
  return myDateFormatter.format(date)
}

/** Today's date string in Malaysia time. */
export function todayMY(): string {
  return toMYDateString(new Date())
}

/** Pure calendar-date arithmetic on a 'yyyy-MM-dd' string — no local-timezone drift. */
export function shiftDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/** Monday-of-week (or `weekStartsOn`) for a 'yyyy-MM-dd' string. */
export function startOfWeekMY(dateStr: string, weekStartsOn = 1): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=Sun..6=Sat
  const diff = (dow - weekStartsOn + 7) % 7
  return shiftDateString(dateStr, -diff)
}

/** Formats an instant using Malaysia's wall-clock date/time. */
export function formatInMY(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: MY_TIMEZONE, ...options }).format(date)
}
