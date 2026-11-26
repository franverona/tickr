import type { TaskRepository } from './db/types'
import type { LinkStatus, Task, TaskUrl } from './types'

// A link whose status the sync changed
export interface LinkStatusChange {
  taskId: string
  urlId: string
  status: LinkStatus | null
}

const SYNC_INTERVAL_MS = 5 * 60_000
const MAX_REQUESTS_PER_SYNC = 20
// GitLab's largest page; the default (20) would silently drop the other MRs
const MAX_IIDS_PER_REQUEST = 100
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
  running = null
  finished = []
}

// `<base>/<group/…/project>/-/merge_requests/<iid>` (or the old form without `/-`), where base is
// GITLAB_URL's origin plus its path (a relative-root install), on that origin only
export function parseMrUrl(url: string, base: string): { project: string; iid: number } | null {
  try {
    const u = new URL(url)
    const b = new URL(base)
    const root = b.pathname.replace(/\/+$/, '')
    if (u.origin !== b.origin || !u.pathname.startsWith(`${root}/`)) return null
    const m = u.pathname.slice(root.length).match(/^\/(.+?)(?:\/-)?\/merge_requests\/(\d+)(?:\/|$)/)
    // decodeURIComponent throws on a malformed escape like `%zz`
    return m ? { project: decodeURIComponent(m[1]), iid: Number(m[2]) } : null
  } catch {
    return null
  }
}

// undefined: a state we don't track (e.g. `locked` mid-merge), so the stored status is kept
export function mapMrState(mr: { state: string; draft?: boolean }): LinkStatus | null | undefined {
  if (mr.state === 'opened') return mr.draft ? 'draft' : null
  if (mr.state === 'merged' || mr.state === 'closed') return mr.state
  return undefined
}

// Syncs the non-archived, not yet merged/closed GitLab MR links not checked in the last
// SYNC_INTERVAL_MS, so callers can trigger it freely. Never throws: failures keep the stored
// statuses. Returns the links it changed.
export async function syncGitlabStatuses(repo: TaskRepository): Promise<LinkStatusChange[]> {
  const token = process.env.GITLAB_TOKEN
  if (!token || Date.now() < pausedUntil) return []

  const changes: LinkStatusChange[] = []
  try {
    const base = (process.env.GITLAB_URL || 'https://gitlab.com').replace(/\/+$/, '')
    new URL(base) // a bad GITLAB_URL throws here, into the catch below
    const byProject = new Map<string, { task: Task; link: TaskUrl; iid: number }[]>()
    const tasks = await repo.getTasks()
    // No await from here until every picked link is marked, so concurrent calls don't overlap
    const now = Date.now()
    for (const task of tasks) {
      if (task.archived) continue
      for (const link of task.urls) {
        if (link.status === 'merged' || link.status === 'closed') continue
        if (now - (checkedAt.get(`${link.id} ${link.url}`) ?? 0) < SYNC_INTERVAL_MS) continue
        const ref = parseMrUrl(link.url, base)
        if (!ref) continue
        byProject.set(ref.project, [
          ...(byProject.get(ref.project) ?? []),
          { task, link, iid: ref.iid },
        ])
      }
    }

    // One request per project (more past MAX_IIDS_PER_REQUEST distinct MRs)
    const requests: [string, { task: Task; link: TaskUrl; iid: number }[]][] = []
    for (const [project, links] of byProject) {
      const iids = [...new Set(links.map((l) => l.iid))]
      for (let i = 0; i < iids.length; i += MAX_IIDS_PER_REQUEST) {
        const chunk = new Set(iids.slice(i, i + MAX_IIDS_PER_REQUEST))
        requests.push([project, links.filter((l) => chunk.has(l.iid))])
      }
    }
    const picked = requests.slice(0, MAX_REQUESTS_PER_SYNC)
    for (const [, links] of picked)
      for (const { link } of links) checkedAt.set(`${link.id} ${link.url}`, now)

    // Sequential, to stay far below GitLab's rate limits
    for (const [project, links] of picked) {
      const params = new URLSearchParams({ per_page: String(MAX_IIDS_PER_REQUEST) })
      for (const iid of new Set(links.map((l) => l.iid))) params.append('iids[]', String(iid))
      const res = await fetch(
        `${base}/api/v4/projects/${encodeURIComponent(project)}/merge_requests?${params}`,
        {
          headers: { 'PRIVATE-TOKEN': token },
          cache: 'no-store',
          // fetch keeps custom headers on a cross-origin redirect, which would leak the token. Not
          // 'error': a throw would pause the whole sync, so the 3xx is skipped as not ok below
          redirect: 'manual',
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
      const mrs: unknown = await res.json().catch(() => null)
      // e.g. an SSO or proxy page answering 200
      if (!Array.isArray(mrs)) {
        console.warn(`GitLab sync: ${project} returned an unexpected response`)
        continue
      }
      for (const { task, link, iid } of links) {
        const mr = mrs.find((m) => m?.iid === iid)
        const status = mr && typeof mr.state === 'string' ? mapMrState(mr) : undefined
        if (status === undefined || status === (link.status ?? null)) continue
        try {
          await repo.setTaskUrlStatus(task.id, link.id, status)
          changes.push({ taskId: task.id, urlId: link.id, status })
        } catch (err) {
          // The task was deleted (e.g. in another tab) while the sync ran
          console.warn(
            'GitLab sync: could not save a status:',
            err instanceof Error ? err.message : err,
          )
        }
      }
    }
  } catch (err) {
    // Offline, off VPN, timeout, a redirect or a bad GITLAB_URL
    pausedUntil = Date.now() + SYNC_INTERVAL_MS
    console.warn('GitLab sync failed:', err instanceof Error ? err.message : err)
  }
  return changes
}

// Next.js runs a client's Server Actions one at a time, so a sync awaiting GitLab would hold up
// every edit behind it. Instead the sync runs in the background: each call starts one if none is
// running, waits up to POLL_WAIT_MS for it, and returns the links changed by finished runs.
// `running` tells the page to poll again.
const POLL_WAIT_MS = 300
let running: Promise<void> | null = null
// shortcut: handed to whichever tab polls first; other tabs see the change on reload
let finished: LinkStatusChange[] = []

export async function pollGitlabSync(
  repo: TaskRepository,
): Promise<{ changes: LinkStatusChange[]; running: boolean }> {
  if (!running) {
    const run: Promise<void> = syncGitlabStatuses(repo)
      .then((changes) => {
        finished.push(...changes)
      })
      .finally(() => {
        if (running === run) running = null
      })
    running = run
  }
  await Promise.race([running, new Promise((r) => setTimeout(r, POLL_WAIT_MS))])
  const changes = finished
  finished = []
  return { changes, running: running !== null }
}
