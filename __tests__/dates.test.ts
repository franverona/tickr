import { afterEach, describe, expect, it } from 'vitest'
import { daysBetween, formatTimestamp, getDueStatus, localDateKey } from '../lib/dates'

function dateStr(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return localDateKey(d)
}

describe('getDueStatus', () => {
  it('returns null when dueDate is null', () => {
    expect(getDueStatus(null, false)).toBeNull()
  })

  it('returns null when task is completed, regardless of date', () => {
    expect(getDueStatus(dateStr(-5), true)).toBeNull()
    expect(getDueStatus(dateStr(0), true)).toBeNull()
  })

  it('returns "overdue" for a past date', () => {
    expect(getDueStatus(dateStr(-1), false)).toBe('overdue')
    expect(getDueStatus('2020-01-01', false)).toBe('overdue')
  })

  it('returns "today" for today\'s date', () => {
    expect(getDueStatus(dateStr(0), false)).toBe('today')
  })

  it('returns "soon" for tomorrow', () => {
    expect(getDueStatus(dateStr(1), false)).toBe('soon')
  })

  it('returns "soon" for 3 days from now (boundary)', () => {
    expect(getDueStatus(dateStr(3), false)).toBe('soon')
  })

  it('returns null for 4+ days from now', () => {
    expect(getDueStatus(dateStr(4), false)).toBeNull()
    expect(getDueStatus(dateStr(30), false)).toBeNull()
  })
})

describe('localDateKey', () => {
  const originalTZ = process.env.TZ
  afterEach(() => {
    process.env.TZ = originalTZ
  })

  it('uses the local calendar day, not the UTC one', () => {
    process.env.TZ = 'America/New_York'
    // 20:00 local on Jan 15 is already Jan 16 in UTC
    const evening = new Date('2026-01-16T01:00:00.000Z')
    expect(evening.toISOString().slice(0, 10)).toBe('2026-01-16')
    expect(localDateKey(evening)).toBe('2026-01-15')
  })
})

describe('daysBetween', () => {
  it('counts local calendar days, ignoring the time of day', () => {
    expect(daysBetween('2026-01-01T23:00:00', '2026-01-02T01:00:00')).toBe(1)
    expect(daysBetween('2026-01-01T08:00:00', '2026-01-01T20:00:00')).toBe(0)
    expect(daysBetween('2026-01-01T12:00:00', '2026-01-15T12:00:00')).toBe(14)
  })
})

describe('formatTimestamp', () => {
  it('adds the year only outside the current year', () => {
    const thisYear = new Date().getFullYear()
    expect(formatTimestamp(`${thisYear}-03-04T12:00:00`)).not.toContain(String(thisYear))
    expect(formatTimestamp('2001-03-04T12:00:00')).toContain('2001')
  })
})
