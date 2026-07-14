'use server'

import { getRepository } from '@/lib/db'
import type { Tag, Task } from '@/lib/types'
import type { ImportedTask } from '@/lib/import'

// ── Tags ─────────────────────────────────────────────────────────────────────

export async function getTags(): Promise<Tag[]> {
  return getRepository().getTags()
}

export async function createTag(data: { label: string; color: string }): Promise<Tag> {
  return getRepository().createTag(data)
}

export async function updateTag(
  id: string,
  data: { label?: string; color?: string },
): Promise<Tag> {
  return getRepository().updateTag(id, data)
}

export async function deleteTag(id: string): Promise<void> {
  return getRepository().deleteTag(id)
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function getTasks(): Promise<Task[]> {
  return getRepository().getTasks()
}

export async function createTask(data: {
  title: string
  description: string
  tags: string[]
  dueDate?: string | null
  urls?: { url: string; label: string }[]
}): Promise<Task> {
  return getRepository().createTask(data)
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
  return getRepository().updateTask(id, data)
}

export async function reorderTasks(orderedIds: string[]): Promise<void> {
  return getRepository().reorderTasks(orderedIds)
}

export async function deleteTask(id: string): Promise<void> {
  return getRepository().deleteTask(id)
}

export async function addTaskUrl(
  taskId: string,
  data: { url: string; label: string },
): Promise<Task> {
  return getRepository().addTaskUrl(taskId, data)
}

export async function deleteTaskUrl(taskId: string, urlId: string): Promise<Task> {
  return getRepository().deleteTaskUrl(taskId, urlId)
}

export async function updateTaskUrl(
  taskId: string,
  urlId: string,
  data: { url: string; label: string },
): Promise<Task> {
  return getRepository().updateTaskUrl(taskId, urlId, data)
}

export async function importTasks(
  items: ImportedTask[],
  overrideAll = false,
): Promise<{ imported: number; tasks: Task[]; tags: Tag[] }> {
  return getRepository().importTasks(items, overrideAll)
}
