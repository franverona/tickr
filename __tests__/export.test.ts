import { describe, expect, it } from 'vitest'
import { exportToCSV, exportToJSON } from '../lib/export'
import type { Tag, Task } from '../lib/types'

const TAGS: Tag[] = [
  { id: 'wip', label: 'WIP', color: 'bg-blue-600 text-blue-100 border-blue-500' },
  { id: 'blocked', label: 'Blocked', color: 'bg-red-600 text-red-100 border-red-500' },
]

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '1',
    title: 'Task one',
    description: '',
    tags: [],
    completed: false,
    archived: false,
    dueDate: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    completedAt: null,
    archivedAt: null,
    urls: [],
    ...overrides,
  }
}

describe('exportToJSON', () => {
  it('resolves tag IDs to labels with their color', () => {
    const task = makeTask({ tags: ['wip', 'blocked'] })
    const result = JSON.parse(exportToJSON([task], TAGS))
    expect(result[0].tags).toEqual([
      { label: 'WIP', color: 'bg-blue-600 text-blue-100 border-blue-500' },
      { label: 'Blocked', color: 'bg-red-600 text-red-100 border-red-500' },
    ])
  })

  it('falls back to the raw ID with an empty color for unknown tags', () => {
    const task = makeTask({ tags: ['unknown-tag'] })
    const result = JSON.parse(exportToJSON([task], TAGS))
    expect(result[0].tags).toEqual([{ label: 'unknown-tag', color: '' }])
  })

  it('includes task links', () => {
    const task = makeTask({ urls: [{ id: 'u1', url: 'https://example.com', label: 'Example' }] })
    const result = JSON.parse(exportToJSON([task], TAGS))
    expect(result[0].links).toEqual([{ url: 'https://example.com', label: 'Example' }])
  })

  it('includes all expected fields', () => {
    const task = makeTask()
    const result = JSON.parse(exportToJSON([task], TAGS))
    const keys = Object.keys(result[0])
    expect(keys).toEqual(
      expect.arrayContaining([
        'id',
        'title',
        'description',
        'tags',
        'completed',
        'archived',
        'dueDate',
        'createdAt',
        'updatedAt',
        'links',
      ]),
    )
  })
})

describe('exportToCSV', () => {
  it('produces a header row followed by data rows', () => {
    const lines = exportToCSV([makeTask()], TAGS).split('\n')
    expect(lines[0]).toBe(
      'Title,Tags,Status,Due Date,Description,Created At,Updated At,Completed At,Archived At,Links',
    )
    expect(lines).toHaveLength(2)
  })

  it('includes the due date when set', () => {
    const task = makeTask({ dueDate: '2024-02-15' })
    const rows = exportToCSV([task], TAGS).split('\n')
    expect(rows[1]).toContain('2024-02-15')
  })

  it('resolves tag IDs to "label::color" pairs joined with "; "', () => {
    const task = makeTask({ tags: ['wip', 'blocked'] })
    const rows = exportToCSV([task], TAGS).split('\n')
    expect(rows[1]).toContain(
      'WIP::bg-blue-600 text-blue-100 border-blue-500; Blocked::bg-red-600 text-red-100 border-red-500',
    )
  })

  it('encodes links as "label::url" pairs joined with "; "', () => {
    const task = makeTask({ urls: [{ id: 'u1', url: 'https://example.com', label: 'Example' }] })
    const rows = exportToCSV([task], TAGS).split('\n')
    expect(rows[1]).toContain('Example::https://example.com')
  })

  it('marks active task as "Active"', () => {
    const rows = exportToCSV([makeTask()], TAGS).split('\n')
    expect(rows[1]).toContain('Active')
  })

  it('marks completed task as "Completed"', () => {
    const rows = exportToCSV([makeTask({ completed: true })], TAGS).split('\n')
    expect(rows[1]).toContain('Completed')
  })

  it('marks archived task as "Archived"', () => {
    const rows = exportToCSV([makeTask({ archived: true })], TAGS).split('\n')
    expect(rows[1]).toContain('Archived')
  })

  it('quotes a field containing a comma', () => {
    const task = makeTask({ title: 'Buy milk, eggs' })
    const rows = exportToCSV([task], TAGS).split('\n')
    expect(rows[1]).toMatch(/^"Buy milk, eggs"/)
  })

  it('escapes double-quotes inside a quoted field', () => {
    const task = makeTask({ title: 'Say "hello"' })
    const rows = exportToCSV([task], TAGS).split('\n')
    expect(rows[1]).toMatch(/^"Say ""hello"""/)
  })

  it('quotes a field containing a newline', () => {
    const task = makeTask({ description: 'line one\nline two' })
    const csv = exportToCSV([task], TAGS)
    expect(csv).toContain('"line one\nline two"')
  })

  it('does not quote plain fields', () => {
    const task = makeTask({ title: 'Simple title' })
    const rows = exportToCSV([task], TAGS).split('\n')
    expect(rows[1]).toMatch(/^Simple title,/)
  })
})
