import Database from 'better-sqlite3'
import JSZip from 'jszip'
import { Kysely, SqliteDialect } from 'kysely'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBackup } from '../lib/backup'
import type { DbSchema, TaskRepository } from '../lib/db/types'
import { parseJSONContent } from '../lib/import'

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

describe('createBackup', () => {
  it('writes an importable ZIP with the uploads the descriptions reference', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'tickr-backup-'))
    const uploadsDir = path.join(dir, 'uploads')
    const outDir = path.join(dir, 'backups')
    await mkdir(uploadsDir)
    await writeFile(path.join(uploadsDir, 'a.png'), 'png bytes')

    const repo = await makeSqliteRepo()
    await repo.createTag({ label: 'Unused', color: 'bg-red-600 text-red-100 border-red-500' })
    await repo.createTask({
      title: 'With files',
      description: '![a](/uploads/a.png) [gone](/uploads/missing.pdf)',
      tags: [],
    })

    const file = await createBackup({
      repo,
      uploadsDir,
      outDir,
      now: new Date(2026, 2, 4, 9, 5, 7),
    })
    expect(path.basename(file)).toBe('tickr-2026-03-04-090507.zip')

    const zip = await JSZip.loadAsync(await readFile(file))
    expect(await zip.file('uploads/a.png')!.async('string')).toBe('png bytes')
    expect(zip.file('uploads/missing.pdf')).toBeNull()
    const [task] = parseJSONContent(await zip.file('tasks.json')!.async('string'))
    expect(task.title).toBe('With files')
    expect(task.description).toBe('![a](uploads/a.png) [gone](uploads/missing.pdf)')
    expect(JSON.parse(await zip.file('tags.json')!.async('string'))).toContainEqual(
      expect.objectContaining({ label: 'Unused' }),
    )
  })

  it('keeps older backups when there are no tasks', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'tickr-backup-'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const repo = await makeSqliteRepo()
    const old = path.join(dir, 'tickr-2020-01-01-000000.zip')
    await writeFile(old, 'real backup')

    await createBackup({ repo, uploadsDir: path.join(dir, 'uploads'), outDir: dir, keep: 1 })

    expect(await readFile(old, 'utf8')).toBe('real backup')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('keeps only the newest backups', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'tickr-backup-'))
    const repo = await makeSqliteRepo()
    await repo.createTask({ title: 'T', description: '', tags: [] })
    const opts = { repo, uploadsDir: path.join(dir, 'uploads'), outDir: dir, keep: 2 }

    for (const day of [1, 2, 3]) await createBackup({ ...opts, now: new Date(2026, 0, day) })

    expect((await readdir(dir)).sort()).toEqual([
      'tickr-2026-01-02-000000.zip',
      'tickr-2026-01-03-000000.zip',
    ])
  })
})
