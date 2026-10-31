import { randomUUID } from 'crypto'
import { FieldValue } from '@google-cloud/firestore'
import type { DocumentSnapshot, Firestore, WriteBatch } from '@google-cloud/firestore'
import type { TaskRepository } from '../types'
import type { Tag, Task, TaskUrl } from '../../types'
import type { ImportedTag, ImportedTask } from '../../import'
import { COLOR_PALETTE } from '../../constants'
import { planImportIds } from '../mentions'
import { slugify, uniqueSlug } from '../slug'
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

// Firestore caps a document at 1 MiB, and description is the only field that
// gets near it. shortcut: checks the description alone, leaving ~48 KB for the
// rest of the doc; measure the whole doc if links or titles ever grow that big.
const MAX_DESCRIPTION_BYTES = 1_000_000

function assertDescriptionFits(description: string): void {
  if (Buffer.byteLength(description, 'utf8') > MAX_DESCRIPTION_BYTES) {
    throw new Error('Description is too large for Firestore (over 1 MB)')
  }
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
    const slug = slugify(data.label)
    if (!slug) throw new Error('Invalid tag name')

    const now = new Date().toISOString()
    const label = data.label.trim()
    const existing = (await this.tagsCol.get()).docs
    if (existing.some((d) => (d.get('label') as string).toLowerCase() === label.toLowerCase()))
      throw new Error(`A tag named "${data.label}" already exists`)
    const id = uniqueSlug(slug, new Set(existing.map((d) => d.id)))
    // create() fails atomically if the doc exists, so two concurrent creates
    // with the same slug can't both pass a get() check and overwrite each other
    try {
      await this.tagsCol.doc(id).create({ label, color: data.color, createdAt: now })
    } catch (err) {
      if ((err as { code?: number }).code === 6) {
        // ALREADY_EXISTS
        throw new Error(`A tag named "${data.label}" already exists`)
      }
      throw err
    }
    return { id, label, color: data.color }
  }

  async updateTag(id: string, data: { label?: string; color?: string }): Promise<Tag> {
    await this.ready()
    const current = await this.tagsCol.doc(id).get()
    if (!current.exists) throw new Error(`Tag ${id} not found`)
    const currentData = current.data() as FirestoreTagDoc

    const label = data.label?.trim() ?? currentData.label
    const color = data.color ?? currentData.color

    // Import matches tags by lowercased label, so two tags must never share one
    if (label.toLowerCase() !== currentData.label.toLowerCase()) {
      const tags = await this.tagsCol.get()
      if (
        tags.docs.some(
          (d) =>
            d.id !== id &&
            (d.data() as FirestoreTagDoc).label.toLowerCase() === label.toLowerCase(),
        )
      )
        throw new Error(`A tag named "${label}" already exists`)
    }

    await this.tagsCol.doc(id).update({ label, color })
    return { id, label, color }
  }

  // No FK cascade in Firestore: deleting a tag also has to strip it out of
  // every task that references it, fanned out across batched writes. The tag
  // doc goes last: if a batch fails, the tag still exists and a retry finishes
  // the job, instead of tasks keeping an id that a new tag with the same slug
  // would silently reattach to.
  async deleteTag(id: string): Promise<void> {
    const db = await this.ready()
    const affected = await this.tasksCol.where('tags', 'array-contains', id).get()
    for (const group of chunk(affected.docs)) {
      const batch = db.batch()
      for (const doc of group) {
        batch.update(doc.ref, { tags: FieldValue.arrayRemove(id) })
      }
      await batch.commit()
    }

    await this.tagsCol.doc(id).delete()
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
    assertDescriptionFits(data.description)
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
      tags: [...new Set(data.tags)],
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
    if (data.description !== undefined) {
      assertDescriptionFits(data.description)
      update.description = data.description
    }
    if (data.tags !== undefined) update.tags = [...new Set(data.tags)]
    if (data.dueDate !== undefined) update.dueDate = data.dueDate
    // Timestamps record when a flag flipped, not every time it's set
    if (data.completed !== undefined) {
      update.completed = data.completed
      if (current.get('completed') !== data.completed)
        update.completedAt = data.completed ? now : null
    }
    if (data.archived !== undefined) {
      update.archived = data.archived
      if (current.get('archived') !== data.archived) update.archivedAt = data.archived ? now : null
    }

    await ref.update(update)
    const updated = await ref.get()
    return docToTask(updated)
  }

  async reorderTasks(orderedIds: string[]): Promise<void> {
    const db = await this.ready()
    const entries = orderedIds.map((id, i) => ({ id, sortOrder: i * 1000 }))
    // Skip ids deleted meanwhile (e.g. from another tab), like the SQL
    // backends do: update() on a missing doc fails the whole batch, and
    // set(merge) would recreate it as a sortOrder-only doc. Read and write in
    // one transaction so a delete can't slip in between.
    for (const group of chunk(entries)) {
      await db.runTransaction(async (tx) => {
        const snaps = await tx.getAll(...group.map(({ id }) => this.tasksCol.doc(id)))
        snaps.forEach((snap, i) => {
          if (snap.exists) tx.update(snap.ref, { sortOrder: group[i].sortOrder })
        })
      })
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
    extraTags: ImportedTag[] = [],
  ): Promise<{ imported: number; tasks: Task[]; tags: Tag[] }> {
    const db = await this.ready()
    const now = new Date().toISOString()

    // Resolve existing tags by label (none survive an override)
    const existingTagDocs = overrideAll ? [] : (await this.tagsCol.get()).docs
    let colorIndex = existingTagDocs.length
    const tagMap = new Map<string, string>() // label.toLowerCase() → id
    const existingIds = new Set<string>()
    for (const doc of existingTagDocs) {
      const data = doc.data() as FirestoreTagDoc
      tagMap.set(data.label.toLowerCase(), doc.id)
      existingIds.add(doc.id)
    }

    // Determine which tags need to be created
    const allTags = [...items.flatMap((item) => item.tags), ...extraTags]
    const validColors = new Set<string>(COLOR_PALETTE.map((c) => c.classes))
    const tagsToCreate: Array<{ id: string; label: string; color: string }> = []
    for (const { label, color: importedColor } of allTags) {
      const key = label.toLowerCase()
      if (tagMap.has(key)) continue
      const slug = slugify(label)
      if (!slug) continue
      const id = uniqueSlug(slug, existingIds)
      existingIds.add(id)
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

    const maxSnap = overrideAll
      ? null
      : await this.tasksCol.orderBy('sortOrder', 'desc').limit(1).get()
    const maxSortOrder =
      !maxSnap || maxSnap.empty ? null : (maxSnap.docs[0].data() as FirestoreTaskDoc).sortOrder
    let sortOrder = (maxSortOrder ?? -1000) + 1000
    let imported = 0

    const taskWrites: Array<{ id: string; data: FirestoreTaskDoc }> = []
    const { newIds, remap } = planImportIds(items)
    for (const [i, item] of items.entries()) {
      if (!item.title.trim()) continue
      const tagIds = [
        ...new Set(
          item.tags
            .map(({ label }) => tagMap.get(label.toLowerCase()))
            .filter((tagId): tagId is string => tagId !== undefined),
        ),
      ]

      // Before any write (and before an override wipe), not partway through
      assertDescriptionFits(item.description)
      taskWrites.push({
        id: newIds[i],
        data: {
          title: item.title.trim(),
          description: remap(item.description),
          tags: tagIds,
          urls: item.links.map((link) => ({ id: randomUUID(), url: link.url, label: link.label })),
          completed: item.completed,
          archived: item.archived,
          dueDate: item.dueDate ?? null,
          createdAt: item.createdAt ?? now,
          updatedAt: item.updatedAt ?? now,
          completedAt: item.completed ? (item.completedAt ?? now) : null,
          archivedAt: item.archived ? (item.archivedAt ?? now) : null,
          sortOrder,
        },
      })
      sortOrder += 1000
      imported++
    }

    // The wipe and the writes share one list, so an import within Firestore's
    // 500-write cap commits as a single atomic batch. Over the cap, each chunk
    // commits independently and a failure partway leaves partial data: an
    // accepted trade-off, since transactions share the same cap. The wipe runs
    // only now, after every write above was built, so a bad item fails before
    // anything is deleted.
    const writes: Array<(batch: WriteBatch) => void> = []
    if (overrideAll) {
      const [taskRefs, tagRefs] = await Promise.all([
        this.tasksCol.listDocuments(),
        this.tagsCol.listDocuments(),
      ])
      for (const ref of [...taskRefs, ...tagRefs]) writes.push((batch) => batch.delete(ref))
    }
    for (const tag of tagsToCreate) {
      writes.push((batch) =>
        batch.set(this.tagsCol.doc(tag.id), { label: tag.label, color: tag.color, createdAt: now }),
      )
    }
    for (const w of taskWrites) {
      writes.push((batch) => batch.set(this.tasksCol.doc(w.id), w.data))
    }
    for (const group of chunk(writes)) {
      const batch = db.batch()
      for (const write of group) write(batch)
      await batch.commit()
    }

    const [tasks, tags] = await Promise.all([this.getTasks(), this.getTags()])
    return { imported, tasks, tags }
  }
}
