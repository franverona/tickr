import type { TaskRepository } from '../types'
import { getPostgresDb } from './connection'
import { PostgresTaskRepository } from './repository'

const globalForDb = globalThis as typeof globalThis & {
  postgresRepository?: TaskRepository
}

export function getPostgresRepository(): TaskRepository {
  if (!globalForDb.postgresRepository) {
    globalForDb.postgresRepository = new PostgresTaskRepository(getPostgresDb())
  }
  return globalForDb.postgresRepository
}
