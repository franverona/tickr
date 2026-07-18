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

// ponytail: parallel per-item ops via Promise.allSettled, not real bulk SQL —
// fine up to normal selection sizes; upgrade to a batched query per backend
// only if selections regularly reach into the hundreds.
export interface BulkUpdateResult {
  succeeded: Task[]
  failedIds: string[]
}

export async function updateTasks(
  ids: string[],
  data: Partial<{
    title: string
    description: string
    tags: string[]
    completed: boolean
    archived: boolean
    dueDate: string | null
  }>,
): Promise<BulkUpdateResult> {
  const repo = getRepository()
  const results = await Promise.allSettled(ids.map((id) => repo.updateTask(id, data)))
  const succeeded: Task[] = []
  const failedIds: string[] = []
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') succeeded.push(result.value)
    else failedIds.push(ids[i])
  })
  return { succeeded, failedIds }
}

export interface BulkDeleteResult {
  succeededIds: string[]
  failedIds: string[]
}

export async function deleteTasks(ids: string[]): Promise<BulkDeleteResult> {
  const repo = getRepository()
  const results = await Promise.allSettled(ids.map((id) => repo.deleteTask(id)))
  const succeededIds: string[] = []
  const failedIds: string[] = []
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') succeededIds.push(ids[i])
    else failedIds.push(ids[i])
  })
  return { succeededIds, failedIds }
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
