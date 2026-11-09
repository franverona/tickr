import type { TaskRepository } from './types'
import { getSqliteRepository } from './sqlite'
import { getPostgresRepository } from './postgres'
import { getMysqlRepository } from './mysql'
import { getFirestoreRepository } from './firestore'

// Unknown backends throw rather than silently falling back to SQLite
export function getRepository(): TaskRepository {
  const dbType = (process.env.DB_TYPE ?? 'sqlite').trim().toLowerCase()

  switch (dbType) {
    case 'sqlite':
      return getSqliteRepository()
    case 'postgres':
      return getPostgresRepository()
    case 'mysql':
      return getMysqlRepository()
    case 'firestore':
      return getFirestoreRepository()
    default:
      throw new Error(
        `Unknown DB_TYPE="${dbType}". Supported: "sqlite" (default), "postgres", "mysql", "firestore".`,
      )
  }
}
