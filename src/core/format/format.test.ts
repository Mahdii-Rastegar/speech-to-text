import { describe, expect, it } from 'vitest'
import { formatUsd } from './cost'
import { dayGroupOf, formatClock, formatJalaliDate } from './date'
import { toPersianDigits } from './digits'
import { formatDuration } from './duration'

describe('formatUsd', () => {
  it('keeps tiny amounts readable and larger ones short', () => {
    expect(formatUsd(0.0006)).toBe('0.0006')
    expect(formatUsd(0.0125)).toBe('0.013')
    expect(formatUsd(1.5)).toBe('1.50')
    expect(formatUsd(0)).toBe('0.0000')
  })
})

describe('toPersianDigits', () => {
  it('replaces ASCII digits and leaves everything else alone', () => {
    expect(toPersianDigits('02:14')).toBe('۰۲:۱۴')
    expect(toPersianDigits(1405)).toBe('۱۴۰۵')
    expect(toPersianDigits('large-v3')).toBe('large-v۳')
    expect(toPersianDigits('بدون عدد')).toBe('بدون عدد')
  })
})

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(23_400)).toBe('00:23')
    expect(formatDuration(134_000)).toBe('02:14')
  })

  it('adds hours from one hour up', () => {
    expect(formatDuration(3_600_000)).toBe('1:00:00')
    expect(formatDuration(3_723_000)).toBe('1:02:03')
  })

  it('never goes negative', () => {
    expect(formatDuration(-500)).toBe('00:00')
  })
})

describe('dates', () => {
  const tehran = 'Asia/Tehran'
  const now = new Date('2026-10-04T16:42:00+03:30')

  it('formats the Jalali date with Persian digits', () => {
    const label = formatJalaliDate(now, tehran)
    expect(label).toContain('مهر')
    expect(label).toContain('۱۲')
    expect(label).toContain('۱۴۰۵')
  })

  it('formats a 24-hour clock with Persian digits', () => {
    expect(formatClock(new Date('2026-10-04T09:42:00+03:30'), tehran)).toBe('۰۹:۴۲')
    expect(formatClock(now, tehran)).toBe('۱۶:۴۲')
  })

  it('groups by calendar day in the given time zone', () => {
    expect(dayGroupOf(new Date('2026-10-04T00:05:00+03:30'), now, tehran)).toEqual({
      kind: 'today',
    })
    expect(dayGroupOf(new Date('2026-10-03T23:55:00+03:30'), now, tehran)).toEqual({
      kind: 'yesterday',
    })
    const older = dayGroupOf(new Date('2026-09-30T10:00:00+03:30'), now, tehran)
    expect(older.kind).toBe('date')
    expect(older.kind === 'date' && older.label).toContain('مهر')
  })
})
