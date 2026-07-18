import { Kysely } from 'kysely'
import type { DbSchema, TaskRepository } from '../types'
import { createSqlTaskRepository } from '../shared/sql-repository'
import { ensureSchema } from './migrate'

export class SqliteTaskRepository implements TaskRepository {
  private readonly inner: TaskRepository

  constructor(kysely: Kysely<DbSchema>) {
    this.inner = createSqlTaskRepository(kysely, {
      ensureSchema,
      boolIn: (b) => (b ? 1 : 0),
      boolOut: (v) => v === 1,
      tagConflictStrategy: 'onConflict',
    })
  }

  getTags: TaskRepository['getTags'] = (...args) => this.inner.getTags(...args)
  createTag: TaskRepository['createTag'] = (...args) => this.inner.createTag(...args)
  updateTag: TaskRepository['updateTag'] = (...args) => this.inner.updateTag(...args)
  deleteTag: TaskRepository['deleteTag'] = (...args) => this.inner.deleteTag(...args)

  getTasks: TaskRepository['getTasks'] = (...args) => this.inner.getTasks(...args)
  createTask: TaskRepository['createTask'] = (...args) => this.inner.createTask(...args)
  updateTask: TaskRepository['updateTask'] = (...args) => this.inner.updateTask(...args)
  reorderTasks: TaskRepository['reorderTasks'] = (...args) => this.inner.reorderTasks(...args)
  deleteTask: TaskRepository['deleteTask'] = (...args) => this.inner.deleteTask(...args)

  addTaskUrl: TaskRepository['addTaskUrl'] = (...args) => this.inner.addTaskUrl(...args)
  deleteTaskUrl: TaskRepository['deleteTaskUrl'] = (...args) => this.inner.deleteTaskUrl(...args)
  updateTaskUrl: TaskRepository['updateTaskUrl'] = (...args) => this.inner.updateTaskUrl(...args)

  importTasks: TaskRepository['importTasks'] = (...args) => this.inner.importTasks(...args)
}
