import { randomUUID } from 'crypto'
import { FieldValue } from '@google-cloud/firestore'
import type { DocumentSnapshot, Firestore } from '@google-cloud/firestore'
import type { TaskRepository } from '../types'
import type { Tag, Task, TaskUrl } from '../../types'
import type { ImportedTask } from '../../import'
import { COLOR_PALETTE } from '../../constants'
import { slugify } from '../slug'
import { ensureSeeded } from './seed'
import { chunk } from './chunk'

// Firestore field names match the Task/Tag domain types directly (no
// snake_case translation layer needed, unlike the SQL adapters).
interface FirestoreTaskDoc {
  title: string
  description: string
  tags: string[]
  urls: TaskUrl[]
  completed: boolean
  archived: boolean
  dueDate: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  archivedAt: string | null
  sortOrder: number
}

interface FirestoreTagDoc {
  label: string
  color: string
  createdAt: string
}

function docToTask(doc: DocumentSnapshot): Task {
  const data = doc.data() as FirestoreTaskDoc
  return { id: doc.id, ...data }
}

function docToTag(doc: DocumentSnapshot): Tag {
  const data = doc.data() as FirestoreTagDoc
  return { id: doc.id, label: data.label, color: data.color }
}

export class FirestoreTaskRepository implements TaskRepository {
  constructor(private readonly db: Firestore) {}

  private async ready(): Promise<Firestore> {
    await ensureSeeded(this.db)
    return this.db
  }

  private get tasksCol() {
    return this.db.collection('tasks')
  }

  private get tagsCol() {
    return this.db.collection('tags')
  }

  // ── Tags ─────────────────────────────────────────────────────────────────

  async getTags(): Promise<Tag[]> {
    await this.ready()
    const snap = await this.tagsCol.orderBy('createdAt', 'asc').get()
    return snap.docs.map(docToTag)
  }

  async createTag(data: { label: string; color: string }): Promise<Tag> {
    await this.ready()
    const id = slugify(data.label)
    if (!id) throw new Error('Invalid tag name')

    const existing = await this.tagsCol.doc(id).get()
    if (existing.exists) throw new Error(`A tag named "${data.label}" already exists`)

    const now = new Date().toISOString()
    const label = data.label.trim()
    await this.tagsCol.doc(id).set({ label, color: data.color, createdAt: now })
    return { id, label, color: data.color }
  }

  async updateTag(id: string, data: { label?: string; color?: string }): Promise<Tag> {
    await this.ready()
    const current = await this.tagsCol.doc(id).get()
    if (!current.exists) throw new Error(`Tag ${id} not found`)
    const currentData = current.data() as FirestoreTagDoc

    const label = data.label?.trim() ?? currentData.label
    const color = data.color ?? currentData.color

    await this.tagsCol.doc(id).update({ label, color })
    return { id, label, color }
  }

  // No FK cascade in Firestore: deleting a tag also has to strip it out of
  // every task that references it, fanned out across batched writes.
  async deleteTag(id: string): Promise<void> {
    const db = await this.ready()
    await this.tagsCol.doc(id).delete()

    const affected = await this.tasksCol.where('tags', 'array-contains', id).get()
    for (const group of chunk(affected.docs)) {
      const batch = db.batch()
      for (const doc of group) {
        batch.update(doc.ref, { tags: FieldValue.arrayRemove(id) })
      }
      await batch.commit()
    }
  }

  // ── Tasks ────────────────────────────────────────────────────────────────

  async getTasks(): Promise<Task[]> {
    await this.ready()
    const snap = await this.tasksCol.orderBy('sortOrder', 'asc').get()
    return snap.docs.map(docToTask)
  }

  async createTask(data: {
    title: string
    description: string
    tags: string[]
    dueDate?: string | null
    urls?: { url: string; label: string }[]
  }): Promise<Task> {
    const db = await this.ready()
    const id = randomUUID()
    const now = new Date().toISOString()
    const urls: TaskUrl[] = (data.urls ?? []).map((u) => ({
      id: randomUUID(),
      url: u.url.trim(),
      label: u.label.trim(),
    }))

    const docData: FirestoreTaskDoc = {
      title: data.title,
      description: data.description,
      tags: data.tags,
      urls,
      completed: false,
      archived: false,
      dueDate: data.dueDate ?? null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      archivedAt: null,
      sortOrder: 0,
    }

    // Requires a composite index (completed + sortOrder) — Firestore throws
    // a FAILED_PRECONDITION error with a Console link to create it on first
    // run; this cannot be created from application code.
    await db.runTransaction(async (trx) => {
      const minSnap = await trx.get(
        this.tasksCol.where('completed', '==', false).orderBy('sortOrder', 'asc').limit(1),
      )
      docData.sortOrder = minSnap.empty
        ? 0
        : (minSnap.docs[0].data() as FirestoreTaskDoc).sortOrder - 1000
      trx.set(this.tasksCol.doc(id), docData)
    })

    return { id, ...docData }
  }

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
    await this.ready()
    const now = new Date().toISOString()
    const ref = this.tasksCol.doc(id)
    const current = await ref.get()
    if (!current.exists) throw new Error(`Task ${id} not found`)

    const update: Partial<FirestoreTaskDoc> = { updatedAt: now }
    if (data.title !== undefined) update.title = data.title
    if (data.description !== undefined) update.description = data.description
    if (data.tags !== undefined) update.tags = data.tags
    if (data.dueDate !== undefined) update.dueDate = data.dueDate
    if (data.completed !== undefined) {
      update.completed = data.completed
      update.completedAt = data.completed ? now : null
    }
    if (data.archived !== undefined) {
      update.archived = data.archived
      update.archivedAt = data.archived ? now : null
    }

    await ref.update(update)
    const updated = await ref.get()
    return docToTask(updated)
  }

  async reorderTasks(orderedIds: string[]): Promise<void> {
    const db = await this.ready()
    const entries = orderedIds.map((id, i) => ({ id, sortOrder: i * 1000 }))
    for (const group of chunk(entries)) {
      const batch = db.batch()
      for (const { id, sortOrder } of group) {
        batch.update(this.tasksCol.doc(id), { sortOrder })
      }
      await batch.commit()
    }
  }

  async deleteTask(id: string): Promise<void> {
    await this.ready()
    // Nothing to cascade — urls are embedded and tag membership is just an
    // id array on this doc, both removed along with the doc itself.
    await this.tasksCol.doc(id).delete()
  }

  // ── Task URLs ────────────────────────────────────────────────────────────

  async addTaskUrl(taskId: string, data: { url: string; label: string }): Promise<Task> {
    await this.ready()
    const ref = this.tasksCol.doc(taskId)
    const now = new Date().toISOString()
    const newUrl: TaskUrl = { id: randomUUID(), url: data.url.trim(), label: data.label.trim() }
    // Safe from arrayUnion's deep-equality dedup — every entry has a fresh id.
    await ref.update({ urls: FieldValue.arrayUnion(newUrl), updatedAt: now })
    const updated = await ref.get()
    return docToTask(updated)
  }

  async deleteTaskUrl(taskId: string, urlId: string): Promise<Task> {
    await this.ready()
    const ref = this.tasksCol.doc(taskId)
    const current = await ref.get()
    if (!current.exists) throw new Error(`Task ${taskId} not found`)
    const currentData = current.data() as FirestoreTaskDoc
    const urls = currentData.urls.filter((u) => u.id !== urlId)
    await ref.update({ urls, updatedAt: new Date().toISOString() })
    const updated = await ref.get()
    return docToTask(updated)
  }

  async updateTaskUrl(
    taskId: string,
    urlId: string,
    data: { url: string; label: string },
  ): Promise<Task> {
    await this.ready()
    const ref = this.tasksCol.doc(taskId)
    const current = await ref.get()
    if (!current.exists) throw new Error(`Task ${taskId} not found`)
    const currentData = current.data() as FirestoreTaskDoc
    const urls = currentData.urls.map((u) =>
      u.id === urlId ? { ...u, url: data.url.trim(), label: data.label.trim() } : u,
    )
    await ref.update({ urls, updatedAt: new Date().toISOString() })
    const updated = await ref.get()
    return docToTask(updated)
  }

  // ── Import ───────────────────────────────────────────────────────────────

  async importTasks(
    items: ImportedTask[],
    overrideAll = false,
  ): Promise<{ imported: number; tasks: Task[]; tags: Tag[] }> {
    const db = await this.ready()
    const now = new Date().toISOString()

    if (overrideAll) {
      const [taskRefs, tagRefs] = await Promise.all([
        this.tasksCol.listDocuments(),
        this.tagsCol.listDocuments(),
      ])
      for (const group of chunk([...taskRefs, ...tagRefs])) {
        const batch = db.batch()
        for (const ref of group) batch.delete(ref)
        await batch.commit()
      }
    }

    // Resolve existing tags by label
    const existingTagsSnap = await this.tagsCol.get()
    let colorIndex = existingTagsSnap.size
    const tagMap = new Map<string, string>() // label.toLowerCase() → id
    const existingIds = new Set<string>()
    for (const doc of existingTagsSnap.docs) {
      const data = doc.data() as FirestoreTagDoc
      tagMap.set(data.label.toLowerCase(), doc.id)
      existingIds.add(doc.id)
    }

    // Determine which tags need to be created
    const validColors = new Set<string>(COLOR_PALETTE.map((c) => c.classes))
    const tagsToCreate: Array<{ id: string; label: string; color: string }> = []
    for (const item of items) {
      for (const { label, color: importedColor } of item.tags) {
        const key = label.toLowerCase()
        if (tagMap.has(key)) continue
        const id = slugify(label)
        if (!id) continue
        if (existingIds.has(id)) {
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

    const maxSnap = await this.tasksCol.orderBy('sortOrder', 'desc').limit(1).get()
    const maxSortOrder = maxSnap.empty
      ? null
      : (maxSnap.docs[0].data() as FirestoreTaskDoc).sortOrder
    let sortOrder = (maxSortOrder ?? -1000) + 1000
    let imported = 0

    const taskWrites: Array<{ id: string; data: FirestoreTaskDoc }> = []
    for (const item of items) {
      if (!item.title.trim()) continue
      const tagIds = item.tags
        .map(({ label }) => tagMap.get(label.toLowerCase()))
        .filter((tagId): tagId is string => tagId !== undefined)

      taskWrites.push({
        id: randomUUID(),
        data: {
          title: item.title.trim(),
          description: item.description,
          tags: tagIds,
          urls: item.links.map((link) => ({ id: randomUUID(), url: link.url, label: link.label })),
          completed: item.completed,
          archived: item.archived,
          dueDate: item.dueDate ?? null,
          createdAt: now,
          updatedAt: now,
          completedAt: item.completed ? now : null,
          archivedAt: item.archived ? now : null,
          sortOrder,
        },
      })
      sortOrder += 1000
      imported++
    }

    // Not a single atomic transaction across chunks — Firestore transactions
    // share the same 500-write cap as batches, so a large import must batch
    // regardless. Each chunk commits independently; a failure partway
    // through leaves partial data. Accepted trade-off for imports >500 rows.
    for (const group of chunk(tagsToCreate)) {
      const batch = db.batch()
      for (const tag of group) {
        batch.set(this.tagsCol.doc(tag.id), { label: tag.label, color: tag.color, createdAt: now })
      }
      await batch.commit()
    }
    for (const group of chunk(taskWrites)) {
      const batch = db.batch()
      for (const w of group) batch.set(this.tasksCol.doc(w.id), w.data)
      await batch.commit()
    }

    const [tasks, tags] = await Promise.all([this.getTasks(), this.getTags()])
    return { imported, tasks, tags }
  }
}
