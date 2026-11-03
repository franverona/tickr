import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { mkdtemp, readdir, rm, utimes, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DbSchema, TaskRepository } from '../lib/db/types'
import { findOrphanUploads, removeUploads } from '../lib/prune-uploads'

// See cross-backend-import-export.test.ts: a fresh migrate module per in-memory DB
async function makeSqliteRepo(): Promise<TaskRepository> {
  vi.resetModules()
  const { SqliteTaskRepository } = await import('../lib/db/sqlite/repository')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  return new SqliteTaskRepository(
    new Kysely<DbSchema>({ dialect: new SqliteDialect({ database: db }) }),
  )
}

let dir: string
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const DAY = 24 * 60 * 60 * 1000

async function file(name: string, ageMs: number) {
  await writeFile(path.join(dir, name), 'x')
  const t = new Date(Date.now() - ageMs)
  await utimes(path.join(dir, name), t, t)
}

describe('findOrphanUploads', () => {
  it('lists old unreferenced uploads, keeping referenced and recent ones', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'tickr-uploads-'))
    const repo = await makeSqliteRepo()
    await repo.createTask({ title: 'T', description: '![a](/uploads/used.png)', tags: [] })
    await file('used.png', 3 * DAY)
    await file('gone.pdf', 3 * DAY)
    await file('fresh.png', 60 * 1000)

    const { taskCount, orphans } = await findOrphanUploads({ repo, uploadsDir: dir })
    expect(taskCount).toBe(1)
    expect(orphans).toEqual([{ name: 'gone.pdf', bytes: 1 }])

    await removeUploads(
      dir,
      orphans.map((o) => o.name),
    )
    expect((await readdir(dir)).sort()).toEqual(['fresh.png', 'used.png'])
  })

  it('reports no tasks so the caller can refuse to prune', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'tickr-uploads-'))
    await file('a.png', 3 * DAY)
    const { taskCount, orphans } = await findOrphanUploads({
      repo: await makeSqliteRepo(),
      uploadsDir: dir,
    })
    expect(taskCount).toBe(0)
    expect(orphans.map((o) => o.name)).toEqual(['a.png'])
  })

  it('treats a missing uploads folder as empty', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'tickr-uploads-'))
    const repo = await makeSqliteRepo()
    const result = await findOrphanUploads({ repo, uploadsDir: path.join(dir, 'missing') })
    expect(result.orphans).toEqual([])
  })
})
