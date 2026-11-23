// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import Page from '../app/page'
import type { Tag, Task } from '../lib/types'

vi.mock('@/components/MdEditor', () => ({
  MDEditor: () => null,
  MDPreview: ({ source }: { source: string }) => <div>{source}</div>,
  MarkdownLink: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
  makeImageHandlers: () => ({ onDrop: vi.fn(), onPaste: vi.fn() }),
  replaceImageWidth: (markdown: string) => markdown,
  remarkOutlineList: () => (tree: unknown) => tree,
}))

const { getTasks, getTags } = vi.hoisted(() => ({ getTasks: vi.fn(), getTags: vi.fn() }))
vi.mock('@/app/actions', () => ({
  getTasks,
  getTags,
  reorderTasks: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTasks: vi.fn(),
  deleteTasks: vi.fn(),
  createTask: vi.fn(),
}))

function makeTask(overrides: Partial<Task>): Task {
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

afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('copies only the selected tasks as Markdown from the bulk bar', async () => {
  const tag: Tag = { id: 'backend', label: 'Backend', color: 'bg-blue-600 text-blue-100' }
  getTasks.mockResolvedValue([
    makeTask({ id: 'a', title: 'Alpha', tags: ['backend'] }),
    makeTask({ id: 'b', title: 'Beta' }),
    makeTask({
      id: 'c',
      title: 'Gamma',
      urls: [{ id: 'u1', url: 'https://example.com/mr/1', label: '' }],
    }),
  ])
  getTags.mockResolvedValue([tag])
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  render(<Page />)
  await screen.findByText('Alpha')

  fireEvent.click(screen.getByText('Select'))
  fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
  fireEvent.click(screen.getByRole('button', { name: /Gamma/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(
      '## Alpha\n\nTags: Backend\n\n## Gamma\n\n- https://example.com/mr/1',
    ),
  )
  expect(await screen.findByText('Copied 2 tasks as Markdown')).toBeInTheDocument()
})
