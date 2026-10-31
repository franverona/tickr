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
  createTag,
  createTask,
  deleteTag,
  deleteTask,
  deleteTasks,
  getTasks,
  importTasks,
  reorderTasks,
  updateTag,
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

  it('does not let concurrent updates to different fields clobber each other', async () => {
    const task = await createTask({ title: 'Original', description: '', tags: [] })
    await Promise.all([
      updateTask(task.id, { title: 'New title' }),
      updateTask(task.id, { completed: true }),
    ])
    const [fromDb] = await getTasks()
    expect(fromDb.title).toBe('New title')
    expect(fromDb.completed).toBe(true)
  })
})

describe('tag names', () => {
  const color = 'bg-red-600 text-red-100 border-red-500'

  it.each(['日本語', 'Рефакторинг', 'Déjà vu', '🔥'])(
    'creates and round-trips %s',
    async (label) => {
      const tag = await createTag({ label, color })
      expect(tag).toMatchObject({ label })

      const task = await createTask({ title: 'T', description: '', tags: [tag.id] })
      expect(task.tags).toEqual([tag.id])
      const { tasks } = await importTasks(
        [
          {
            title: 'T',
            description: '',
            dueDate: null,
            links: [],
            completed: false,
            archived: false,
            tags: [{ label, color }],
          },
        ],
        true,
      )
      expect(tasks[0].tags).toHaveLength(1)
    },
  )

  it('still rejects a blank name', async () => {
    await expect(createTag({ label: '   ', color })).rejects.toThrow('Invalid tag name')
  })
})

describe('reorderTasks', () => {
  it('applies the new order', async () => {
    const a = await createTask({ title: 'A', description: '', tags: [] })
    const b = await createTask({ title: 'B', description: '', tags: [] })
    const c = await createTask({ title: 'C', description: '', tags: [] })

    await reorderTasks([c.id, a.id, b.id])

    const tasks = await getTasks()
    expect(tasks.map((t) => t.id)).toEqual([c.id, a.id, b.id])
  })

  it('does nothing for an empty list', async () => {
    await createTask({ title: 'A', description: '', tags: [] })
    await expect(reorderTasks([])).resolves.toBeUndefined()
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

    const result = await updateTasks([a.id, b.id], { completed: true })
    expect(result.failedIds).toEqual([])
    expect(result.succeeded.map((t) => t.completed)).toEqual([true, true])

    const tasks = await getTasks()
    expect(tasks.find((t) => t.id === a.id)?.completed).toBe(true)
    expect(tasks.find((t) => t.id === b.id)?.completed).toBe(true)
    expect(tasks.find((t) => t.id === c.id)?.completed).toBe(false)
  })

  it('applies the update to the ids that exist and reports the rest as failed', async () => {
    const a = await createTask({ title: 'A', description: '', tags: [] })

    const result = await updateTasks([a.id, 'nonexistent'], { completed: true })
    expect(result.failedIds).toEqual(['nonexistent'])
    expect(result.succeeded.map((t) => t.id)).toEqual([a.id])

    const tasks = await getTasks()
    expect(tasks.find((t) => t.id === a.id)?.completed).toBe(true)
  })
})

describe('deleteTasks', () => {
  it('removes every id and leaves untouched tasks alone', async () => {
    const a = await createTask({ title: 'A', description: '', tags: [] })
    const b = await createTask({ title: 'B', description: '', tags: [] })
    const c = await createTask({ title: 'C', description: '', tags: [] })

    const result = await deleteTasks([a.id, b.id])
    expect(result.failedIds).toEqual([])
    expect(result.succeededIds).toEqual([a.id, b.id])

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

describe('importTasks', () => {
  it('rolls back the override wipe when an insert fails', async () => {
    seedTag()
    const existing = await createTask({ title: 'Keep me', description: '', tags: [SEED_TAG.id] })

    // A null url violates task_urls.url NOT NULL partway through the inserts
    const bad = {
      title: 'Bad',
      description: '',
      tags: [],
      completed: false,
      archived: false,
      dueDate: null,
      links: [{ url: null as unknown as string, label: 'x' }],
    }
    await expect(importTasks([bad], true)).rejects.toThrow()

    const tasks = await getTasks()
    expect(tasks.map((t) => t.id)).toEqual([existing.id])
    expect(tasks[0].tags).toEqual([SEED_TAG.id])
  })

  it('re-links #id mentions to the regenerated task ids', async () => {
    const base = { tags: [], completed: false, archived: false, dueDate: null, links: [] }
    const { tasks } = await importTasks(
      [
        { ...base, id: 'old-a', title: 'A', description: '' },
        {
          ...base,
          id: 'old-b',
          title: 'B',
          description: 'See [A](#old-a) and [gone](#missing)',
        },
      ],
      false,
    )
    const a = tasks.find((t) => t.title === 'A')!
    const b = tasks.find((t) => t.title === 'B')!
    expect(a.id).not.toBe('old-a')
    expect(b.description).toBe(`See [A](#${a.id}) and [gone](#missing)`)
  })

  it('keeps imported timestamps and falls back to now when one is missing', async () => {
    const base = { description: '', tags: [], dueDate: null, links: [] }
    const before = new Date().toISOString()
    const { tasks } = await importTasks(
      [
        {
          ...base,
          title: 'Old',
          completed: true,
          archived: false,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
          completedAt: '2024-01-03T00:00:00.000Z',
        },
        { ...base, title: 'Fresh', completed: true, archived: true },
      ],
      false,
    )
    const old = tasks.find((t) => t.title === 'Old')!
    expect(old.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(old.updatedAt).toBe('2024-01-02T00:00:00.000Z')
    expect(old.completedAt).toBe('2024-01-03T00:00:00.000Z')
    expect(old.archivedAt).toBeNull()
    const fresh = tasks.find((t) => t.title === 'Fresh')!
    expect(fresh.createdAt >= before).toBe(true)
    expect(fresh.completedAt! >= before).toBe(true)
    expect(fresh.archivedAt! >= before).toBe(true)
  })
})

describe('duplicate tags', () => {
  it("rejects renaming a tag to another tag's label, ignoring case", async () => {
    seedTag(SEED_TAG)
    seedTag(BLOCKED_TAG)
    await expect(updateTag(BLOCKED_TAG.id, { label: 'wip' })).rejects.toThrow('already exists')
    await expect(updateTag(SEED_TAG.id, { label: 'wip' })).resolves.toMatchObject({ label: 'wip' })
  })

  it('stores a repeated tag id once on create and update', async () => {
    seedTag()
    const task = await createTask({ title: 'T', description: '', tags: ['wip', 'wip'] })
    expect(task.tags).toEqual(['wip'])
    const updated = await updateTask(task.id, { tags: ['wip', 'wip'] })
    expect(updated.tags).toEqual(['wip'])
  })

  it('imports labels that differ only in case as one tag', async () => {
    const color = SEED_TAG.color
    const { tasks } = await importTasks(
      [
        {
          title: 'T',
          description: '',
          tags: [
            { label: 'Bug', color },
            { label: 'bug', color },
          ],
          completed: false,
          archived: false,
          dueDate: null,
          links: [],
        },
      ],
      false,
    )
    expect(tasks[0].tags).toEqual(['bug'])
  })
})
