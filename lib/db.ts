import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { PREDEFINED_TAGS } from './constants'

const globalForDb = globalThis as typeof globalThis & {
  db?: Database.Database
}

// Module-level flag — reset to false on every hot-reload (module re-evaluation),
// so migrations re-run idempotently against the cached globalThis.db connection.
let _migrated = false

function ensureMigrations(db: Database.Database) {
  try {
    db.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER')
  } catch {
    // column already exists
  }

  try {
    db.exec('ALTER TABLE tasks ADD COLUMN archived INTEGER NOT NULL DEFAULT 0')
  } catch {
    // column already exists
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS task_links (
      task_id TEXT NOT NULL,
      linked_task_id TEXT NOT NULL,
      PRIMARY KEY (task_id, linked_task_id)
    )
  `)

  // Initialize sort_order for any tasks that don't have one yet,
  // preserving the current newest-first display order (created_at DESC).
  const uninit = db
    .prepare('SELECT id FROM tasks WHERE sort_order IS NULL ORDER BY created_at DESC')
    .all() as { id: string }[]
  if (uninit.length > 0) {
    const setOrder = db.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?')
    const initTx = db.transaction(() => {
      uninit.forEach((row, i) => setOrder.run(i * 1000, row.id))
    })
    initTx()
  }
}

export function getDb(): Database.Database {
  if (!globalForDb.db) {
    const dataDir = path.join(process.cwd(), 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    const db = new Database(path.join(dataDir, 'tasks.db'))
    db.pragma('journal_mode = WAL')

    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)

    // Seed predefined tags (INSERT OR IGNORE so user data is never overwritten)
    const insertTag = db.prepare(
      'INSERT OR IGNORE INTO tags (id, label, color, created_at) VALUES (?, ?, ?, ?)',
    )
    const seedAll = db.transaction(() => {
      for (const tag of PREDEFINED_TAGS) {
        insertTag.run(tag.id, tag.label, tag.color, '2000-01-01T00:00:00.000Z')
      }
    })
    seedAll()

    globalForDb.db = db
  }

  if (!_migrated) {
    ensureMigrations(globalForDb.db)
    _migrated = true
  }

  return globalForDb.db
}
