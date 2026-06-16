import { describe, expect, it } from 'vitest'
import { getDueStatus } from '../lib/dates'

function dateStr(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
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
