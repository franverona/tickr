import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbSchema } from '../lib/db/types'

const { getTestDb } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Ctor = require('better-sqlite3') as typeof Database
  const db = new Ctor(':memory:')
  db.pragma('foreign_keys = ON')
  return { getTestDb: () => db }
})

// Builds the in-memory DB through the real schema/migration code path (rather
// than a hand-duplicated DDL copy) so the test fixture can't drift from the
// production schema.
vi.mock('../lib/db', async () => {
  const { Kysely, SqliteDialect } = await import('kysely')
  const { ensureSchema } = await import('../lib/db/sqlite/migrate')
  const { SqliteTaskRepository } = await import('../lib/db/sqlite/repository')
  const kysely = new Kysely<DbSchema>({ dialect: new SqliteDialect({ database: getTestDb() }) })
  await ensureSchema(kysely)
  const repository = new SqliteTaskRepository(kysely)
  return { getRepository: () => repository }
})

import {
  createTask,
  deleteTag,
  deleteTask,
  deleteTasks,
  getTasks,
  updateTask,
  updateTasks,
} from '../app/actions'

const SEED_TAG = { id: 'wip', label: 'WIP', color: 'bg-blue-600 text-blue-100 border-blue-500' }
const BLOCKED_TAG = {
  id: 'blocked',
  label: 'Blocked',
  color: 'bg-red-600 text-red-100 border-red-500',
}

beforeEach(() => {
  getTestDb().exec(
    'DELETE FROM task_tags; DELETE FROM task_urls; DELETE FROM tasks; DELETE FROM tags;',
  )
})

function seedTag(tag: { id: string; label: string; color: string } = SEED_TAG) {
  getTestDb()
    .prepare('INSERT INTO tags (id, label, color, created_at) VALUES (?, ?, ?, ?)')
    .run(tag.id, tag.label, tag.color, new Date().toISOString())
}

describe('createTask', () => {
  it('returns correct JS types (not raw SQLite integers)', async () => {
    const task = await createTask({ title: 'Test task', description: '', tags: [] })
    expect(typeof task.id).toBe('string')
    expect(task.completed).toBe(false)
    expect(task.archived).toBe(false)
    expect(Array.isArray(task.tags)).toBe(true)
  })

  it('persists and returns tags as a string array, in order', async () => {
    seedTag(SEED_TAG)
    seedTag(BLOCKED_TAG)
    const task = await createTask({
      title: 'Tagged',
      description: '',
      tags: ['wip', 'blocked'],
    })
    expect(task.tags).toEqual(['wip', 'blocked'])
  })

  it('places the newest task at the top (lower sort_order)', async () => {
    await createTask({ title: 'First', description: '', tags: [] })
    await createTask({ title: 'Second', description: '', tags: [] })
    const tasks = await getTasks()
    expect(tasks[0].title).toBe('Second')
    expect(tasks[1].title).toBe('First')
  })
})

describe('updateTask', () => {
  it('updates only the provided fields and preserves the rest', async () => {
    const task = await createTask({
      title: 'Original',
      description: 'Keep this',
      tags: [],
    })
    const updated = await updateTask(task.id, { title: 'Changed' })
    expect(updated.title).toBe('Changed')
    expect(updated.description).toBe('Keep this')
  })

  it('round-trips the completed boolean through SQLite integers', async () => {
    const task = await createTask({ title: 'T', description: '', tags: [] })
    const updated = await updateTask(task.id, { completed: true })
    expect(updated.completed).toBe(true)
    const [fromDb] = await getTasks()
    expect(fromDb.completed).toBe(true)
  })

  it('throws when the task does not exist', async () => {
    await expect(updateTask('nonexistent', { title: 'X' })).rejects.toThrow()
  })
})

describe('deleteTask', () => {
  it('removes the task from the database', async () => {
    const task = await createTask({ title: 'Doomed', description: '', tags: [] })
    await deleteTask(task.id)
    expect(await getTasks()).toHaveLength(0)
  })
})

describe('updateTasks', () => {
  it('applies the update to every id and leaves untouched tasks alone', async () => {
    const a = await createTask({ title: 'A', description: '', tags: [] })
    const b = await createTask({ title: 'B', description: '', tags: [] })
    const c = await createTask({ title: 'C', description: '', tags: [] })

    const updated = await updateTasks([a.id, b.id], { completed: true })
    expect(updated.map((t) => t.completed)).toEqual([true, true])

    const tasks = await getTasks()
    expect(tasks.find((t) => t.id === a.id)?.completed).toBe(true)
    expect(tasks.find((t) => t.id === b.id)?.completed).toBe(true)
    expect(tasks.find((t) => t.id === c.id)?.completed).toBe(false)
  })
})

describe('deleteTasks', () => {
  it('removes every id and leaves untouched tasks alone', async () => {
    const a = await createTask({ title: 'A', description: '', tags: [] })
    const b = await createTask({ title: 'B', description: '', tags: [] })
    const c = await createTask({ title: 'C', description: '', tags: [] })

    await deleteTasks([a.id, b.id])

    const tasks = await getTasks()
    expect(tasks.map((t) => t.id)).toEqual([c.id])
  })
})

describe('deleteTag', () => {
  it('removes the tag from the tags table', async () => {
    seedTag()
    await deleteTag(SEED_TAG.id)
    const tag = getTestDb().prepare('SELECT id FROM tags WHERE id = ?').get(SEED_TAG.id)
    expect(tag).toBeUndefined()
  })

  it('strips the deleted tag from every task that references it', async () => {
    seedTag()
    await createTask({ title: 'T', description: '', tags: [SEED_TAG.id] })
    await deleteTag(SEED_TAG.id)
    const [task] = await getTasks()
    expect(task.tags).toEqual([])
  })
})
