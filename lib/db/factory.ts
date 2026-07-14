import type { TaskRepository } from './types'
import { getSqliteRepository } from './sqlite'
import { getPostgresRepository } from './postgres'

// DB_TYPE selects the backend, defaulting to "sqlite" so existing deployments
// keep working with zero config. Postgres/MySQL share a Kysely-based SQL
// layer and read a single DATABASE_URL connection string; Firestore is
// unplanned for now. Unimplemented backends throw here rather than silently
// falling back to SQLite.
export function getRepository(): TaskRepository {
  const dbType = (process.env.DB_TYPE ?? 'sqlite').trim().toLowerCase()

  switch (dbType) {
    case 'sqlite':
      return getSqliteRepository()
    case 'postgres':
      return getPostgresRepository()
    case 'mysql':
      throw new Error(
        `DB_TYPE="mysql" is not implemented yet. Currently "sqlite" and "postgres" are supported. ` +
          `When implemented, this backend will be configured via DATABASE_URL (a single connection string).`,
      )
    case 'firestore':
      throw new Error(
        `DB_TYPE="firestore" is not implemented yet. Currently "sqlite" and "postgres" are supported.`,
      )
    default:
      throw new Error(
        `Unknown DB_TYPE="${dbType}". Supported: "sqlite" (default), "postgres". Planned: "mysql", "firestore".`,
      )
  }
}
