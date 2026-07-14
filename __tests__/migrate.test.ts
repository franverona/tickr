import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { describe, expect, it } from 'vitest'
import type { DbSchema } from '../lib/db/types'
import { ensureSchema } from '../lib/db/sqlite/migrate'

describe('ensureSchema', () => {
  it('self-heals a task_urls_new left behind by a previously interrupted migration, drops orphaned task_urls rows, and dedupes concurrent calls', async () => {
    const raw = new Database(':memory:')
    raw.pragma('foreign_keys = ON')

    // Old (pre-migration) schema, matching a real main-branch database.
    raw.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE tags (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE task_urls (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        url TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)
    raw
      .prepare('INSERT INTO tasks (id, title, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('t1', 'Real task', '["wip"]', '2026-01-01', '2026-01-01')
    raw
      .prepare('INSERT INTO tags (id, label, color, created_at) VALUES (?, ?, ?, ?)')
      .run('wip', 'WIP', 'bg-blue-600 text-blue-100 border-blue-500', '2026-01-01')
    raw
      .prepare('INSERT INTO task_urls (id, task_id, url, label, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('u1', 't1', 'https://example.com', 'Example', '2026-01-01')
    // A URL row referencing a task that was already deleted — possible
    // because task_urls.task_id has no FK in the old schema (the exact
    // pre-existing bug this rebuild fixes), so real databases can have these.
    raw
      .prepare('INSERT INTO task_urls (id, task_id, url, label, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('u2', 'deleted-task', 'https://orphaned.example.com', 'Orphan', '2026-01-01')

    // Simulate the exact broken state: an orphaned task_urls_new left behind
    // by a previously interrupted migration attempt (the bug the user hit).
    raw.exec(`
      CREATE TABLE task_urls_new (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)

    const db = new Kysely<DbSchema>({ dialect: new SqliteDialect({ database: raw }) })

    // Calling it twice concurrently also exercises the promise-cache dedup
    // (two near-simultaneous callers, e.g. a page's getTasks()+getTags() on
    // mount, must not each independently race through the migration).
    await expect(Promise.all([ensureSchema(db), ensureSchema(db)])).resolves.toBeDefined()

    const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string
    }[]
    expect(tables.map((t) => t.name)).not.toContain('task_urls_new')

    const urlFks = raw.prepare('PRAGMA foreign_key_list(task_urls)').all()
    expect(urlFks.length).toBeGreaterThan(0)

    const task = raw.prepare('SELECT * FROM tasks WHERE id = ?').get('t1') as Record<
      string,
      unknown
    >
    expect(task.tags).toBeUndefined() // legacy column dropped

    const taskTags = raw.prepare('SELECT * FROM task_tags WHERE task_id = ?').all('t1')
    expect(taskTags).toEqual([{ task_id: 't1', tag_id: 'wip', position: 0 }])

    const urls = raw.prepare('SELECT id, task_id, url, label FROM task_urls').all()
    expect(urls).toEqual([
      { id: 'u1', task_id: 't1', url: 'https://example.com', label: 'Example' },
    ])
  })
})
