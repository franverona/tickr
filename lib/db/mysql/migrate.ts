import { Kysely, sql } from 'kysely'
import type { DbSchema } from '../types'
import { PREDEFINED_TAG_CREATED_AT, PREDEFINED_TAGS } from '../../constants'

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

// Binary collation on id/FK columns: MySQL's default (utf8mb4_0900_ai_ci) is
// accent-insensitive, so slugs like `café` and `cafe` would collide
const ID = sql`varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`
const ID_COLUMNS: Array<[table: string, column: string]> = [
  ['tasks', 'id'],
  ['tags', 'id'],
  ['task_urls', 'id'],
  ['task_urls', 'task_id'],
  ['task_tags', 'task_id'],
  ['task_tags', 'tag_id'],
]

async function runMigrations(db: Kysely<DbSchema>): Promise<void> {
  // varchar(255) ids: MySQL can't index TEXT without a key length. mysql2 reads
  // boolean (TINYINT(1)) back as 0|1, hence sqlite's DbSchema.
  await db.schema
    .createTable('tasks')
    .ifNotExists()
    .addColumn('id', ID, (c) => c.primaryKey())
    .addColumn('title', 'text', (c) => c.notNull())
    // mediumtext (16 MB): MySQL's text caps at 64 KB, too small for long Markdown
    .addColumn('description', sql`mediumtext`, (c) => c.notNull())
    .addColumn('completed', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('archived', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('due_date', 'text')
    .addColumn('created_at', 'text', (c) => c.notNull())
    .addColumn('updated_at', 'text', (c) => c.notNull())
    .addColumn('completed_at', 'text')
    .addColumn('archived_at', 'text')
    .addColumn('sort_order', 'integer')
    .execute()

  // Databases created before description was mediumtext. Checked first because
  // MODIFY can rebuild the whole table.
  const { rows } = await sql<{ DATA_TYPE: string }>`
    SELECT DATA_TYPE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'description'
  `.execute(db)
  if (rows[0]?.DATA_TYPE === 'text') {
    await sql`ALTER TABLE tasks MODIFY description MEDIUMTEXT NOT NULL`.execute(db)
  }

  await db.schema
    .createTable('tags')
    .ifNotExists()
    .addColumn('id', ID, (c) => c.primaryKey())
    .addColumn('label', 'text', (c) => c.notNull())
    .addColumn('color', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute()

  await db.schema
    .createTable('task_urls')
    .ifNotExists()
    .addColumn('id', ID, (c) => c.primaryKey())
    .addColumn('task_id', ID, (c) => c.notNull().references('tasks.id').onDelete('cascade'))
    .addColumn('url', 'text', (c) => c.notNull())
    .addColumn('label', 'text', (c) => c.notNull())
    .addColumn('created_at', 'text', (c) => c.notNull())
    .execute()

  await db.schema
    .createTable('task_tags')
    .ifNotExists()
    .addColumn('task_id', ID, (c) => c.notNull().references('tasks.id').onDelete('cascade'))
    .addColumn('tag_id', ID, (c) => c.notNull().references('tags.id').onDelete('cascade'))
    .addColumn('position', 'integer', (c) => c.notNull().defaultTo(0))
    .addPrimaryKeyConstraint('task_tags_pk', ['task_id', 'tag_id'])
    .execute()

  // Databases created before the id columns were binary. FK checks are off so
  // a referenced column and its references can change in turn; that setting is
  // per session, hence one pinned connection.
  const { rows: idCollations } = await sql<{ n: number }>`
    SELECT COUNT(*) AS n FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND COLLATION_NAME <> 'utf8mb4_bin'
      AND (TABLE_NAME, COLUMN_NAME) IN (${sql.join(ID_COLUMNS.map(([t, c]) => sql`(${t}, ${c})`))})
  `.execute(db)
  if (Number(idCollations[0]?.n) > 0) {
    await db.connection().execute(async (conn) => {
      await sql`SET FOREIGN_KEY_CHECKS = 0`.execute(conn)
      try {
        for (const [table, column] of ID_COLUMNS) {
          await sql`ALTER TABLE ${sql.table(table)} MODIFY ${sql.ref(column)} ${ID} NOT NULL`.execute(
            conn,
          )
        }
      } finally {
        await sql`SET FOREIGN_KEY_CHECKS = 1`.execute(conn)
      }
    })
  }

  // Fresh databases only, so deleted predefined tags don't come back. INSERT IGNORE
  // guards concurrent first starts; the fixed timestamp sorts them first.
  const anyTag = await db.selectFrom('tags').select('id').limit(1).executeTakeFirst()
  const anyTask = await db.selectFrom('tasks').select('id').limit(1).executeTakeFirst()
  if (anyTag || anyTask) return
  for (const tag of PREDEFINED_TAGS) {
    await db
      .insertInto('tags')
      .values({
        id: tag.id,
        label: tag.label,
        color: tag.color,
        created_at: PREDEFINED_TAG_CREATED_AT,
      })
      .ignore()
      .execute()
  }
}
