// A short label for a link that identifies the task's ticket or review: a Jira
// key, a GitLab MR or a GitHub PR. Null for anything else, so cards only show
// these. http(s) only, since cards make them clickable.
export function ticketLabel(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    const jira = u.pathname.match(/\/browse\/([A-Z][A-Z0-9]*-\d+)/)
    if (jira) return jira[1]
    const mr = u.pathname.match(/\/merge_requests\/(\d+)/)
    if (mr) return `MR !${mr[1]}`
    const pr = u.pathname.match(/\/pull\/(\d+)/)
    if (pr) return `PR #${pr[1]}`
    return null
  } catch {
    return null
  }
}

export function suggestLabel(url: string): string {
  const ticket = ticketLabel(url)
  if (ticket) return ticket
  try {
    const u = new URL(url)
    const pipelineMatch = u.pathname.match(/\/pipelines\/(\d+)/)
    if (pipelineMatch) return `Pipeline - ${pipelineMatch[1]}`
    const issueMatch = u.pathname.match(/\/issues\/(\d+)/)
    if (issueMatch) return `Issue #${issueMatch[1]}`
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
    return u.hostname
  } catch {
    return ''
  }
}
