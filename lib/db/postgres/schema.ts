import type { TasksTable } from '../types'
import type { SqlSchema } from '../shared/sql-repository'

// pg handles JS booleans natively, unlike better-sqlite3 and mysql2
export type PgTasksTable = TasksTable<boolean>

export type PgDbSchema = SqlSchema<boolean>
