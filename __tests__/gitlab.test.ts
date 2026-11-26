import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbSchema } from '../lib/db/types'
import { ensureSchema } from '../lib/db/sqlite/migrate'
import { SqliteTaskRepository } from '../lib/db/sqlite/repository'
import {
  mapMrState,
  parseMrUrl,
  pollGitlabSync,
  resetGitlabThrottle,
  syncGitlabStatuses,
} from '../lib/gitlab'

const GL = 'https://gitlab.com'

// One DB for the file: ensureSchema() only runs once per module
const sqlite = new Database(':memory:')
const kysely = new Kysely<DbSchema>({ dialect: new SqliteDialect({ database: sqlite }) })
const repo = new SqliteTaskRepository(kysely)

describe('parseMrUrl', () => {
  it('reads project path and iid, subgroups included', () => {
    expect(parseMrUrl(`${GL}/acme/app/-/merge_requests/12`, GL)).toEqual({
      project: 'acme/app',
      iid: 12,
    })
    expect(parseMrUrl(`${GL}/acme/team/app/-/merge_requests/3/diffs?x=1`, GL)).toEqual({
      project: 'acme/team/app',
      iid: 3,
    })
    expect(parseMrUrl(`${GL}/acme/app/merge_requests/4`, GL)).toEqual({
      project: 'acme/app',
      iid: 4,
    })
  })

  it('rejects other hosts, non-MR links and garbage', () => {
    expect(parseMrUrl('https://evil.example/acme/app/-/merge_requests/1', GL)).toBeNull()
    expect(parseMrUrl('https://github.com/acme/app/pull/1', GL)).toBeNull()
    expect(parseMrUrl(`${GL}/acme/app/-/issues/1`, GL)).toBeNull()
    expect(parseMrUrl('not a url', GL)).toBeNull()
    expect(parseMrUrl(`${GL}/acme/%zz/-/merge_requests/1`, GL)).toBeNull()
  })

  it('handles a GitLab installed under a sub-path', () => {
    const base = 'https://host.example/gitlab'
    expect(parseMrUrl(`${base}/acme/app/-/merge_requests/5`, base)).toEqual({
      project: 'acme/app',
      iid: 5,
    })
    expect(parseMrUrl('https://host.example/acme/app/-/merge_requests/5', base)).toBeNull()
    expect(parseMrUrl('https://host.example/gitlabx/acme/app/-/merge_requests/5', base)).toBeNull()
  })
})

describe('mapMrState', () => {
  it('maps GitLab states', () => {
    expect(mapMrState({ state: 'opened' })).toBeNull()
    expect(mapMrState({ state: 'opened', draft: true })).toBe('draft')
    expect(mapMrState({ state: 'merged' })).toBe('merged')
    expect(mapMrState({ state: 'closed' })).toBe('closed')
    expect(mapMrState({ state: 'locked' })).toBeUndefined()
  })
})

describe('syncGitlabStatuses', () => {
  const fetchMock = vi.fn()

  beforeEach(async () => {
    await ensureSchema(kysely)
    sqlite.exec('DELETE FROM task_tags; DELETE FROM task_urls; DELETE FROM tasks;')
    resetGitlabThrottle()
    vi.stubEnv('GITLAB_TOKEN', 'tok')
    vi.stubEnv('GITLAB_URL', '')
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    fetchMock.mockReset()
  })

  async function taskWithLinks(urls: string[]) {
    let task = await repo.createTask({ title: 'T', description: '', tags: [], dueDate: null })
    for (const url of urls) task = await repo.addTaskUrl(task.id, { url, label: '' })
    return task
  }

  function respond(body: unknown, status = 200, headers: Record<string, string> = {}) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers }))
  }

  it('does nothing without a token', async () => {
    vi.stubEnv('GITLAB_TOKEN', '')
    await taskWithLinks([`${GL}/acme/app/-/merge_requests/1`])
    expect(await syncGitlabStatuses(repo)).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('makes one request per project and saves changed statuses', async () => {
    await taskWithLinks([
      `${GL}/acme/app/-/merge_requests/1`,
      `${GL}/acme/app/-/merge_requests/2`,
      `${GL}/acme/api/-/merge_requests/9`,
      'https://jira.example/browse/X-1',
    ])
    respond([
      { iid: 1, state: 'opened', draft: true },
      { iid: 2, state: 'merged' },
    ])
    respond([{ iid: 9, state: 'opened' }])

    const changes = await syncGitlabStatuses(repo)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      `${GL}/api/v4/projects/acme%2Fapp/merge_requests?per_page=100&iids%5B%5D=1&iids%5B%5D=2`,
    )
    expect(init.headers).toEqual({ 'PRIVATE-TOKEN': 'tok' })
    expect(init.redirect).toBe('manual')
    expect(changes.map((c) => c.status)).toEqual(['draft', 'merged'])
    const [saved] = await repo.getTasks()
    expect(saved.urls.map((u) => u.status)).toEqual(['draft', 'merged', undefined, undefined])
  })

  it('skips merged/closed links, archived tasks and other hosts', async () => {
    const t = await taskWithLinks([
      `${GL}/acme/app/-/merge_requests/1`,
      'https://gitlab.internal/acme/app/-/merge_requests/2',
    ])
    await repo.setTaskUrlStatus(t.id, t.urls[0].id, 'merged')
    const archived = await taskWithLinks([`${GL}/acme/app/-/merge_requests/3`])
    await repo.updateTask(archived.id, { archived: true })

    expect(await syncGitlabStatuses(repo)).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('checks each link at most once per interval, but new and edited links right away', async () => {
    const t = await taskWithLinks([`${GL}/acme/app/-/merge_requests/1`])
    respond([{ iid: 1, state: 'opened' }])
    await syncGitlabStatuses(repo)
    await syncGitlabStatuses(repo)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const withNew = await repo.addTaskUrl(t.id, {
      url: `${GL}/acme/app/-/merge_requests/2`,
      label: '',
    })
    respond([{ iid: 2, state: 'merged' }])
    expect(await syncGitlabStatuses(repo)).toEqual([
      { taskId: t.id, urlId: withNew.urls[1].id, status: 'merged' },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toContain('iids%5B%5D=2')

    await repo.updateTaskUrl(t.id, withNew.urls[0].id, {
      url: `${GL}/acme/app/-/merge_requests/3`,
      label: '',
    })
    respond([{ iid: 3, state: 'opened', draft: true }])
    await syncGitlabStatuses(repo)
    expect(fetchMock.mock.calls[2][0]).toContain('iids%5B%5D=3')
  })

  it('runs concurrent calls without fetching the same links twice', async () => {
    await taskWithLinks([`${GL}/acme/app/-/merge_requests/1`])
    respond([{ iid: 1, state: 'opened' }])
    await Promise.all([syncGitlabStatuses(repo), syncGitlabStatuses(repo)])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stops on 429 and keeps stored statuses', async () => {
    await taskWithLinks([`${GL}/acme/app/-/merge_requests/1`, `${GL}/acme/api/-/merge_requests/2`])
    respond({ message: 'rate limited' }, 429, { 'Retry-After': '60' })
    expect(await syncGitlabStatuses(repo)).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('swallows network errors', async () => {
    await taskWithLinks([`${GL}/acme/app/-/merge_requests/1`])
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect(await syncGitlabStatuses(repo)).toEqual([])
  })

  it('pauses after a network error instead of retrying on every call', async () => {
    const t = await taskWithLinks([`${GL}/acme/app/-/merge_requests/1`])
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await syncGitlabStatuses(repo)
    await repo.addTaskUrl(t.id, { url: `${GL}/acme/app/-/merge_requests/2`, label: '' })
    await syncGitlabStatuses(repo)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('skips a redirecting project without following it or pausing', async () => {
    await taskWithLinks([`${GL}/acme/app/-/merge_requests/1`, `${GL}/acme/api/-/merge_requests/2`])
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }),
    )
    respond([{ iid: 2, state: 'merged' }])
    expect((await syncGitlabStatuses(repo)).map((c) => c.status)).toEqual(['merged'])
  })

  it('skips a response that is not a list', async () => {
    await taskWithLinks([`${GL}/acme/app/-/merge_requests/1`, `${GL}/acme/api/-/merge_requests/2`])
    respond({ message: 'Sign in' })
    respond([{ iid: 2, state: 'merged' }])
    expect((await syncGitlabStatuses(repo)).map((c) => c.status)).toEqual(['merged'])
  })

  it('splits more than 100 MRs of one project into several requests', async () => {
    await taskWithLinks(
      Array.from({ length: 101 }, (_, i) => `${GL}/acme/app/-/merge_requests/${i + 1}`),
    )
    respond([{ iid: 1, state: 'merged' }])
    respond([{ iid: 101, state: 'merged' }])
    expect(await syncGitlabStatuses(repo)).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toContain('iids%5B%5D=101')
  })

  it('keeps going when a task is deleted mid-sync', async () => {
    const gone = await taskWithLinks([`${GL}/acme/app/-/merge_requests/1`])
    await taskWithLinks([`${GL}/acme/api/-/merge_requests/2`])
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('acme%2Fapp')) await repo.deleteTask(gone.id)
      return new Response(
        JSON.stringify([{ iid: url.includes('acme%2Fapp') ? 1 : 2, state: 'merged' }]),
      )
    })
    expect((await syncGitlabStatuses(repo)).map((c) => c.urlId)).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('uses a sub-path GITLAB_URL for the API', async () => {
    vi.stubEnv('GITLAB_URL', 'https://host.example/gitlab/')
    await taskWithLinks(['https://host.example/gitlab/acme/app/-/merge_requests/1'])
    respond([{ iid: 1, state: 'merged' }])
    await syncGitlabStatuses(repo)
    expect(fetchMock.mock.calls[0][0]).toMatch(
      /^https:\/\/host\.example\/gitlab\/api\/v4\/projects\/acme%2Fapp\//,
    )
  })
})

describe('pollGitlabSync', () => {
  beforeEach(async () => {
    await ensureSchema(kysely)
    resetGitlabThrottle()
    vi.stubEnv('GITLAB_TOKEN', 'tok')
    vi.stubEnv('GITLAB_URL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns while GitLab is slow, then hands over the result on a later call', async () => {
    const task = await repo.createTask({ title: 'T', description: '', tags: [], dueDate: null })
    await repo.addTaskUrl(task.id, { url: `${GL}/acme/app/-/merge_requests/1`, label: '' })
    let answer!: () => void
    const gate = new Promise<void>((r) => (answer = r))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await gate
        return new Response(JSON.stringify([{ iid: 1, state: 'merged' }]))
      }),
    )

    expect(await pollGitlabSync(repo)).toEqual({ changes: [], running: true })
    answer()
    await vi.waitFor(async () => {
      const { changes } = await pollGitlabSync(repo)
      expect(changes.map((c) => c.status)).toEqual(['merged'])
    })
    expect(await pollGitlabSync(repo)).toEqual({ changes: [], running: false })
  })
})
