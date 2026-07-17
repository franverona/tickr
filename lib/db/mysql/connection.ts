import { createPool, type Pool } from 'mysql2'
import { Kysely, MysqlDialect } from 'kysely'
import type { DbSchema } from '../types'

const globalForDb = globalThis as typeof globalThis & {
  mysqlPool?: Pool
  mysqlDb?: Kysely<DbSchema>
}

function getConnectionString(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is required when DB_TYPE="mysql" (e.g. mysql://user:pass@host:3306/dbname).',
    )
  }
  return url
}

export function getMysqlPool(): Pool {
  if (!globalForDb.mysqlPool) {
    globalForDb.mysqlPool = createPool(getConnectionString())
  }
  return globalForDb.mysqlPool
}

export function getMysqlDb(): Kysely<DbSchema> {
  if (!globalForDb.mysqlDb) {
    globalForDb.mysqlDb = new Kysely<DbSchema>({
      dialect: new MysqlDialect({ pool: getMysqlPool() }),
    })
  }
  return globalForDb.mysqlDb
}
