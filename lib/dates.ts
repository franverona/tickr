export type DueStatus = 'overdue' | 'today' | 'soon'

const SOON_THRESHOLD_DAYS = 3

// dueDate is a local calendar day, not a UTC instant
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

// Next Monday is never today
export function quickDueDate(kind: 'tomorrow' | 'next-monday', now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + (kind === 'tomorrow' ? 1 : (8 - d.getDay()) % 7 || 7))
  return localDateKey(d)
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// Quick add's trailing due-date token: "Ship it !fri", "!tomorrow", "!today" or
// "!2026-11-20". A weekday is never today, like next-monday. Anything else stays in the title.
export function parseQuickAdd(
  text: string,
  now: Date = new Date(),
): { title: string; dueDate: string | null } {
  const match = text.trim().match(/^(.*\S)\s+!(\S+)$/)
  const token = match?.[2].toLowerCase() ?? ''
  let dueDate: string | null = null
  if (token === 'today') dueDate = localDateKey(now)
  else if (token === 'tomorrow') dueDate = quickDueDate('tomorrow', now)
  else if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
    // Rejects dates that roll over, like 2026-02-30
    if (localDateKey(new Date(`${token}T00:00:00`)) === token) dueDate = token
  } else if (token.length >= 3) {
    const day = WEEKDAYS.findIndex((d) => d.startsWith(token))
    if (day >= 0) {
      const d = new Date(now)
      d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7 || 7))
      dueDate = localDateKey(d)
    }
  }
  return match && dueDate ? { title: match[1], dueDate } : { title: text.trim(), dueDate: null }
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

// toLocaleDateString is slow and the Done tab labels every task on each render
const weekOfLabels = new Map<number, string>()

// "This week", "Last week", or "Week of Mar 4"; weeks start on Monday
export function weekLabel(iso: string, now: Date = new Date()): string {
  const monday = (d: Date) => {
    const m = new Date(d)
    m.setHours(0, 0, 0, 0)
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
    return m
  }
  const start = monday(new Date(iso))
  const weeksAgo = Math.round((monday(now).getTime() - start.getTime()) / (7 * 86400000))
  if (weeksAgo === 0) return 'This week'
  if (weeksAgo === 1) return 'Last week'
  let label = weekOfLabels.get(start.getTime())
  if (!label) {
    label = `Week of ${formatTimestamp(start.toISOString())}`
    weekOfLabels.set(start.getTime(), label)
  }
  return label
}

// "3 done · median 2d" for a week of completed tasks (created → completed, in calendar days)
export function doneSummary(tasks: { createdAt: string; completedAt: string | null }[]): string {
  const days = tasks
    .filter((t) => t.completedAt)
    .map((t) => daysBetween(t.createdAt, t.completedAt!))
    .sort((a, b) => a - b)
  const count = `${tasks.length} done`
  if (days.length === 0) return count
  const mid = days.length >> 1
  const median = days.length % 2 ? days[mid] : Math.round((days[mid - 1] + days[mid]) / 2)
  return `${count} · median ${median === 0 ? 'same day' : `${median}d`}`
}
