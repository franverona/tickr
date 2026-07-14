import type { Tag, Task } from '../types'
import type { ImportedTask } from '../import'

// ── Kysely schema ────────────────────────────────────────────────────────────
// completed/archived are stored as 0|1: Kysely + the better-sqlite3 driver does
// not auto-convert JS booleans, binding one throws. Conversion is manual, done
// in each adapter.

export interface TasksTable {
  id: string
  title: string
  description: string
  completed: number
  archived: number
  due_date: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  archived_at: string | null
  sort_order: number | null
}

export interface TagsTable {
  id: string
  label: string
  color: string
  created_at: string
}

export interface TaskUrlsTable {
  id: string
  task_id: string
  url: string
  label: string
  created_at: string
}

export interface TaskTagsTable {
  task_id: string
  tag_id: string
  position: number
}

export interface DbSchema {
  tasks: TasksTable
  tags: TagsTable
  task_urls: TaskUrlsTable
  task_tags: TaskTagsTable
}

// ── Backend selection ────────────────────────────────────────────────────────

export type DbType = 'sqlite' | 'postgres' | 'mysql' | 'firestore'

// ── Repository interface ─────────────────────────────────────────────────────
// Implemented once per backend. Transactions are internal to each
// implementation — transaction semantics are backend-specific, so the
// interface has no transaction-related surface.

export interface TaskRepository {
  getTags(): Promise<Tag[]>
  createTag(data: { label: string; color: string }): Promise<Tag>
  updateTag(id: string, data: { label?: string; color?: string }): Promise<Tag>
  deleteTag(id: string): Promise<void>

  getTasks(): Promise<Task[]>
  createTask(data: {
    title: string
    description: string
    tags: string[]
    dueDate?: string | null
    urls?: { url: string; label: string }[]
  }): Promise<Task>
  updateTask(
    id: string,
    data: Partial<{
      title: string
      description: string
      tags: string[]
      completed: boolean
      archived: boolean
      dueDate: string | null
    }>,
  ): Promise<Task>
  reorderTasks(orderedIds: string[]): Promise<void>
  deleteTask(id: string): Promise<void>

  addTaskUrl(taskId: string, data: { url: string; label: string }): Promise<Task>
  deleteTaskUrl(taskId: string, urlId: string): Promise<Task>
  updateTaskUrl(taskId: string, urlId: string, data: { url: string; label: string }): Promise<Task>

  importTasks(
    items: ImportedTask[],
    overrideAll?: boolean,
  ): Promise<{ imported: number; tasks: Task[]; tags: Tag[] }>
}
