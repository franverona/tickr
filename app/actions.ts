'use server'

import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db'
import type { Tag, Task, TaskUrl } from '@/lib/types'
import { COLOR_PALETTE } from '@/lib/constants'
import type { ImportedTask } from '@/lib/import'

// ── Tags ─────────────────────────────────────────────────────────────────────

export async function getTags(): Promise<Tag[]> {
  const db = getDb()
  return db.prepare('SELECT id, label, color FROM tags ORDER BY created_at ASC').all() as Tag[]
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function updateTag(
  id: string,
  data: { label?: string; color?: string },
): Promise<Tag> {
  const db = getDb()
  const current = db.prepare('SELECT id, label, color FROM tags WHERE id = ?').get(id) as
    | Tag
    | undefined
  if (!current) throw new Error(`Tag ${id} not found`)

  const label = data.label?.trim() ?? current.label
  const color = data.color ?? current.color

  db.prepare('UPDATE tags SET label = ?, color = ? WHERE id = ?').run(label, color, id)
  return { id, label, color }
}

export async function deleteTag(id: string): Promise<void> {
  const db = getDb()
  const affected = db.prepare('SELECT id, tags FROM tasks WHERE tags LIKE ?').all(`%"${id}"%`) as {
    id: string
    tags: string
  }[]

  const updateTaskTags = db.prepare('UPDATE tasks SET tags = ?, updated_at = ? WHERE id = ?')
  const now = new Date().toISOString()

  const tx = db.transaction(() => {
    for (const row of affected) {
      const filtered = (JSON.parse(row.tags) as string[]).filter((t) => t !== id)
      updateTaskTags.run(JSON.stringify(filtered), now, row.id)
    }
    db.prepare('DELETE FROM tags WHERE id = ?').run(id)
  })
  tx()
}

export async function createTag(data: { label: string; color: string }): Promise<Tag> {
  const db = getDb()
  const id = slugify(data.label)
  if (!id) throw new Error('Invalid tag name')

  const existing = db.prepare('SELECT id FROM tags WHERE id = ?').get(id)
  if (existing) throw new Error(`A tag named "${data.label}" already exists`)

  const now = new Date().toISOString()
  db.prepare('INSERT INTO tags (id, label, color, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    data.label.trim(),
    data.color,
    now,
  )

  return { id, label: data.label.trim(), color: data.color }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

interface DbRow {
  id: string
  title: string
  description: string
  tags: string
  completed: number
  archived: number
  due_date: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  archived_at: string | null
  sort_order: number
}

function rowToTask(row: DbRow, urls: TaskUrl[] = []): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    tags: JSON.parse(row.tags),
    completed: row.completed === 1,
    archived: row.archived === 1,
    dueDate: row.due_date ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    archivedAt: row.archived_at,
    urls,
  }
}

function buildUrlMap(db: ReturnType<typeof getDb>): Map<string, TaskUrl[]> {
  const rows = db
    .prepare('SELECT id, task_id, url, label FROM task_urls ORDER BY created_at ASC')
    .all() as { id: string; task_id: string; url: string; label: string }[]
  const map = new Map<string, TaskUrl[]>()
  for (const row of rows) {
    const arr = map.get(row.task_id) ?? []
    arr.push({ id: row.id, url: row.url, label: row.label })
    map.set(row.task_id, arr)
  }
  return map
}

function getTaskUrls(db: ReturnType<typeof getDb>, taskId: string): TaskUrl[] {
  return db
    .prepare('SELECT id, url, label FROM task_urls WHERE task_id = ? ORDER BY created_at ASC')
    .all(taskId) as TaskUrl[]
}

export async function getTasks(): Promise<Task[]> {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM tasks ORDER BY sort_order ASC').all() as DbRow[]
  const urlMap = buildUrlMap(db)
  return rows.map((row) => rowToTask(row, urlMap.get(row.id) ?? []))
}

export async function createTask(data: {
  title: string
  description: string
  tags: string[]
  dueDate?: string | null
  urls?: { url: string; label: string }[]
}): Promise<Task> {
  const db = getDb()
  const id = randomUUID()
  const now = new Date().toISOString()

  const minRow = db
    .prepare('SELECT MIN(sort_order) AS min FROM tasks WHERE completed = 0')
    .get() as {
    min: number | null
  }
  const sortOrder = minRow.min !== null ? minRow.min - 1000 : 0

  const insertUrl = db.prepare(
    'INSERT INTO task_urls (id, task_id, url, label, created_at) VALUES (?, ?, ?, ?, ?)',
  )

  db.transaction(() => {
    db.prepare(
      `INSERT INTO tasks (id, title, description, tags, completed, due_date, created_at, updated_at, sort_order)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    ).run(
      id,
      data.title,
      data.description,
      JSON.stringify(data.tags),
      data.dueDate ?? null,
      now,
      now,
      sortOrder,
    )
    for (const link of data.urls ?? []) {
      insertUrl.run(randomUUID(), id, link.url.trim(), link.label.trim(), now)
    }
  })()

  return rowToTask(
    db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as DbRow,
    getTaskUrls(db, id),
  )
}

export async function updateTask(
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
  const db = getDb()
  const now = new Date().toISOString()
  const current = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as DbRow
  if (!current) throw new Error(`Task ${id} not found`)

  const next = {
    title: data.title ?? current.title,
    description: data.description ?? current.description,
    tags: data.tags !== undefined ? JSON.stringify(data.tags) : current.tags,
    completed: data.completed !== undefined ? (data.completed ? 1 : 0) : current.completed,
    archived: data.archived !== undefined ? (data.archived ? 1 : 0) : current.archived,
    dueDate: data.dueDate !== undefined ? data.dueDate : current.due_date,
    completedAt: data.completed === undefined ? current.completed_at : data.completed ? now : null,
    archivedAt: data.archived === undefined ? current.archived_at : data.archived ? now : null,
  }

  db.prepare(
    `UPDATE tasks
     SET title = ?, description = ?, tags = ?, completed = ?, archived = ?, due_date = ?, completed_at = ?, archived_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    next.title,
    next.description,
    next.tags,
    next.completed,
    next.archived,
    next.dueDate,
    next.completedAt,
    next.archivedAt,
    now,
    id,
  )

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as DbRow
  return rowToTask(updated, getTaskUrls(db, id))
}

export async function reorderTasks(orderedIds: string[]): Promise<void> {
  const db = getDb()
  const update = db.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?')
  const tx = db.transaction(() => {
    orderedIds.forEach((id, i) => update.run(i * 1000, id))
  })
  tx()
}

export async function deleteTask(id: string): Promise<void> {
  const db = getDb()
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
}

export async function addTaskUrl(
  taskId: string,
  data: { url: string; label: string },
): Promise<Task> {
  const db = getDb()
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO task_urls (id, task_id, url, label, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, taskId, data.url.trim(), data.label.trim(), now)
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as DbRow
  return rowToTask(row, getTaskUrls(db, taskId))
}

export async function deleteTaskUrl(taskId: string, urlId: string): Promise<Task> {
  const db = getDb()
  db.prepare('DELETE FROM task_urls WHERE id = ? AND task_id = ?').run(urlId, taskId)
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as DbRow
  return rowToTask(row, getTaskUrls(db, taskId))
}

export async function updateTaskUrl(
  taskId: string,
  urlId: string,
  data: { url: string; label: string },
): Promise<Task> {
  const db = getDb()
  db.prepare('UPDATE task_urls SET url = ?, label = ? WHERE id = ? AND task_id = ?').run(
    data.url.trim(),
    data.label.trim(),
    urlId,
    taskId,
  )
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as DbRow
  return rowToTask(row, getTaskUrls(db, taskId))
}

export async function importTasks(
  items: ImportedTask[],
): Promise<{ imported: number; tasks: Task[]; tags: Tag[] }> {
  const db = getDb()
  const now = new Date().toISOString()

  // Resolve existing tags by label
  const existingTags = db
    .prepare('SELECT id, label, color FROM tags ORDER BY created_at ASC')
    .all() as Tag[]
  let colorIndex = existingTags.length
  const tagMap = new Map<string, string>() // label.toLowerCase() → id
  for (const tag of existingTags) {
    tagMap.set(tag.label.toLowerCase(), tag.id)
  }

  // Determine which tags need to be created
  const tagsToCreate: Array<{ id: string; label: string; color: string }> = []
  for (const item of items) {
    for (const label of item.tagLabels) {
      const key = label.toLowerCase()
      if (tagMap.has(key)) continue
      const id = slugify(label)
      if (!id) continue
      const byId = db.prepare('SELECT id FROM tags WHERE id = ?').get(id)
      if (byId) {
        tagMap.set(key, id)
        continue
      }
      const color = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length].classes
      colorIndex++
      tagsToCreate.push({ id, label: label.trim(), color })
      tagMap.set(key, id)
    }
  }

  const maxRow = db.prepare('SELECT MAX(sort_order) AS max FROM tasks').get() as {
    max: number | null
  }
  let sortOrder = (maxRow.max ?? -1000) + 1000
  let imported = 0

  const insertTag = db.prepare(
    'INSERT OR IGNORE INTO tags (id, label, color, created_at) VALUES (?, ?, ?, ?)',
  )
  const insertTask = db.prepare(
    `INSERT INTO tasks (id, title, description, tags, completed, archived, due_date, created_at, updated_at, completed_at, archived_at, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  db.transaction(() => {
    for (const tag of tagsToCreate) {
      insertTag.run(tag.id, tag.label, tag.color, now)
    }
    for (const item of items) {
      if (!item.title.trim()) continue
      const tagIds = item.tagLabels
        .map((label) => tagMap.get(label.toLowerCase()))
        .filter((id): id is string => id !== undefined)

      insertTask.run(
        randomUUID(),
        item.title.trim(),
        item.description,
        JSON.stringify(tagIds),
        item.completed ? 1 : 0,
        item.archived ? 1 : 0,
        item.dueDate ?? null,
        now,
        now,
        item.completed ? now : null,
        item.archived ? now : null,
        sortOrder,
      )
      sortOrder += 1000
      imported++
    }
  })()

  const allRows = db.prepare('SELECT * FROM tasks ORDER BY sort_order ASC').all() as DbRow[]
  const urlMap = buildUrlMap(db)
  const allTags = db
    .prepare('SELECT id, label, color FROM tags ORDER BY created_at ASC')
    .all() as Tag[]
  return {
    imported,
    tasks: allRows.map((r) => rowToTask(r, urlMap.get(r.id) ?? [])),
    tags: allTags,
  }
}
