import Database from 'better-sqlite3'
import { Kysely, PostgresDialect, SqliteDialect } from 'kysely'
import { Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import type { DbSchema, TaskRepository } from '../lib/db/types'
import type { PgDbSchema } from '../lib/db/postgres/schema'
import { PostgresTaskRepository } from '../lib/db/postgres/repository'
import { exportToCSV, exportToJSON } from '../lib/export'
import { parseCSVContent, parseJSONContent } from '../lib/import'
import type { Tag, Task } from '../lib/types'

// Proves the export/import contract is backend-agnostic: seed a source
// repository, export it, import into a *different* repository instance
// (a different backend, in the postgres case), and assert the data is
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

const POSTGRES_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/tickr'

function makePostgresRepo(): TaskRepository {
  const kysely = new Kysely<PgDbSchema>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString: POSTGRES_URL }) }),
  })
  return new PostgresTaskRepository(kysely)
}

async function isPostgresAvailable(): Promise<boolean> {
  const pool = new Pool({ connectionString: POSTGRES_URL, connectionTimeoutMillis: 1000 })
  try {
    await pool.query('select 1')
    return true
  } catch {
    return false
  } finally {
    await pool.end()
  }
}

async function seedSource(repo: TaskRepository): Promise<void> {
  // Wipe first: the postgres-backed repos in this file point at a real,
  // persistent docker-compose database, not a fresh in-memory one, so a
  // repeated test run would otherwise collide with tags left over from the
  // last run.
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
    expect(tagLabelsOf(imported!, destTags)).toEqual(tagLabelsOf(sourceTask, sourceTags))
    expect(imported!.urls.map((u) => ({ url: u.url, label: u.label }))).toEqual(
      sourceTask.urls.map((u) => ({ url: u.url, label: u.label })),
    )
  }

  // CSV is a lossier format (drops timestamps), but tags/status/links/due
  // date must still round-trip correctly across backends.
  const csvItems = parseCSVContent(exportToCSV(sourceTasks, sourceTags))
  expect(csvItems).toHaveLength(sourceTasks.length)
  const csvByTitle = new Map(csvItems.map((t) => [t.title, t]))
  for (const sourceTask of sourceTasks) {
    const item = csvByTitle.get(sourceTask.title)
    expect(item).toBeDefined()
    expect(item!.completed).toBe(sourceTask.completed)
    expect(item!.archived).toBe(sourceTask.archived)
    expect(item!.dueDate).toBe(sourceTask.dueDate)
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
})
