import { Pool } from 'pg'
import { Kysely, PostgresDialect } from 'kysely'
import type { PgDbSchema } from './schema'

const globalForDb = globalThis as typeof globalThis & {
  pgPool?: Pool
  pgDb?: Kysely<PgDbSchema>
}

function getConnectionString(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is required when DB_TYPE="postgres" (e.g. postgresql://user:pass@host:5432/dbname).',
    )
  }
  return url
}

export function getPostgresPool(): Pool {
  if (!globalForDb.pgPool) {
    globalForDb.pgPool = new Pool({ connectionString: getConnectionString() })
  }
  return globalForDb.pgPool
}

export function getPostgresDb(): Kysely<PgDbSchema> {
  if (!globalForDb.pgDb) {
    globalForDb.pgDb = new Kysely<PgDbSchema>({
      dialect: new PostgresDialect({ pool: getPostgresPool() }),
    })
  }
  return globalForDb.pgDb
}
