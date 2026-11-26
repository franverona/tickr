// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import Page from '../app/page'
import type { Tag, Task } from '../lib/types'

const { getTasks, getTags, createTask } = vi.hoisted(() => ({
  getTasks: vi.fn(),
  getTags: vi.fn(),
  createTask: vi.fn(),
}))
vi.mock('@/app/actions', () => ({
  getTasks,
  getTags,
  createTask,
  syncGitlabStatuses: vi.fn().mockResolvedValue([]),
}))

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Task',
    description: '',
    tags: [],
    completed: false,
    archived: false,
    dueDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
    archivedAt: null,
    urls: [],
    ...overrides,
  }
}

const TAGS: Tag[] = [
  { id: 'backend', label: 'Backend', color: 'bg-blue-600 text-blue-100' },
  { id: 'bug', label: 'Bug', color: 'bg-red-600 text-red-100' },
]

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.resetAllMocks()
})

it('adds #tag tokens to the active filter tags, without duplicates', async () => {
  getTasks.mockResolvedValue([makeTask({ id: 'a', title: 'Alpha', tags: ['backend'] })])
  getTags.mockResolvedValue(TAGS)
  createTask.mockResolvedValueOnce(makeTask({ id: 'b', title: 'Fix login' }))
  render(<Page />)

  fireEvent.click(await screen.findByRole('button', { name: /^Backend/, pressed: false }))
  const input = screen.getByRole('textbox', { name: 'Quick add task' })
  fireEvent.change(input, { target: { value: 'Fix login #bug #backend !2026-12-01 #nope' } })
  fireEvent.submit(input)
  await waitFor(() => expect(createTask).toHaveBeenCalled())
  expect(createTask).toHaveBeenLastCalledWith(
    expect.objectContaining({
      title: 'Fix login #bug #backend !2026-12-01 #nope',
      tags: ['backend'],
      dueDate: null,
    }),
  )

  createTask.mockResolvedValueOnce(makeTask({ id: 'c', title: 'Fix login' }))
  fireEvent.change(input, { target: { value: 'Fix login #BUG #backend !2026-12-01' } })
  fireEvent.submit(input)
  await waitFor(() => expect(createTask).toHaveBeenCalledTimes(2))
  expect(createTask).toHaveBeenLastCalledWith(
    expect.objectContaining({
      title: 'Fix login',
      tags: ['backend', 'bug'],
      dueDate: '2026-12-01',
    }),
  )
})
