import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { PREDEFINED_TAGS } from './constants'

const globalForDb = globalThis as typeof globalThis & {
  db?: Database.Database
}

export function getDb(): Database.Database {
  if (globalForDb.db) return globalForDb.db

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
      due_date TEXT,
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
  return db
}
