import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getTestDb } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Ctor = require('better-sqlite3') as typeof Database
  const db = new Ctor(':memory:')
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      due_date TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sort_order INTEGER
    );
    CREATE TABLE tags (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
  return { getTestDb: () => db }
})

vi.mock('../lib/db', () => ({ getDb: getTestDb }))

import { createTask, deleteTag, deleteTask, getTasks, updateTask } from '../app/actions'

const SEED_TAG = { id: 'wip', label: 'WIP', color: 'bg-blue-600 text-blue-100 border-blue-500' }

beforeEach(() => {
  getTestDb().exec('DELETE FROM tasks; DELETE FROM tags;')
})

function seedTag() {
  getTestDb()
    .prepare('INSERT INTO tags (id, label, color, created_at) VALUES (?, ?, ?, ?)')
    .run(SEED_TAG.id, SEED_TAG.label, SEED_TAG.color, new Date().toISOString())
}

describe('createTask', () => {
  it('returns correct JS types (not raw SQLite integers)', async () => {
    const task = await createTask({ title: 'Test task', description: '', tags: [], dueDate: null })
    expect(typeof task.id).toBe('string')
    expect(task.completed).toBe(false)
    expect(task.archived).toBe(false)
    expect(Array.isArray(task.tags)).toBe(true)
  })

  it('persists and returns tags as a string array', async () => {
    const task = await createTask({
      title: 'Tagged',
      description: '',
      tags: ['wip', 'blocked'],
      dueDate: null,
    })
    expect(task.tags).toEqual(['wip', 'blocked'])
  })

  it('places the newest task at the top (lower sort_order)', async () => {
    await createTask({ title: 'First', description: '', tags: [], dueDate: null })
    await createTask({ title: 'Second', description: '', tags: [], dueDate: null })
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
      dueDate: null,
    })
    const updated = await updateTask(task.id, { title: 'Changed' })
    expect(updated.title).toBe('Changed')
    expect(updated.description).toBe('Keep this')
  })

  it('round-trips the completed boolean through SQLite integers', async () => {
    const task = await createTask({ title: 'T', description: '', tags: [], dueDate: null })
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
    const task = await createTask({ title: 'Doomed', description: '', tags: [], dueDate: null })
    await deleteTask(task.id)
    expect(await getTasks()).toHaveLength(0)
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
    await createTask({ title: 'T', description: '', tags: [SEED_TAG.id], dueDate: null })
    await deleteTag(SEED_TAG.id)
    const [task] = await getTasks()
    expect(task.tags).toEqual([])
  })
})
