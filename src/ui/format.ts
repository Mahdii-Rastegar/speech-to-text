import { formatUsd } from '@/core/format/cost'
import { dayGroupOf, formatClock, formatJalaliDate, type DayGroup } from '@/core/format/date'
import { toPersianDigits } from '@/core/format/digits'
import { formatDuration } from '@/core/format/duration'
import type { CostInfo, TranscriptionSession } from '@/core/session'
import { fa } from './strings/fa'

/** Interface-facing formatting: Persian digits, Jalali dates, Persian labels. */

export const durationLabel = (ms: number) => toPersianDigits(formatDuration(ms))

const dollarAmount = (cost: CostInfo) =>
  `${toPersianDigits(formatUsd(cost.amountUsd)).replace('.', '٫')} ${fa.session.dollars}`

/** Full wording, for example «هزینه‌ی تخمینی ۰٫۰۰۰۶ دلار». */
export function costLabel(cost: CostInfo): string {
  const prefix = cost.estimated ? fa.session.estimatedCost : fa.session.cost
  return `${prefix} ${dollarAmount(cost)}`
}

/** Compact form for lists. The "≈" marks an estimate. */
export function costShortLabel(cost: CostInfo): string {
  return cost.estimated ? `≈ ${dollarAmount(cost)}` : dollarAmount(cost)
}

export function dayGroupLabel(group: DayGroup): string {
  if (group.kind === 'today') return fa.history.today
  if (group.kind === 'yesterday') return fa.history.yesterday
  return group.label
}

export function dateTimeLabel(iso: string): string {
  const date = new Date(iso)
  return `${formatJalaliDate(date)}، ${formatClock(date)}`
}

export interface SessionGroup {
  label: string
  sessions: TranscriptionSession[]
}

/** Groups sessions (newest first) under day headings. */
export function groupSessionsByDay(sessions: TranscriptionSession[], now: Date): SessionGroup[] {
  const groups: SessionGroup[] = []
  for (const session of sessions) {
    const label = dayGroupLabel(dayGroupOf(new Date(session.createdAt), now))
    const last = groups.at(-1)
    if (last && last.label === label) last.sessions.push(session)
    else groups.push({ label, sessions: [session] })
  }
  return groups
}

export const cn = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ')
