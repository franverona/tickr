import { afterEach, describe, expect, it } from 'vitest'
import {
  daysBetween,
  doneSummary,
  formatTimestamp,
  getDueStatus,
  localDateKey,
  quickDueDate,
  weekLabel,
} from '../lib/dates'

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

describe('quickDueDate', () => {
  // 2026-03-02 is a Monday
  it.each([
    ['2026-03-01', 'tomorrow', '2026-03-02'],
    ['2026-03-31', 'tomorrow', '2026-04-01'],
    ['2026-03-01', 'next-monday', '2026-03-02'],
    ['2026-03-02', 'next-monday', '2026-03-09'],
    ['2026-03-07', 'next-monday', '2026-03-09'],
  ] as const)('from %s, %s is %s', (from, kind, expected) => {
    expect(quickDueDate(kind, new Date(`${from}T15:00:00`))).toBe(expected)
  })
})

describe('weekLabel', () => {
  // 2026-03-11 is a Wednesday
  const now = new Date('2026-03-11T12:00:00')

  it('labels this week, last week, and older weeks by their Monday', () => {
    expect(weekLabel('2026-03-09T08:00:00', now)).toBe('This week')
    expect(weekLabel('2026-03-08T23:00:00', now)).toBe('Last week')
    expect(weekLabel('2026-02-25T10:00:00', now)).toBe(
      `Week of ${formatTimestamp(new Date('2026-02-23T00:00:00').toISOString())}`,
    )
    // Same older week, any day: the cached label
    expect(weekLabel('2026-03-01T22:00:00', now)).toBe(weekLabel('2026-02-23T00:00:00', now))
  })
})

describe('doneSummary', () => {
  const t = (createdAt: string, completedAt: string | null) => ({ createdAt, completedAt })

  it('counts the tasks and gives the median days from creation to completion', () => {
    expect(
      doneSummary([
        t('2026-01-01T09:00:00', '2026-01-02T09:00:00'),
        t('2026-01-01T09:00:00', '2026-01-04T09:00:00'),
        t('2026-01-01T09:00:00', '2026-01-11T09:00:00'),
      ]),
    ).toBe('3 done · median 3d')
    expect(
      doneSummary([
        t('2026-01-01T09:00:00', '2026-01-02T09:00:00'),
        t('2026-01-01T09:00:00', '2026-01-04T09:00:00'),
      ]),
    ).toBe('2 done · median 2d')
  })

  it('says same day, and skips the median without completion dates', () => {
    expect(doneSummary([t('2026-01-01T09:00:00', '2026-01-01T17:00:00')])).toBe(
      '1 done · median same day',
    )
    expect(doneSummary([t('2026-01-01T09:00:00', null)])).toBe('1 done')
  })
})
