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

export function formatDueDate(dueDate: string): string {
  const due = new Date(`${dueDate}T00:00:00`)
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
