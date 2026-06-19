export function suggestLabel(url: string): string {
  try {
    const u = new URL(url)
    const jiraMatch = u.pathname.match(/\/browse\/([A-Z]+-\d+)/)
    if (jiraMatch) return jiraMatch[1]
    const mrMatch = u.pathname.match(/\/merge_requests\/(\d+)/)
    if (mrMatch) return `MR !${mrMatch[1]}`
    const issueMatch = u.pathname.match(/\/issues\/(\d+)/)
    if (issueMatch) return `Issue #${issueMatch[1]}`
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
    return u.hostname
  } catch {
    return ''
  }
}
