import type { Firestore } from '@google-cloud/firestore'
import { PREDEFINED_TAGS } from '../../constants'

// Firestore has no DDL/schema, only default data to seed — analogous to the
// SQL adapters' ensureSchema(), but there are no tables to create. Caching
// the in-flight promise (not just a boolean) means concurrent first calls
// await the same run instead of racing; clearing it on failure lets the next
// call retry instead of getting stuck.
let _seeding: Promise<void> | null = null

export function ensureSeeded(db: Firestore): Promise<void> {
  if (!_seeding) {
    _seeding = seedPredefinedTags(db).catch((err) => {
      _seeding = null
      throw err
    })
  }
  return _seeding
}

// Seeds only a fresh database (no tags, no tasks), so a predefined tag the
// user deleted doesn't come back on the next start. create() fails atomically
// with ALREADY_EXISTS (gRPC code 6) if the doc exists, which still guards
// concurrent first starts — direct analog to SQL's .onConflict().doNothing().
async function seedPredefinedTags(db: Firestore): Promise<void> {
  const tagsCol = db.collection('tags')
  const now = '2000-01-01T00:00:00.000Z'

  const [anyTag, anyTask] = await Promise.all([
    tagsCol.limit(1).get(),
    db.collection('tasks').limit(1).get(),
  ])
  if (!anyTag.empty || !anyTask.empty) return

  await Promise.all(
    PREDEFINED_TAGS.map(async (tag) => {
      try {
        await tagsCol.doc(tag.id).create({ label: tag.label, color: tag.color, createdAt: now })
      } catch (err) {
        if ((err as { code?: number }).code === 6) return // ALREADY_EXISTS
        throw err
      }
    }),
  )
}
