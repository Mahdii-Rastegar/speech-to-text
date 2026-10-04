/** Which heading a History entry belongs under. */
export type DayGroup =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'date'; label: string }

const MS_PER_DAY = 86_400_000

/** Day number of `date` as seen in `timeZone` (the system zone when omitted). */
function dayIndex(date: Date, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value)
  return Math.floor(Date.UTC(part('year'), part('month') - 1, part('day')) / MS_PER_DAY)
}

/** Jalali calendar date with Persian digits, for example «۱۲ مهر ۱۴۰۵». */
export function formatJalaliDate(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

/** 24-hour clock with Persian digits, for example «۰۹:۴۲». */
export function formatClock(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

export function dayGroupOf(date: Date, now: Date, timeZone?: string): DayGroup {
  const daysAgo = dayIndex(now, timeZone) - dayIndex(date, timeZone)
  if (daysAgo === 0) return { kind: 'today' }
  if (daysAgo === 1) return { kind: 'yesterday' }
  return { kind: 'date', label: formatJalaliDate(date, timeZone) }
}
