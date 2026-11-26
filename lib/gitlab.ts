import type { TaskRepository } from './db/types'
import type { LinkStatus, Task, TaskUrl } from './types'

const SYNC_INTERVAL_MS = 5 * 60_000
const MAX_PROJECTS_PER_SYNC = 20
const REQUEST_TIMEOUT_MS = 10_000

// shortcut: in-memory, per process (fine for the single pm2 process; move to the DB if it runs
// multi-instance) and never pruned (a few bytes per link ever synced)
// Last check per link, keyed by id + url so editing a link's URL makes it due again
const checkedAt = new Map<string, number>()
// Set after a 429 or a network error, so a dead connection isn't retried on every trigger
let pausedUntil = 0

export function resetGitlabThrottle() {
  checkedAt.clear()
  pausedUntil = 0
}

// `<origin>/<group/…/project>/-/merge_requests/<iid>` (or the old form without `/-`) on `origin` only
export function parseMrUrl(url: string, origin: string): { project: string; iid: number } | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.origin !== origin) return null
  const m = u.pathname.match(/^\/(.+?)(?:\/-)?\/merge_requests\/(\d+)(?:\/|$)/)
  return m ? { project: decodeURIComponent(m[1]), iid: Number(m[2]) } : null
}

// undefined: a state we don't track (e.g. `locked` mid-merge), so the stored status is kept
export function mapMrState(mr: { state: string; draft?: boolean }): LinkStatus | null | undefined {
  if (mr.state === 'opened') return mr.draft ? 'draft' : null
  if (mr.state === 'merged' || mr.state === 'closed') return mr.state
  return undefined
}

// Syncs the non-archived, not yet merged/closed GitLab MR links not checked in the last
// SYNC_INTERVAL_MS, so callers can trigger it freely. Never throws: failures keep the stored
// statuses. Returns the tasks that changed.
export async function syncGitlabStatuses(repo: TaskRepository): Promise<Task[]> {
  const token = process.env.GITLAB_TOKEN
  if (!token || Date.now() < pausedUntil) return []

  const updated = new Map<string, Task>()
  try {
    const origin = new URL(process.env.GITLAB_URL || 'https://gitlab.com').origin
    const byProject = new Map<string, { task: Task; link: TaskUrl; iid: number }[]>()
    const tasks = await repo.getTasks()
    // No await from here until every picked link is marked, so concurrent calls don't overlap
    const now = Date.now()
    for (const task of tasks) {
      if (task.archived) continue
      for (const link of task.urls) {
        if (link.status === 'merged' || link.status === 'closed') continue
        if (now - (checkedAt.get(`${link.id} ${link.url}`) ?? 0) < SYNC_INTERVAL_MS) continue
        const ref = parseMrUrl(link.url, origin)
        if (!ref) continue
        byProject.set(ref.project, [
          ...(byProject.get(ref.project) ?? []),
          { task, link, iid: ref.iid },
        ])
      }
    }

    const picked = [...byProject].slice(0, MAX_PROJECTS_PER_SYNC)
    for (const [, links] of picked)
      for (const { link } of links) checkedAt.set(`${link.id} ${link.url}`, now)

    // One request per project, sequential, to stay far below GitLab's rate limits
    for (const [project, links] of picked) {
      const params = new URLSearchParams()
      for (const iid of new Set(links.map((l) => l.iid))) params.append('iids[]', String(iid))
      const res = await fetch(
        `${origin}/api/v4/projects/${encodeURIComponent(project)}/merge_requests?${params}`,
        {
          headers: { 'PRIVATE-TOKEN': token },
          cache: 'no-store',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      )
      if (res.status === 429) {
        const retryAfterMs = Number(res.headers.get('Retry-After')) * 1000 || 0
        pausedUntil = Date.now() + Math.max(retryAfterMs, SYNC_INTERVAL_MS)
        console.warn('GitLab sync: rate limited, retrying later')
        break
      }
      if (!res.ok) {
        console.warn(`GitLab sync: ${project} returned ${res.status}`)
        continue
      }
      const mrs = (await res.json()) as { iid: number; state: string; draft?: boolean }[]
      for (const { task, link, iid } of links) {
        const mr = mrs.find((m) => m.iid === iid)
        const status = mr && mapMrState(mr)
        if (status === undefined || status === (link.status ?? null)) continue
        updated.set(task.id, await repo.setTaskUrlStatus(task.id, link.id, status))
      }
    }
  } catch (err) {
    // Offline, off VPN, timeout or a bad GITLAB_URL
    pausedUntil = Date.now() + SYNC_INTERVAL_MS
    console.warn('GitLab sync failed:', err instanceof Error ? err.message : err)
  }
  return [...updated.values()]
}
