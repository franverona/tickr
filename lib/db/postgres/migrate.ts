import { Kysely } from 'kysely'
import type { PgDbSchema } from './schema'
import { PREDEFINED_TAGS } from '../../constants'

// Module-level cache — reset on every hot-reload (module re-evaluation), so
// migrations re-run idempotently against the cached globalThis connection.
// Caching the in-flight promise (not just a boolean) means concurrent first
// calls (e.g. a page's simultaneous getTasks()/getTags() requests) await the
// same run instead of racing each other through the DDL below; clearing it on
// failure lets the next call retry instead of getting stuck.
let _migration: Promise<void> | null = null

export function ensureSchema(db: Kysely<PgDbSchema>): Promise<void> {
  if (!_migration) {
    _migration = runMigrations(db).catch((err) => {
      _migration = null
      throw err
    })
  }
  return _migration
}

// Unlike sqlite/migrate.ts, there's no incremental-migration history to
// replay here — a fresh Postgres database creates the current target schema
// directly, in one shot.
async function runMigrations(db: Kysely<PgDbSchema>): Promise<void> {
  await db.schema
    .createTable('tasks')
    .ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('title', 'text', (c) => c.notNull())
    .addColumn('description', 'text', (c) => c.notNull().defaultTo(''))
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
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('label', 'text', (c) => c.notNull())
    .addColumn('color', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute()

  await db.schema
    .createTable('task_urls')
    .ifNotExists()
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('task_id', 'text', (c) => c.notNull().references('tasks.id').onDelete('cascade'))
    .addColumn('url', 'text', (c) => c.notNull())
    .addColumn('label', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute()

  await db.schema
    .createTable('task_tags')
    .ifNotExists()
    .addColumn('task_id', 'text', (c) => c.notNull().references('tasks.id').onDelete('cascade'))
    .addColumn('tag_id', 'text', (c) => c.notNull().references('tags.id').onDelete('cascade'))
    .addColumn('position', 'integer', (c) => c.notNull().defaultTo(0))
    .addPrimaryKeyConstraint('task_tags_pk', ['task_id', 'tag_id'])
    .execute()

  // Seed predefined tags (onConflict doNothing so user edits/deletes of these
  // tags are never overwritten), with a fixed placeholder timestamp so
  // predefined tags always sort first (ascending created_at).
  await db.transaction().execute(async (trx) => {
    for (const tag of PREDEFINED_TAGS) {
      await trx
        .insertInto('tags')
        .values({
          id: tag.id,
          label: tag.label,
          color: tag.color,
          created_at: '2000-01-01T00:00:00.000Z',
        })
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  })
}
