import { Kysely, sql } from 'kysely'
import type { DbSchema } from '../types'
import { PREDEFINED_TAGS } from '../../constants'

// The in-flight promise is cached so concurrent first calls share one run;
// cleared on failure so the next call retries
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

async function runMigrations(db: Kysely<DbSchema>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `.execute(db)

  await sql`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `.execute(db)

  // Idempotent ALTER TABLE ADD COLUMN migrations — SQLite has no IF NOT EXISTS
  // for ADD COLUMN, so each is wrapped to swallow "column already exists".
  try {
    await sql`ALTER TABLE tasks ADD COLUMN sort_order INTEGER`.execute(db)
  } catch {
    // column already exists
  }
  try {
    await sql`ALTER TABLE tasks ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`.execute(db)
  } catch {
    // column already exists
  }
  try {
    await sql`ALTER TABLE tasks ADD COLUMN due_date TEXT`.execute(db)
  } catch {
    // column already exists
  }
  try {
    await sql`ALTER TABLE tasks ADD COLUMN completed_at TEXT`.execute(db)
  } catch {
    // column already exists
  }
  try {
    await sql`ALTER TABLE tasks ADD COLUMN archived_at TEXT`.execute(db)
  } catch {
    // column already exists
  }

  // Backfill timestamps for tasks that are already done/archived from before
  // these columns existed, so they don't all sort as "oldest" together.
  await sql`UPDATE tasks SET completed_at = updated_at WHERE completed = 1 AND completed_at IS NULL`.execute(
    db,
  )
  await sql`UPDATE tasks SET archived_at = updated_at WHERE archived = 1 AND archived_at IS NULL`.execute(
    db,
  )

  await sql`
    CREATE TABLE IF NOT EXISTS task_urls (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `.execute(db)

  // Rebuild task_urls if it predates its FK (SQLite can't ALTER one in). In a
  // transaction so a failure rolls back; DROP IF EXISTS clears older leftovers.
  const urlFks = await sql<{ table: string }>`
    SELECT "table" FROM pragma_foreign_key_list('task_urls')
  `.execute(db)
  if (urlFks.rows.length === 0) {
    await db.transaction().execute(async (trx) => {
      await sql`DROP TABLE IF EXISTS task_urls_new`.execute(trx)
      await sql`
        CREATE TABLE task_urls_new (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          url TEXT NOT NULL,
          label TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `.execute(trx)
      // Orphans from before the FK would violate it
      await sql`
        INSERT INTO task_urls_new (id, task_id, url, label, created_at)
        SELECT id, task_id, url, label, created_at FROM task_urls
        WHERE task_id IN (SELECT id FROM tasks)
      `.execute(trx)
      await sql`DROP TABLE task_urls`.execute(trx)
      await sql`ALTER TABLE task_urls_new RENAME TO task_urls`.execute(trx)
    })
  }

  // Initialize sort_order for any tasks that don't have one yet,
  // preserving the current newest-first display order (created_at DESC).
  const uninit = await db
    .selectFrom('tasks')
    .select('id')
    .where('sort_order', 'is', null)
    .orderBy('created_at', 'desc')
    .execute()
  if (uninit.length > 0) {
    await db.transaction().execute(async (trx) => {
      for (let i = 0; i < uninit.length; i++) {
        await trx
          .updateTable('tasks')
          .set({ sort_order: i * 1000 })
          .where('id', '=', uninit[i].id)
          .execute()
      }
    })
  }

  await sql`
    CREATE TABLE IF NOT EXISTS task_tags (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (task_id, tag_id)
    )
  `.execute(db)

  // One-time cutover from the legacy tasks.tags JSON column. Backfill and DROP
  // share a transaction, so neither happens without the other.
  const taskCols = await sql<{ name: string }>`SELECT name FROM pragma_table_info('tasks')`.execute(
    db,
  )
  if (taskCols.rows.some((c) => c.name === 'tags')) {
    const legacyRows = await sql<{ id: string; tags: string }>`SELECT id, tags FROM tasks`.execute(
      db,
    )
    const existingTags = await db.selectFrom('tags').select('id').execute()
    const validTagIds = new Set(existingTags.map((t) => t.id))

    await db.transaction().execute(async (trx) => {
      for (const row of legacyRows.rows) {
        let tagIds: string[]
        try {
          tagIds = JSON.parse(row.tags)
        } catch {
          tagIds = []
        }
        let position = 0
        for (const tagId of tagIds) {
          if (!validTagIds.has(tagId)) continue
          await trx
            .insertInto('task_tags')
            .values({ task_id: row.id, tag_id: tagId, position })
            .onConflict((oc) => oc.doNothing())
            .execute()
          position++
        }
      }
      await sql`ALTER TABLE tasks DROP COLUMN tags`.execute(trx)
    })
  }

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
