import { randomUUID } from 'crypto'
import { Kysely } from 'kysely'
import type { TagsTable, TaskUrlsTable, TaskTagsTable, TasksTable, TaskRepository } from '../types'
import type { Tag, Task, TaskUrl } from '../../types'
import type { ImportedTask } from '../../import'
import { COLOR_PALETTE } from '../../constants'
import { slugify } from '../slug'

// The 4-table shape shared by every SQL backend (SQLite/Postgres/MySQL),
// generic over how each stores completed/archived (native boolean on
// Postgres, 0|1 on SQLite/MySQL).
export interface SqlSchema<Bool> {
  tasks: TasksTable<Bool>
  tags: TagsTable
  task_urls: TaskUrlsTable
  task_tags: TaskTagsTable
}

export interface SqlRepositoryConfig<Bool> {
  /** The backend's own migrate.ts ensureSchema — migration caching stays per-backend. */
  ensureSchema: (kysely: Kysely<SqlSchema<Bool>>) => Promise<void>
  boolIn: (b: boolean) => Bool
  boolOut: (v: Bool) => boolean
  /** How duplicate-tag inserts (during import) are ignored: Postgres/SQLite use ON CONFLICT, MySQL has none and uses INSERT IGNORE. */
  tagConflictStrategy: 'onConflict' | 'ignore'
}

export function createSqlTaskRepository<Bool>(
  kysely: Kysely<SqlSchema<Bool>>,
  config: SqlRepositoryConfig<Bool>,
): TaskRepository {
  const { ensureSchema, boolIn, boolOut, tagConflictStrategy } = config

  async function ready(): Promise<Kysely<SqlSchema<Bool>>> {
    await ensureSchema(kysely)
    return kysely
  }

  // Kysely wraps generic column types in conditional SelectType/InsertType/
  // UpdateType machinery that can't statically resolve back to a bare `Bool`
  // type parameter, even though at every concrete instantiation (number or
  // boolean) they're identical. `unknown` + a cast in boolOut sidesteps that
  // false mismatch without weakening the public TaskRepository return types.
  type TaskRow = Omit<TasksTable<Bool>, 'completed' | 'archived'> & {
    completed: unknown
    archived: unknown
  }

  function rowToTask(row: TaskRow, tags: string[], urls: TaskUrl[]): Task {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      tags,
      completed: boolOut(row.completed as Bool),
      archived: boolOut(row.archived as Bool),
      dueDate: row.due_date ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      archivedAt: row.archived_at,
      urls,
    }
  }

  async function getTaskTagIds(db: Kysely<SqlSchema<Bool>>, taskId: string): Promise<string[]> {
    const rows = await db
      .selectFrom('task_tags')
      .select('tag_id')
      .where('task_id', '=', taskId)
      .orderBy('position', 'asc')
      .execute()
    return rows.map((r) => r.tag_id)
  }

  async function getTaskUrls(db: Kysely<SqlSchema<Bool>>, taskId: string): Promise<TaskUrl[]> {
    return db
      .selectFrom('task_urls')
      .select(['id', 'url', 'label'])
      .where('task_id', '=', taskId)
      .orderBy('created_at', 'asc')
      .execute()
  }

  async function buildTagMap(db: Kysely<SqlSchema<Bool>>): Promise<Map<string, string[]>> {
    const rows = await db
      .selectFrom('task_tags')
      .select(['task_id', 'tag_id'])
      .orderBy('position', 'asc')
      .execute()
    const map = new Map<string, string[]>()
    for (const row of rows) {
      const arr = map.get(row.task_id) ?? []
      arr.push(row.tag_id)
      map.set(row.task_id, arr)
    }
    return map
  }

  async function buildUrlMap(db: Kysely<SqlSchema<Bool>>): Promise<Map<string, TaskUrl[]>> {
    const rows = await db
      .selectFrom('task_urls')
      .select(['id', 'task_id', 'url', 'label'])
      .orderBy('created_at', 'asc')
      .execute()
    const map = new Map<string, TaskUrl[]>()
    for (const row of rows) {
      const arr = map.get(row.task_id) ?? []
      arr.push({ id: row.id, url: row.url, label: row.label })
      map.set(row.task_id, arr)
    }
    return map
  }

  return {
    // ── Tags ─────────────────────────────────────────────────────────────

    async getTags(): Promise<Tag[]> {
      const db = await ready()
      return db
        .selectFrom('tags')
        .select(['id', 'label', 'color'])
        .orderBy('created_at', 'asc')
        .execute()
    },

    async createTag(data: { label: string; color: string }): Promise<Tag> {
      const db = await ready()
      const id = slugify(data.label)
      if (!id) throw new Error('Invalid tag name')

      const existing = await db
        .selectFrom('tags')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst()
      if (existing) throw new Error(`A tag named "${data.label}" already exists`)

      const now = new Date().toISOString()
      await db
        .insertInto('tags')
        .values({ id, label: data.label.trim(), color: data.color, created_at: now })
        .execute()

      return { id, label: data.label.trim(), color: data.color }
    },

    async updateTag(id: string, data: { label?: string; color?: string }): Promise<Tag> {
      const db = await ready()
      const current = await db
        .selectFrom('tags')
        .select(['id', 'label', 'color'])
        .where('id', '=', id)
        .executeTakeFirst()
      if (!current) throw new Error(`Tag ${id} not found`)

      const label = data.label?.trim() ?? current.label
      const color = data.color ?? current.color

      await db.updateTable('tags').set({ label, color }).where('id', '=', id).execute()
      return { id, label, color }
    },

    async deleteTag(id: string): Promise<void> {
      const db = await ready()
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom('task_tags').where('tag_id', '=', id).execute()
        await trx.deleteFrom('tags').where('id', '=', id).execute()
      })
    },

    // ── Tasks ────────────────────────────────────────────────────────────

    async getTasks(): Promise<Task[]> {
      const db = await ready()
      const rows = await db.selectFrom('tasks').selectAll().orderBy('sort_order', 'asc').execute()
      const tagMap = await buildTagMap(db)
      const urlMap = await buildUrlMap(db)
      return rows.map((row) => rowToTask(row, tagMap.get(row.id) ?? [], urlMap.get(row.id) ?? []))
    },

    async createTask(data: {
      title: string
      description: string
      tags: string[]
      dueDate?: string | null
      urls?: { url: string; label: string }[]
    }): Promise<Task> {
      const db = await ready()
      const id = randomUUID()
      const now = new Date().toISOString()

      const minRow = await db
        .selectFrom('tasks')
        .select((eb) => eb.fn.min('sort_order').as('min'))
        .where('completed', '=', boolIn(false) as never)
        .executeTakeFirstOrThrow()
      const sortOrder = minRow.min !== null ? minRow.min - 1000 : 0

      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto('tasks')
          .values({
            id,
            title: data.title,
            description: data.description,
            completed: boolIn(false),
            archived: boolIn(false),
            due_date: data.dueDate ?? null,
            created_at: now,
            updated_at: now,
            completed_at: null,
            archived_at: null,
            sort_order: sortOrder,
          } as never)
          .execute()

        for (let i = 0; i < data.tags.length; i++) {
          await trx
            .insertInto('task_tags')
            .values({ task_id: id, tag_id: data.tags[i], position: i })
            .execute()
        }

        for (const link of data.urls ?? []) {
          await trx
            .insertInto('task_urls')
            .values({
              id: randomUUID(),
              task_id: id,
              url: link.url.trim(),
              label: link.label.trim(),
              created_at: now,
            })
            .execute()
        }
      })

      const row = await db
        .selectFrom('tasks')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
      return rowToTask(row, await getTaskTagIds(db, id), await getTaskUrls(db, id))
    },

    async updateTask(
      id: string,
      data: Partial<{
        title: string
        description: string
        tags: string[]
        completed: boolean
        archived: boolean
        dueDate: string | null
      }>,
    ): Promise<Task> {
      const db = await ready()
      const now = new Date().toISOString()
      const current = await db
        .selectFrom('tasks')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst()
      if (!current) throw new Error(`Task ${id} not found`)

      const next = {
        title: data.title ?? current.title,
        description: data.description ?? current.description,
        completed: data.completed !== undefined ? boolIn(data.completed) : current.completed,
        archived: data.archived !== undefined ? boolIn(data.archived) : current.archived,
        due_date: data.dueDate !== undefined ? data.dueDate : current.due_date,
        completed_at:
          data.completed === undefined ? current.completed_at : data.completed ? now : null,
        archived_at: data.archived === undefined ? current.archived_at : data.archived ? now : null,
      }

      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable('tasks')
          .set({ ...next, updated_at: now } as never)
          .where('id', '=', id)
          .execute()

        if (data.tags !== undefined) {
          await trx.deleteFrom('task_tags').where('task_id', '=', id).execute()
          for (let i = 0; i < data.tags.length; i++) {
            await trx
              .insertInto('task_tags')
              .values({ task_id: id, tag_id: data.tags[i], position: i })
              .execute()
          }
        }
      })

      const updated = await db
        .selectFrom('tasks')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
      return rowToTask(updated, await getTaskTagIds(db, id), await getTaskUrls(db, id))
    },

    async reorderTasks(orderedIds: string[]): Promise<void> {
      const db = await ready()
      await db.transaction().execute(async (trx) => {
        for (let i = 0; i < orderedIds.length; i++) {
          await trx
            .updateTable('tasks')
            .set({ sort_order: i * 1000 })
            .where('id', '=', orderedIds[i])
            .execute()
        }
      })
    },

    async deleteTask(id: string): Promise<void> {
      const db = await ready()
      await db.deleteFrom('tasks').where('id', '=', id).execute()
    },

    // ── Task URLs ────────────────────────────────────────────────────────

    async addTaskUrl(taskId: string, data: { url: string; label: string }): Promise<Task> {
      const db = await ready()
      const now = new Date().toISOString()
      await db
        .insertInto('task_urls')
        .values({
          id: randomUUID(),
          task_id: taskId,
          url: data.url.trim(),
          label: data.label.trim(),
          created_at: now,
        })
        .execute()
      const row = await db
        .selectFrom('tasks')
        .selectAll()
        .where('id', '=', taskId)
        .executeTakeFirstOrThrow()
      return rowToTask(row, await getTaskTagIds(db, taskId), await getTaskUrls(db, taskId))
    },

    async deleteTaskUrl(taskId: string, urlId: string): Promise<Task> {
      const db = await ready()
      await db
        .deleteFrom('task_urls')
        .where('id', '=', urlId)
        .where('task_id', '=', taskId)
        .execute()
      const row = await db
        .selectFrom('tasks')
        .selectAll()
        .where('id', '=', taskId)
        .executeTakeFirstOrThrow()
      return rowToTask(row, await getTaskTagIds(db, taskId), await getTaskUrls(db, taskId))
    },

    async updateTaskUrl(
      taskId: string,
      urlId: string,
      data: { url: string; label: string },
    ): Promise<Task> {
      const db = await ready()
      await db
        .updateTable('task_urls')
        .set({ url: data.url.trim(), label: data.label.trim() })
        .where('id', '=', urlId)
        .where('task_id', '=', taskId)
        .execute()
      const row = await db
        .selectFrom('tasks')
        .selectAll()
        .where('id', '=', taskId)
        .executeTakeFirstOrThrow()
      return rowToTask(row, await getTaskTagIds(db, taskId), await getTaskUrls(db, taskId))
    },

    // ── Import ───────────────────────────────────────────────────────────

    async importTasks(
      items: ImportedTask[],
      overrideAll = false,
    ): Promise<{ imported: number; tasks: Task[]; tags: Tag[] }> {
      const db = await ready()
      const now = new Date().toISOString()

      if (overrideAll) {
        await db.transaction().execute(async (trx) => {
          await trx.deleteFrom('task_urls').execute()
          await trx.deleteFrom('task_tags').execute()
          await trx.deleteFrom('tasks').execute()
          await trx.deleteFrom('tags').execute()
        })
      }

      // Resolve existing tags by label
      const existingTags = await db
        .selectFrom('tags')
        .select(['id', 'label', 'color'])
        .orderBy('created_at', 'asc')
        .execute()
      let colorIndex = existingTags.length
      const tagMap = new Map<string, string>() // label.toLowerCase() → id
      for (const tag of existingTags) {
        tagMap.set(tag.label.toLowerCase(), tag.id)
      }

      // Batch-resolve which candidate tag ids already exist (avoids an N+1
      // SELECT per tag).
      const candidateIds = new Set<string>()
      for (const item of items) {
        for (const { label } of item.tags) {
          if (tagMap.has(label.toLowerCase())) continue
          const id = slugify(label)
          if (id) candidateIds.add(id)
        }
      }
      const existingById =
        candidateIds.size > 0
          ? await db
              .selectFrom('tags')
              .select('id')
              .where('id', 'in', [...candidateIds])
              .execute()
          : []
      const existingByIdSet = new Set(existingById.map((r) => r.id))

      // Determine which tags need to be created
      const validColors = new Set<string>(COLOR_PALETTE.map((c) => c.classes))
      const tagsToCreate: Array<{ id: string; label: string; color: string }> = []
      for (const item of items) {
        for (const { label, color: importedColor } of item.tags) {
          const key = label.toLowerCase()
          if (tagMap.has(key)) continue
          const id = slugify(label)
          if (!id) continue
          if (existingByIdSet.has(id)) {
            tagMap.set(key, id)
            continue
          }
          let color: string
          if (validColors.has(importedColor)) {
            color = importedColor
          } else {
            color = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length].classes
            colorIndex++
          }
          tagsToCreate.push({ id, label: label.trim(), color })
          tagMap.set(key, id)
        }
      }

      const maxRow = await db
        .selectFrom('tasks')
        .select((eb) => eb.fn.max('sort_order').as('max'))
        .executeTakeFirstOrThrow()
      let sortOrder = (maxRow.max ?? -1000) + 1000
      let imported = 0

      await db.transaction().execute(async (trx) => {
        for (const tag of tagsToCreate) {
          const insert = trx
            .insertInto('tags')
            .values({ id: tag.id, label: tag.label, color: tag.color, created_at: now })
          await (
            tagConflictStrategy === 'ignore'
              ? insert.ignore()
              : insert.onConflict((oc) => oc.doNothing())
          ).execute()
        }
        for (const item of items) {
          if (!item.title.trim()) continue
          const tagIds = item.tags
            .map(({ label }) => tagMap.get(label.toLowerCase()))
            .filter((id): id is string => id !== undefined)

          const taskId = randomUUID()
          await trx
            .insertInto('tasks')
            .values({
              id: taskId,
              title: item.title.trim(),
              description: item.description,
              completed: boolIn(item.completed),
              archived: boolIn(item.archived),
              due_date: item.dueDate ?? null,
              created_at: now,
              updated_at: now,
              completed_at: item.completed ? now : null,
              archived_at: item.archived ? now : null,
              sort_order: sortOrder,
            } as never)
            .execute()

          for (let i = 0; i < tagIds.length; i++) {
            await trx
              .insertInto('task_tags')
              .values({ task_id: taskId, tag_id: tagIds[i], position: i })
              .execute()
          }

          for (const link of item.links) {
            await trx
              .insertInto('task_urls')
              .values({
                id: randomUUID(),
                task_id: taskId,
                url: link.url,
                label: link.label,
                created_at: now,
              })
              .execute()
          }
          sortOrder += 1000
          imported++
        }
      })

      const allRows = await db
        .selectFrom('tasks')
        .selectAll()
        .orderBy('sort_order', 'asc')
        .execute()
      const tagMapAll = await buildTagMap(db)
      const urlMap = await buildUrlMap(db)
      const allTags = await db
        .selectFrom('tags')
        .select(['id', 'label', 'color'])
        .orderBy('created_at', 'asc')
        .execute()

      return {
        imported,
        tasks: allRows.map((r) => rowToTask(r, tagMapAll.get(r.id) ?? [], urlMap.get(r.id) ?? [])),
        tags: allTags,
      }
    },
  }
}
