import type { TagsTable, TaskUrlsTable, TaskTagsTable } from '../types'

// completed/archived are native booleans here — unlike better-sqlite3, the pg
// driver auto-converts JS booleans, so no manual 0/1 conversion is needed in
// this adapter (contrast lib/db/types.ts's TasksTable).
export interface PgTasksTable {
  id: string
  title: string
  description: string
  completed: boolean
  archived: boolean
  due_date: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  archived_at: string | null
  sort_order: number | null
}

export interface PgDbSchema {
  tasks: PgTasksTable
  tags: TagsTable
  task_urls: TaskUrlsTable
  task_tags: TaskTagsTable
}
