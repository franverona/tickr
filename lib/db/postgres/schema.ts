import type { TasksTable } from '../types'
import type { SqlSchema } from '../shared/sql-repository'

// completed/archived are native booleans here — unlike better-sqlite3, the pg
// driver auto-converts JS booleans, so no manual 0/1 conversion is needed in
// this adapter (contrast lib/db/types.ts's TasksTable default of `number`).
export type PgTasksTable = TasksTable<boolean>

export type PgDbSchema = SqlSchema<boolean>
