import type { Tag, Task } from './types'

// A GitLab merge request or GitHub pull request URL
export function isReviewLink(url: string): boolean {
  try {
    const pathname = new URL(url).pathname
    return /\/merge_requests\/\d+/.test(pathname) || /\/pull\/\d+/.test(pathname)
  } catch {
    return false
  }
}

const WEEK_MS = 7 * 86400000

// Markdown list of tasks completed in the 7 days before `now`, newest first,
// each with its MR/PR links, for pasting into a standup. Null when there are none.
export function doneLastWeekSummary(tasks: Task[], now = new Date()): string | null {
  const since = now.getTime() - WEEK_MS
  const done = tasks
    .filter((t) => t.completed && t.completedAt && Date.parse(t.completedAt) >= since)
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))
  if (done.length === 0) return null

  const lines = done.map((t) => {
    const reviews = t.urls.filter((u) => isReviewLink(u.url)).map((u) => u.url)
    return `- ${t.title}${reviews.length > 0 ? ` → ${reviews.join(', ')}` : ''}`
  })
  return ['Done in the last 7 days:', ...lines].join('\n')
}

// One task as Markdown, for pasting into a Jira or GitLab comment
export function taskToMarkdown(task: Task, tags: Tag[]): string {
  const labels = task.tags.map((id) => tags.find((t) => t.id === id)?.label ?? id)
  const meta = [
    task.dueDate && `Due: ${task.dueDate}`,
    labels.length > 0 && `Tags: ${labels.join(', ')}`,
  ].filter(Boolean)
  const links = task.urls.map((u) => (u.label ? `- [${u.label}](${u.url})` : `- ${u.url}`))
  return [
    `## ${task.title}`,
    meta.length > 0 ? meta.join(' · ') : null,
    links.length > 0 ? links.join('\n') : null,
    task.description.trim() || null,
  ]
    .filter((part) => part !== null)
    .join('\n\n')
}
