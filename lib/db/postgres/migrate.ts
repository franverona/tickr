import { Kysely } from 'kysely'
import type { PgDbSchema } from './schema'
import { PREDEFINED_TAGS } from '../../constants'

// The in-flight promise is cached so concurrent first calls share one run;
// cleared on failure so the next call retries
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

  // Fresh databases only, so deleted predefined tags don't come back. onConflict
  // guards concurrent first starts; the fixed timestamp sorts them first.
  await db.transaction().execute(async (trx) => {
    const anyTag = await trx.selectFrom('tags').select('id').limit(1).executeTakeFirst()
    const anyTask = await trx.selectFrom('tasks').select('id').limit(1).executeTakeFirst()
    if (anyTag || anyTask) return
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
