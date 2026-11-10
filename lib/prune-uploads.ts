import { readdir, rm, stat } from 'fs/promises'
import path from 'path'
import type { TaskRepository } from './db/types'
import type { Task } from './types'

// Looser than export's LOCAL_UPLOAD_RE: deleting is irreversible, so any mention
// (absolute URL, unquoted attribute, a task link) keeps the file
const ANY_UPLOAD_RE = /\/uploads\/([\w.-]+)/g

function mentionedUploads(tasks: Task[]): Set<string> {
  const names = new Set<string>()
  for (const task of tasks) {
    const text = [task.description, ...task.urls.map((u) => u.url)].join('\n')
    for (const [, name] of text.matchAll(ANY_UPLOAD_RE)) names.add(name)
  }
  return names
}

// A file this new may belong to an upload whose description isn't saved yet
// (autosave pending, import mid-way), so it's never treated as orphaned
const GRACE_MS = 24 * 60 * 60 * 1000

// Uploads no task description references. Node only (`pnpm uploads:prune`).
export async function findOrphanUploads({
  repo,
  uploadsDir,
  now = Date.now(),
}: {
  repo: TaskRepository
  uploadsDir: string
  now?: number
}): Promise<{ taskCount: number; orphans: { name: string; bytes: number }[] }> {
  const tasks = await repo.getTasks()
  const referenced = mentionedUploads(tasks)

  let names: string[]
  try {
    names = await readdir(uploadsDir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { taskCount: tasks.length, orphans: [] }
    }
    throw err
  }

  const orphans: { name: string; bytes: number }[] = []
  for (const name of names.sort()) {
    if (referenced.has(name)) continue
    const info = await stat(path.join(uploadsDir, name))
    if (info.isFile() && now - info.mtimeMs > GRACE_MS) orphans.push({ name, bytes: info.size })
  }
  return { taskCount: tasks.length, orphans }
}

export async function removeUploads(uploadsDir: string, names: string[]): Promise<void> {
  for (const name of names) await rm(path.join(uploadsDir, name))
}
