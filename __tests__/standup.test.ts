import { describe, expect, it } from 'vitest'
import { doneLastWeekSummary, isReviewLink } from '../lib/standup'
import type { Task } from '../lib/types'

const NOW = new Date('2026-03-10T12:00:00.000Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString()

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '1',
    title: 'Task',
    description: '',
    tags: [],
    completed: false,
    archived: false,
    dueDate: null,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(30),
    completedAt: null,
    archivedAt: null,
    urls: [],
    ...overrides,
  }
}

describe('isReviewLink', () => {
  it('recognizes GitLab MRs and GitHub PRs only', () => {
    expect(isReviewLink('https://gitlab.com/g/p/-/merge_requests/491')).toBe(true)
    expect(isReviewLink('https://github.com/o/r/pull/12')).toBe(true)
    expect(isReviewLink('https://jira.example.com/browse/NDC-1')).toBe(false)
    expect(isReviewLink('not a url')).toBe(false)
  })
})

describe('doneLastWeekSummary', () => {
  it('lists tasks completed in the last 7 days, newest first, with their MR/PR links', () => {
    const tasks = [
      makeTask({ id: 'a', title: 'Older', completed: true, completedAt: daysAgo(3) }),
      makeTask({
        id: 'b',
        title: 'Newer',
        completed: true,
        archived: true,
        completedAt: daysAgo(1),
        urls: [
          { id: 'u1', url: 'https://gitlab.com/g/p/-/merge_requests/491', label: 'MR' },
          { id: 'u2', url: 'https://jira.example.com/browse/NDC-1', label: 'Ticket' },
        ],
      }),
      makeTask({ id: 'c', title: 'Too old', completed: true, completedAt: daysAgo(8) }),
      makeTask({ id: 'd', title: 'Still open' }),
    ]
    expect(doneLastWeekSummary(tasks, NOW)).toBe(
      [
        'Done in the last 7 days:',
        '- Newer → https://gitlab.com/g/p/-/merge_requests/491',
        '- Older',
      ].join('\n'),
    )
  })

  it('returns null when nothing was completed in the last 7 days', () => {
    expect(doneLastWeekSummary([makeTask()], NOW)).toBeNull()
  })
})
