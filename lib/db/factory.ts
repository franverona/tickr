import type { TaskRepository } from './types'
import { getSqliteRepository } from './sqlite'

// DB_TYPE selects the backend, defaulting to "sqlite" so existing deployments
// keep working with zero config. Postgres/MySQL will share a Kysely-based SQL
// layer and read a single DATABASE_URL connection string once implemented;
// Firestore is unplanned for now. Both throw here rather than silently
// falling back to SQLite.
export function getRepository(): TaskRepository {
  const dbType = (process.env.DB_TYPE ?? 'sqlite').trim().toLowerCase()

  switch (dbType) {
    case 'sqlite':
      return getSqliteRepository()
    case 'postgres':
    case 'mysql':
      throw new Error(
        `DB_TYPE="${dbType}" is not implemented yet. Currently only "sqlite" is supported. ` +
          `When implemented, this backend will be configured via DATABASE_URL (a single connection string).`,
      )
    case 'firestore':
      throw new Error(
        `DB_TYPE="firestore" is not implemented yet. Currently only "sqlite" is supported.`,
      )
    default:
      throw new Error(
        `Unknown DB_TYPE="${dbType}". Supported: "sqlite" (default). Planned: "postgres", "mysql", "firestore".`,
      )
  }
}
