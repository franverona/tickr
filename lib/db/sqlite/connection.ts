import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { Kysely, SqliteDialect } from 'kysely'
import type { DbSchema } from '../types'

const globalForDb = globalThis as typeof globalThis & {
  sqliteRaw?: Database.Database
  sqliteDb?: Kysely<DbSchema>
}

export function getSqliteRaw(): Database.Database {
  if (!globalForDb.sqliteRaw) {
    const dataDir = path.join(process.cwd(), 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    const db = new Database(path.join(dataDir, 'tasks.db'))
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    globalForDb.sqliteRaw = db
  }

  return globalForDb.sqliteRaw
}

export function getSqliteDb(): Kysely<DbSchema> {
  if (!globalForDb.sqliteDb) {
    globalForDb.sqliteDb = new Kysely<DbSchema>({
      dialect: new SqliteDialect({ database: getSqliteRaw() }),
    })
  }

  return globalForDb.sqliteDb
}
