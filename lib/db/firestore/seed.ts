import type { Firestore } from '@google-cloud/firestore'
import { PREDEFINED_TAG_CREATED_AT, PREDEFINED_TAGS } from '../../constants'

// The in-flight promise is cached so concurrent first calls share one run;
// cleared on failure so the next call retries
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

// Fresh databases only, so deleted predefined tags don't come back. create()
// guards concurrent first starts.
async function seedPredefinedTags(db: Firestore): Promise<void> {
  const tagsCol = db.collection('tags')

  const [anyTag, anyTask] = await Promise.all([
    tagsCol.limit(1).get(),
    db.collection('tasks').limit(1).get(),
  ])
  if (!anyTag.empty || !anyTask.empty) return

  await Promise.all(
    PREDEFINED_TAGS.map(async (tag) => {
      try {
        await tagsCol
          .doc(tag.id)
          .create({ label: tag.label, color: tag.color, createdAt: PREDEFINED_TAG_CREATED_AT })
      } catch (err) {
        if ((err as { code?: number }).code === 6) return // ALREADY_EXISTS
        throw err
      }
    }),
  )
}
