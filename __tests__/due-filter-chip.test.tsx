// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Page from '../app/page'
import type { Tag, Task } from '../lib/types'
import { localDateKey } from '../lib/dates'

// Pressing 'n' renders CreateTaskModal, which renders MDEditor
vi.mock('@/components/MdEditor', () => ({
  MDEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="md-editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  MDPreview: ({ source }: { source: string }) => <div data-testid="md-preview">{source}</div>,
  MarkdownLink: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
  makeImageHandlers: () => ({ onDrop: vi.fn(), onPaste: vi.fn() }),
  replaceImageWidth: (markdown: string) => markdown,
  remarkOutlineList: () => (tree: unknown) => tree,
}))

const {
  getTasks,
  getTags,
  reorderTasks,
  updateTask,
  deleteTask,
  updateTasks,
  deleteTasks,
  createTask,
} = vi.hoisted(() => ({
  getTasks: vi.fn(),
  getTags: vi.fn(),
  reorderTasks: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  updateTasks: vi.fn(),
  deleteTasks: vi.fn(),
  createTask: vi.fn(),
}))
vi.mock('@/app/actions', () => ({
  getTasks,
  getTags,
  reorderTasks,
  updateTask,
  deleteTask,
  updateTasks,
  deleteTasks,
  createTask,
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

const TAG_BACKEND: Tag = { id: 'backend', label: 'Backend', color: 'bg-blue-600 text-blue-100' }

async function renderReady(tasks: Task[], tags: Tag[] = []) {
  getTasks.mockResolvedValue(tasks)
  getTags.mockResolvedValue(tags)
  const utils = render(<Page />)
  await waitFor(() => expect(getTasks).toHaveBeenCalled())
  return utils
}

afterEach(() => {
  cleanup()
  // The page persists the selected tab and task; don't leak them between tests
  localStorage.clear()
  getTasks.mockReset()
  getTags.mockReset()
  reorderTasks.mockReset()
  updateTask.mockReset()
  deleteTask.mockReset()
  updateTasks.mockReset()
  deleteTasks.mockReset()
  createTask.mockReset()
})

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return localDateKey(d)
}

describe('due today / overdue chip', () => {
  const tasks = [
    makeTask({ id: 'o', title: 'Overdue', dueDate: daysFromNow(-2), tags: ['backend'] }),
    makeTask({ id: 't', title: 'Today', dueDate: daysFromNow(0) }),
    makeTask({ id: 'l', title: 'Later', dueDate: daysFromNow(10), tags: ['backend'] }),
    makeTask({ id: 'u', title: 'Undated' }),
  ]

  it('shows only overdue and due-today tasks, combined with tag filters', async () => {
    await renderReady(tasks, [TAG_BACKEND])
    const chip = await screen.findByRole('button', { name: /^Due today \/ overdue/ })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(chip).toHaveTextContent('2')

    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Overdue/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Today/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Later/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Undated/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^Backend/ }))
    expect(screen.getByRole('button', { name: /^Overdue/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Today/ })).toBeNull()

    fireEvent.click(chip)
    fireEvent.click(screen.getByRole('button', { name: /^Backend/ }))
    expect(screen.getByRole('button', { name: /^Undated/ })).toBeInTheDocument()
  })

  it('is hidden when nothing is due', async () => {
    await renderReady([tasks[2], tasks[3]])
    await screen.findByRole('button', { name: /^Later/ })
    expect(screen.queryByRole('button', { name: /^Due today/ })).toBeNull()
  })
})
