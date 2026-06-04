'use server'

import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db'
import type { Tag, Task } from '@/lib/types'
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
  due_date: string | null
  completed: number
  archived: number
  created_at: string
  updated_at: string
  sort_order: number
}

function rowToTask(row: DbRow, linkedTaskIds: string[] = []): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    tags: JSON.parse(row.tags),
    dueDate: row.due_date,
    completed: row.completed === 1,
    archived: row.archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    linkedTaskIds,
  }
}

function getLinkedIds(db: ReturnType<typeof getDb>, taskId: string): string[] {
  const rows = db
    .prepare('SELECT linked_task_id FROM task_links WHERE task_id = ?')
    .all(taskId) as { linked_task_id: string }[]
  return rows.map((r) => r.linked_task_id)
}

function buildLinkMap(db: ReturnType<typeof getDb>): Map<string, string[]> {
  const links = db.prepare('SELECT task_id, linked_task_id FROM task_links').all() as {
    task_id: string
    linked_task_id: string
  }[]
  const map = new Map<string, string[]>()
  for (const link of links) {
    const arr = map.get(link.task_id) ?? []
    arr.push(link.linked_task_id)
    map.set(link.task_id, arr)
  }
  return map
}

export async function getTasks(): Promise<Task[]> {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM tasks ORDER BY sort_order ASC').all() as DbRow[]
  const linkMap = buildLinkMap(db)
  return rows.map((row) => rowToTask(row, linkMap.get(row.id) ?? []))
}

export async function createTask(data: {
  title: string
  description: string
  tags: string[]
  dueDate: string | null
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

  db.prepare(
    `INSERT INTO tasks (id, title, description, tags, due_date, completed, created_at, updated_at, sort_order)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
  ).run(
    id,
    data.title,
    data.description,
    JSON.stringify(data.tags),
    data.dueDate,
    now,
    now,
    sortOrder,
  )

  return rowToTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as DbRow, [])
}

export async function updateTask(
  id: string,
  data: Partial<{
    title: string
    description: string
    tags: string[]
    dueDate: string | null
    completed: boolean
    archived: boolean
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
    due_date: data.dueDate !== undefined ? data.dueDate : current.due_date,
    completed: data.completed !== undefined ? (data.completed ? 1 : 0) : current.completed,
    archived: data.archived !== undefined ? (data.archived ? 1 : 0) : current.archived,
  }

  db.prepare(
    `UPDATE tasks
     SET title = ?, description = ?, tags = ?, due_date = ?, completed = ?, archived = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    next.title,
    next.description,
    next.tags,
    next.due_date,
    next.completed,
    next.archived,
    now,
    id,
  )

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as DbRow
  return rowToTask(updated, getLinkedIds(db, id))
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
  db.transaction(() => {
    db.prepare('DELETE FROM task_links WHERE task_id = ? OR linked_task_id = ?').run(id, id)
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  })()
}

export async function linkTask(
  taskId: string,
  linkedTaskId: string,
): Promise<{ task: Task; linkedTask: Task }> {
  const db = getDb()
  const insert = db.prepare(
    'INSERT OR IGNORE INTO task_links (task_id, linked_task_id) VALUES (?, ?)',
  )
  db.transaction(() => {
    insert.run(taskId, linkedTaskId)
    insert.run(linkedTaskId, taskId)
  })()

  const taskRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as DbRow
  const linkedRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(linkedTaskId) as DbRow
  return {
    task: rowToTask(taskRow, getLinkedIds(db, taskId)),
    linkedTask: rowToTask(linkedRow, getLinkedIds(db, linkedTaskId)),
  }
}

export async function unlinkTask(
  taskId: string,
  linkedTaskId: string,
): Promise<{ task: Task; linkedTask: Task }> {
  const db = getDb()
  db.prepare(
    'DELETE FROM task_links WHERE (task_id = ? AND linked_task_id = ?) OR (task_id = ? AND linked_task_id = ?)',
  ).run(taskId, linkedTaskId, linkedTaskId, taskId)

  const taskRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as DbRow
  const linkedRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(linkedTaskId) as DbRow
  return {
    task: rowToTask(taskRow, getLinkedIds(db, taskId)),
    linkedTask: rowToTask(linkedRow, getLinkedIds(db, linkedTaskId)),
  }
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
    `INSERT INTO tasks (id, title, description, tags, due_date, completed, archived, created_at, updated_at, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        item.dueDate,
        item.completed ? 1 : 0,
        item.archived ? 1 : 0,
        now,
        now,
        sortOrder,
      )
      sortOrder += 1000
      imported++
    }
  })()

  const allRows = db.prepare('SELECT * FROM tasks ORDER BY sort_order ASC').all() as DbRow[]
  const linkMap = buildLinkMap(db)
  const allTags = db
    .prepare('SELECT id, label, color FROM tags ORDER BY created_at ASC')
    .all() as Tag[]
  return {
    imported,
    tasks: allRows.map((r) => rowToTask(r, linkMap.get(r.id) ?? [])),
    tags: allTags,
  }
}
