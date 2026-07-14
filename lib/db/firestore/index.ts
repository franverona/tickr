import type { TaskRepository } from '../types'
import { getFirestoreClient } from './connection'
import { FirestoreTaskRepository } from './repository'

const globalForDb = globalThis as typeof globalThis & {
  firestoreRepository?: TaskRepository
}

export function getFirestoreRepository(): TaskRepository {
  if (!globalForDb.firestoreRepository) {
    globalForDb.firestoreRepository = new FirestoreTaskRepository(getFirestoreClient())
  }
  return globalForDb.firestoreRepository
}
