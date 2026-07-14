import type { TaskRepository } from '../types'
import { getSqliteDb } from './connection'
import { SqliteTaskRepository } from './repository'

const globalForDb = globalThis as typeof globalThis & {
  sqliteRepository?: TaskRepository
}

export function getSqliteRepository(): TaskRepository {
  if (!globalForDb.sqliteRepository) {
    globalForDb.sqliteRepository = new SqliteTaskRepository(getSqliteDb())
  }
  return globalForDb.sqliteRepository
}
