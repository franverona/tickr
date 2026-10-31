import Database from 'better-sqlite3'
import { Kysely, MysqlDialect, PostgresDialect, SqliteDialect } from 'kysely'
import { createPool } from 'mysql2'
import { createConnection } from 'mysql2/promise'
import { Firestore } from '@google-cloud/firestore'
import { Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import type { DbSchema, TaskRepository } from '../lib/db/types'
import type { PgDbSchema } from '../lib/db/postgres/schema'
import { PostgresTaskRepository } from '../lib/db/postgres/repository'
import { MysqlTaskRepository } from '../lib/db/mysql/repository'
import { FirestoreTaskRepository } from '../lib/db/firestore/repository'
import { exportToCSV, exportToJSON } from '../lib/export'
import { parseCSVContent, parseJSONContent } from '../lib/import'
import type { Tag, Task } from '../lib/types'

// Proves the export/import contract is backend-agnostic: seed a source
// repository, export it, import into a *different* repository instance
// (a different backend, in the postgres/mysql cases), and assert the data is
// equivalent modulo backend-regenerated ids/timestamps.

// lib/db/sqlite/migrate.ts caches its "schema is ready" promise at module
// scope — correct for production's one process-wide connection, but it means
// two independently-created in-memory databases in the same test run would
// otherwise share one cached "already migrated" flag and the second db's
// tables would never actually get created. Re-importing the module fresh
// per repo sidesteps that.
async function makeSqliteRepo(): Promise<TaskRepository> {
  vi.resetModules()
  const { SqliteTaskRepository } = await import('../lib/db/sqlite/repository')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  const kysely = new Kysely<DbSchema>({ dialect: new SqliteDialect({ database: db }) })
  return new SqliteTaskRepository(kysely)
}

// Test-only variables, never the app's DATABASE_URL: these tests wipe every
// task and tag in the database they point at. The defaults use a dedicated
// tickr_test database, created on demand, so the dev `tickr` database is safe.
const POSTGRES_URL =
  process.env.POSTGRES_TEST_URL ?? 'postgresql://postgres:postgres@localhost:5432/tickr_test'

function makePostgresRepo(): TaskRepository {
  const kysely = new Kysely<PgDbSchema>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: POSTGRES_URL }) }),
  })
  return new PostgresTaskRepository(kysely)
}

async function isPostgresAvailable(): Promise<boolean> {
  const url = process.env.POSTGRES_TEST_URL ?? POSTGRES_URL.replace(/tickr_test$/, 'postgres')
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 1000 })
  try {
    await pool.query('select 1')
    if (!process.env.POSTGRES_TEST_URL) {
      const { rowCount } = await pool.query(
        `select 1 from pg_database where datname = 'tickr_test'`,
      )
      if (!rowCount) await pool.query('create database tickr_test')
    }
    return true
  } catch (err) {
    if (process.env.CI) throw err // CI always starts the service; never skip there
    return false
  } finally {
    await pool.end()
  }
}

const MYSQL_URL = process.env.MYSQL_TEST_URL ?? 'mysql://root:mysql@localhost:3306/tickr_test'

function makeMysqlRepo(): TaskRepository {
  const kysely = new Kysely<DbSchema>({
    dialect: new MysqlDialect({ pool: createPool(MYSQL_URL) }),
  })
  return new MysqlTaskRepository(kysely)
}

async function isMysqlAvailable(): Promise<boolean> {
  try {
    const conn = await createConnection(
      process.env.MYSQL_TEST_URL ?? MYSQL_URL.replace(/\/tickr_test$/, ''),
    )
    await conn.query('select 1')
    if (!process.env.MYSQL_TEST_URL) await conn.query('create database if not exists tickr_test')
    await conn.end()
    return true
  } catch (err) {
    if (process.env.CI) throw err // CI always starts the service; never skip there
    return false
  }
}

// Emulator only: explicit host + ssl:false can't reach a live project
const FIRESTORE_HOST = process.env.FIRESTORE_TEST_HOST ?? 'localhost:8080'

function makeFirestoreRepo(): TaskRepository {
  return new FirestoreTaskRepository(
    new Firestore({ projectId: 'tickr-test', host: FIRESTORE_HOST, ssl: false }),
  )
}

async function isFirestoreAvailable(): Promise<boolean> {
  try {
    return (await fetch(`http://${FIRESTORE_HOST}`, { signal: AbortSignal.timeout(1000) })).ok
  } catch (err) {
    if (process.env.CI) throw err // CI always starts the emulator; never skip there
    return false
  }
}

async function seedSource(repo: TaskRepository): Promise<void> {
  // Wipe first: the postgres/mysql-backed repos in this file point at a
  // real, persistent docker-compose database, not a fresh in-memory one, so
  // a repeated test run would otherwise collide with tags left over from
  // the last run.
  await repo.importTasks([], true)

  const bug = await repo.createTag({
    label: 'Bug',
    color: 'bg-red-600 text-red-100 border-red-500',
  })
  const wip = await repo.createTag({
    label: 'In Progress',
    color: 'bg-blue-600 text-blue-100 border-blue-500',
  })

  await repo.createTask({
    title: 'Fix login crash',
    description: 'Repro: log in with an expired token.',
    tags: [bug.id, wip.id],
    dueDate: '2026-08-01',
    urls: [{ url: 'https://example.com/ticket/42', label: 'Ticket' }],
  })

  const [{ id: doneTaskId }] = await repo.getTasks()
  await repo.updateTask(doneTaskId, { completed: true })
}

function tagLabelsOf(task: Task, tags: Tag[]): string[] {
  const byId = new Map(tags.map((t) => [t.id, t.label]))
  return task.tags.map((id) => byId.get(id) ?? id).sort()
}

async function assertRoundTrip(source: TaskRepository, destination: TaskRepository): Promise<void> {
  await seedSource(source)
  const sourceTasks = await source.getTasks()
  const sourceTags = await source.getTags()

  // overrideAll=true so a destination pointing at a real, persistent
  // database (e.g. the docker-compose postgres) starts clean regardless of
  // what a previous test run left behind.
  const jsonItems = parseJSONContent(exportToJSON(sourceTasks, sourceTags))
  const { tasks: destTasks, tags: destTags } = await destination.importTasks(jsonItems, true)

  expect(destTasks).toHaveLength(sourceTasks.length)

  const byTitle = new Map(destTasks.map((t) => [t.title, t]))
  for (const sourceTask of sourceTasks) {
    const imported = byTitle.get(sourceTask.title)
    expect(imported).toBeDefined()
    expect(imported!.description).toBe(sourceTask.description)
    expect(imported!.completed).toBe(sourceTask.completed)
    expect(imported!.archived).toBe(sourceTask.archived)
    expect(imported!.dueDate).toBe(sourceTask.dueDate)
    expect(imported!.createdAt).toBe(sourceTask.createdAt)
    expect(imported!.updatedAt).toBe(sourceTask.updatedAt)
    expect(imported!.completedAt).toBe(sourceTask.completedAt)
    expect(imported!.archivedAt).toBe(sourceTask.archivedAt)
    expect(tagLabelsOf(imported!, destTags)).toEqual(tagLabelsOf(sourceTask, sourceTags))
    expect(imported!.urls.map((u) => ({ url: u.url, label: u.label }))).toEqual(
      sourceTask.urls.map((u) => ({ url: u.url, label: u.label })),
    )
  }

  // CSV is a lossier format, but tags/status/links/due date/timestamps must
  // still round-trip correctly across backends.
  const csvItems = parseCSVContent(exportToCSV(sourceTasks, sourceTags))
  expect(csvItems).toHaveLength(sourceTasks.length)
  const csvByTitle = new Map(csvItems.map((t) => [t.title, t]))
  for (const sourceTask of sourceTasks) {
    const item = csvByTitle.get(sourceTask.title)
    expect(item).toBeDefined()
    expect(item!.completed).toBe(sourceTask.completed)
    expect(item!.archived).toBe(sourceTask.archived)
    expect(item!.dueDate).toBe(sourceTask.dueDate)
    expect(item!.createdAt).toBe(sourceTask.createdAt)
    expect(item!.tags.map((t) => t.label).sort()).toEqual(tagLabelsOf(sourceTask, sourceTags))
  }
}

describe('cross-backend import/export round trip', () => {
  it('sqlite -> sqlite (proves the shared ImportedTask contract)', async () => {
    await assertRoundTrip(await makeSqliteRepo(), await makeSqliteRepo())
  })

  it('sqlite -> postgres', async (ctx) => {
    if (!(await isPostgresAvailable())) {
      ctx.skip()
      return
    }
    await assertRoundTrip(await makeSqliteRepo(), makePostgresRepo())
  })

  it('postgres -> sqlite', async (ctx) => {
    if (!(await isPostgresAvailable())) {
      ctx.skip()
      return
    }
    await assertRoundTrip(makePostgresRepo(), await makeSqliteRepo())
  })

  it('sqlite -> mysql', async (ctx) => {
    if (!(await isMysqlAvailable())) {
      ctx.skip()
      return
    }
    await assertRoundTrip(await makeSqliteRepo(), makeMysqlRepo())
  })

  it('mysql -> sqlite', async (ctx) => {
    if (!(await isMysqlAvailable())) {
      ctx.skip()
      return
    }
    await assertRoundTrip(makeMysqlRepo(), await makeSqliteRepo())
  })

  it('sqlite -> firestore', async (ctx) => {
    if (!(await isFirestoreAvailable())) {
      ctx.skip()
      return
    }
    await assertRoundTrip(await makeSqliteRepo(), makeFirestoreRepo())
  })

  it('firestore -> sqlite', async (ctx) => {
    if (!(await isFirestoreAvailable())) {
      ctx.skip()
      return
    }
    await assertRoundTrip(makeFirestoreRepo(), await makeSqliteRepo())
  })
})

async function assertReorder(repo: TaskRepository): Promise<void> {
  await repo.importTasks([], true)
  const a = await repo.createTask({ title: 'A', description: '', tags: [] })
  const b = await repo.createTask({ title: 'B', description: '', tags: [] })
  const c = await repo.createTask({ title: 'C', description: '', tags: [] })

  await repo.reorderTasks([c.id, a.id, b.id])

  expect((await repo.getTasks()).map((t) => t.id)).toEqual([c.id, a.id, b.id])
}

describe('reorderTasks per backend', () => {
  it('sqlite', async () => {
    await assertReorder(await makeSqliteRepo())
  })

  it('postgres', async (ctx) => {
    if (!(await isPostgresAvailable())) {
      ctx.skip()
      return
    }
    await assertReorder(makePostgresRepo())
  })

  it('mysql', async (ctx) => {
    if (!(await isMysqlAvailable())) {
      ctx.skip()
      return
    }
    await assertReorder(makeMysqlRepo())
  })

  it('firestore', async (ctx) => {
    if (!(await isFirestoreAvailable())) {
      ctx.skip()
      return
    }
    await assertReorder(makeFirestoreRepo())
  })
})

async function assertLongDescription(repo: TaskRepository): Promise<void> {
  await repo.importTasks([], true)
  // Over MySQL's 64 KB TEXT cap
  const description = 'x'.repeat(100_000)
  const task = await repo.createTask({ title: 'Long', description, tags: [] })
  const [stored] = await repo.getTasks()
  expect(stored.id).toBe(task.id)
  expect(stored.description).toHaveLength(description.length)
}

describe('descriptions over 64 KB per backend', () => {
  it('sqlite', async () => {
    await assertLongDescription(await makeSqliteRepo())
  })

  it('postgres', async (ctx) => {
    if (!(await isPostgresAvailable())) {
      ctx.skip()
      return
    }
    await assertLongDescription(makePostgresRepo())
  })

  it('mysql', async (ctx) => {
    if (!(await isMysqlAvailable())) {
      ctx.skip()
      return
    }
    await assertLongDescription(makeMysqlRepo())
  })

  it('firestore', async (ctx) => {
    if (!(await isFirestoreAvailable())) {
      ctx.skip()
      return
    }
    await assertLongDescription(makeFirestoreRepo())
  })
})
