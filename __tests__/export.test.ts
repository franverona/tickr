import { describe, expect, it } from 'vitest'
import { exportToCSV, exportToJSON } from '../lib/export'
import type { Tag, Task } from '../lib/types'

const TAGS: Tag[] = [
  { id: 'wip', label: 'WIP', color: '' },
  { id: 'blocked', label: 'Blocked', color: '' },
]

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '1',
    title: 'Task one',
    description: '',
    tags: [],
    completed: false,
    archived: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    linkedTaskIds: [],
    urls: [],
    ...overrides,
  }
}

describe('exportToJSON', () => {
  it('resolves tag IDs to labels', () => {
    const task = makeTask({ tags: ['wip', 'blocked'] })
    const result = JSON.parse(exportToJSON([task], TAGS))
    expect(result[0].tags).toEqual(['WIP', 'Blocked'])
  })

  it('falls back to the raw ID for unknown tags', () => {
    const task = makeTask({ tags: ['unknown-tag'] })
    const result = JSON.parse(exportToJSON([task], TAGS))
    expect(result[0].tags).toEqual(['unknown-tag'])
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
        'createdAt',
        'updatedAt',
      ]),
    )
  })
})

describe('exportToCSV', () => {
  it('produces a header row followed by data rows', () => {
    const lines = exportToCSV([makeTask()], TAGS).split('\n')
    expect(lines[0]).toBe('Title,Tags,Status,Description,Created At,Updated At')
    expect(lines).toHaveLength(2)
  })

  it('resolves tag IDs to labels joined with "; "', () => {
    const task = makeTask({ tags: ['wip', 'blocked'] })
    const rows = exportToCSV([task], TAGS).split('\n')
    expect(rows[1]).toContain('WIP; Blocked')
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
