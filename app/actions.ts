'use server'

import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db'
import type { Tag, Task } from '@/lib/types'

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
  created_at: string
  updated_at: string
  sort_order: number
}

function rowToTask(row: DbRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    tags: JSON.parse(row.tags),
    dueDate: row.due_date,
    completed: row.completed === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function getTasks(): Promise<Task[]> {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM tasks ORDER BY sort_order ASC').all() as DbRow[]
  return rows.map(rowToTask)
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

  return rowToTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as DbRow)
}

export async function updateTask(
  id: string,
  data: Partial<{
    title: string
    description: string
    tags: string[]
    dueDate: string | null
    completed: boolean
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
  }

  db.prepare(
    `UPDATE tasks
     SET title = ?, description = ?, tags = ?, due_date = ?, completed = ?, updated_at = ?
     WHERE id = ?`,
  ).run(next.title, next.description, next.tags, next.due_date, next.completed, now, id)

  return rowToTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as DbRow)
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
