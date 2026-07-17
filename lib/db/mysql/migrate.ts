import { Kysely } from 'kysely'
import type { DbSchema } from '../types'
import { PREDEFINED_TAGS } from '../../constants'

// Module-level cache — reset on every hot-reload (module re-evaluation), so
// migrations re-run idempotently against the cached globalThis connection.
// Caching the in-flight promise (not just a boolean) means concurrent first
// calls (e.g. a page's simultaneous getTasks()/getTags() requests) await the
// same run instead of racing each other through the DDL below; clearing it on
// failure lets the next call retry instead of getting stuck.
let _migration: Promise<void> | null = null

export function ensureSchema(db: Kysely<DbSchema>): Promise<void> {
  if (!_migration) {
    _migration = runMigrations(db).catch((err) => {
      _migration = null
      throw err
    })
  }
  return _migration
}

// Unlike sqlite/migrate.ts, there's no incremental-migration history to
// replay here — a fresh MySQL database creates the current target schema
// directly, in one shot (same approach as postgres/migrate.ts).
async function runMigrations(db: Kysely<DbSchema>): Promise<void> {
  // id/FK columns use varchar(255) rather than text — MySQL can't index a
  // TEXT/BLOB column (primary/foreign keys included) without an explicit key
  // length. completed/archived use boolean, which MySQL stores as
  // TINYINT(1); the mysql2 driver reads it back as a JS number (0|1), same
  // as better-sqlite3, hence reusing sqlite's DbSchema/TasksTable (number,
  // not boolean) instead of a postgres-style dedicated schema.
  await db.schema
    .createTable('tasks')
    .ifNotExists()
    .addColumn('id', 'varchar(255)', (c) => c.primaryKey())
    .addColumn('title', 'text', (c) => c.notNull())
    .addColumn('description', 'text', (c) => c.notNull())
    .addColumn('completed', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('archived', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('due_date', 'text')
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('updated_at', 'text', (c) => c.notNull())
    .addColumn('completed_at', 'text')
    .addColumn('archived_at', 'text')
    .addColumn('sort_order', 'integer')
    .execute()

  await db.schema
    .createTable('tags')
    .ifNotExists()
    .addColumn('id', 'varchar(255)', (c) => c.primaryKey())
    .addColumn('label', 'text', (c) => c.notNull())
    .addColumn('color', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute()

  await db.schema
    .createTable('task_urls')
    .ifNotExists()
    .addColumn('id', 'varchar(255)', (c) => c.primaryKey())
    .addColumn('task_id', 'varchar(255)', (c) =>
      c.notNull().references('tasks.id').onDelete('cascade'),
    )
    .addColumn('url', 'text', (c) => c.notNull())
    .addColumn('label', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute()

  await db.schema
    .createTable('task_tags')
    .ifNotExists()
    .addColumn('task_id', 'varchar(255)', (c) =>
      c.notNull().references('tasks.id').onDelete('cascade'),
    )
    .addColumn('tag_id', 'varchar(255)', (c) =>
      c.notNull().references('tags.id').onDelete('cascade'),
    )
    .addColumn('position', 'integer', (c) => c.notNull().defaultTo(0))
    .addPrimaryKeyConstraint('task_tags_pk', ['task_id', 'tag_id'])
    .execute()

  // Seed predefined tags. MySQL has no `ON CONFLICT` — `.ignore()` compiles
  // to `INSERT IGNORE`, the closest equivalent, so user edits/deletes of
  // these tags are never overwritten. Fixed placeholder timestamp so
  // predefined tags always sort first (ascending created_at).
  for (const tag of PREDEFINED_TAGS) {
    await db
      .insertInto('tags')
      .values({
        id: tag.id,
        label: tag.label,
        color: tag.color,
        created_at: '2000-01-01T00:00:00.000Z',
      })
      .ignore()
      .execute()
  }
}
