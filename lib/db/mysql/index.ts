import type { TaskRepository } from '../types'
import { getMysqlDb } from './connection'
import { MysqlTaskRepository } from './repository'

const globalForDb = globalThis as typeof globalThis & {
  mysqlRepository?: TaskRepository
}

export function getMysqlRepository(): TaskRepository {
  if (!globalForDb.mysqlRepository) {
    globalForDb.mysqlRepository = new MysqlTaskRepository(getMysqlDb())
  }
  return globalForDb.mysqlRepository
}
