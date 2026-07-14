import { Kysely, sql } from 'kysely'
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

  // task_urls may pre-date the ON DELETE CASCADE constraint above (SQLite can't
  // ALTER TABLE to add a foreign key). Rebuild it if it's missing one. SQLite's
  // DDL is transactional, so wrapping the whole rebuild means a failure partway
  // through rolls back cleanly instead of leaving an orphaned task_urls_new
  // that collides with the CREATE TABLE on the next retry; the DROP TABLE IF
  // EXISTS also self-heals any such leftover from before this fix existed.
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
      await sql`
        INSERT INTO task_urls_new (id, task_id, url, label, created_at)
        SELECT id, task_id, url, label, created_at FROM task_urls
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

  // One-time cutover: backfill task_tags from the legacy tasks.tags JSON
  // column, then drop it. Guarded by column existence (not a version table,
  // consistent with the ADD COLUMN migrations above) since a stray read after
  // the drop would throw, unlike the try/catch-swallowed ADD COLUMN pattern.
  // The backfill and the DROP COLUMN share one transaction (SQLite's DDL is
  // transactional) so a failure partway through can't leave the column
  // dropped without the backfill, or vice versa; onConflict doNothing makes a
  // retry after a pre-fix partial failure safe too.
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
