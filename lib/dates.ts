export type DueStatus = 'overdue' | 'today' | 'soon'

const SOON_THRESHOLD_DAYS = 3

// dueDate is a "YYYY-MM-DD" string with no time component, so it's compared
// against the local calendar date rather than a UTC instant.
export function getDueStatus(dueDate: string | null, completed: boolean): DueStatus | null {
  if (!dueDate || completed) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${dueDate}T00:00:00`)

  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'today'
  if (diffDays <= SOON_THRESHOLD_DAYS) return 'soon'
  return null
}

// "YYYY-MM-DD" for the local calendar day (toISOString would give the UTC day)
export function localDateKey(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function formatDueDate(dueDate: string): string {
  const due = new Date(`${dueDate}T00:00:00`)
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Whole local calendar days from one ISO timestamp to another
export function daysBetween(from: string, to: string): number {
  const start = new Date(from)
  const end = new Date(to)
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - start.getTime()) / 86400000)
}

// "Mar 4", or "Mar 4, 2025" outside the current year
export function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  const otherYear = date.getFullYear() !== new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(otherYear ? { year: 'numeric' } : {}),
  })
}
