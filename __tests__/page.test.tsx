// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Page from '../app/page'
import type { Tag, Task } from '../lib/types'

// Reusable mock for @/components/MdEditor — see CreateTaskModal.test.tsx.
// Needed here because pressing 'n' renders CreateTaskModal, which renders
// MDEditor unconditionally.
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
  getTasks.mockReset()
  getTags.mockReset()
  reorderTasks.mockReset()
  updateTask.mockReset()
  deleteTask.mockReset()
  updateTasks.mockReset()
  deleteTasks.mockReset()
  createTask.mockReset()
})

describe('search', () => {
  it('matches a tag label even when the query is absent from title/description', async () => {
    const tagged = makeTask({ id: 'a', title: 'Alpha', tags: ['backend'] })
    const untagged = makeTask({ id: 'b', title: 'Beta' })
    await renderReady([tagged, untagged], [TAG_BACKEND])

    fireEvent.click(screen.getByTitle('Search tasks'))
    fireEvent.change(screen.getByPlaceholderText('Search tasks…'), {
      target: { value: 'backend' },
    })

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
  })

  it('matches a link label even when the query is absent from title/description', async () => {
    const linked = makeTask({
      id: 'a',
      title: 'Alpha',
      urls: [{ id: 'u1', url: 'https://example.com', label: 'Staging' }],
    })
    const unlinked = makeTask({ id: 'b', title: 'Beta' })
    await renderReady([linked, unlinked])

    fireEvent.click(screen.getByTitle('Search tasks'))
    fireEvent.change(screen.getByPlaceholderText('Search tasks…'), {
      target: { value: 'staging' },
    })

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
  })
})

describe('bulk actions', () => {
  async function enterSelectModeAndSelect(...titles: string[]) {
    fireEvent.click(screen.getByText('Select'))
    for (const title of titles) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(title) }))
    }
  }

  it('shows a plain success toast and exits select mode when everything succeeds', async () => {
    const a = makeTask({ id: 'a', title: 'Alpha' })
    const b = makeTask({ id: 'b', title: 'Beta' })
    await renderReady([a, b])
    await enterSelectModeAndSelect('Alpha', 'Beta')

    updateTasks.mockResolvedValueOnce({
      succeeded: [
        { ...a, completed: true },
        { ...b, completed: true },
      ],
      failedIds: [],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }))

    expect(await screen.findByText('Updated 2 tasks')).toBeInTheDocument()
    // Select mode exited: the bulk-action toolbar (with its "Cancel" button
    // and "N selected" label) is gone.
    await waitFor(() => expect(screen.queryByText(/selected$/)).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('shows a partial-failure toast and narrows selection to just the failures', async () => {
    const a = makeTask({ id: 'a', title: 'Alpha' })
    const b = makeTask({ id: 'b', title: 'Beta' })
    await renderReady([a, b])
    await enterSelectModeAndSelect('Alpha', 'Beta')

    updateTasks.mockResolvedValueOnce({
      succeeded: [{ ...a, completed: true }],
      failedIds: ['b'],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }))

    expect(await screen.findByText('Updated 1 of 2 tasks — 1 failed')).toBeInTheDocument()
    // Still in select mode (not exited on partial failure), narrowed to 1.
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('shows a full-failure toast when every item fails', async () => {
    const a = makeTask({ id: 'a', title: 'Alpha' })
    await renderReady([a])
    await enterSelectModeAndSelect('Alpha')

    updateTasks.mockResolvedValueOnce({ succeeded: [], failedIds: ['a'] })
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }))

    expect(await screen.findByText('Failed to update 1 task')).toBeInTheDocument()
  })

  it('deletes only the succeeded ids and leaves failures visible', async () => {
    const a = makeTask({ id: 'a', title: 'Alpha' })
    const b = makeTask({ id: 'b', title: 'Beta' })
    await renderReady([a, b])
    await enterSelectModeAndSelect('Alpha', 'Beta')

    deleteTasks.mockResolvedValueOnce({ succeededIds: ['a'], failedIds: ['b'] })
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete?' }))

    expect(await screen.findByText('Deleted 1 of 2 tasks — 1 failed')).toBeInTheDocument()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })
})

describe('keyboard shortcuts', () => {
  it('"n" opens the New Task modal', async () => {
    await renderReady([])
    fireEvent.keyDown(document, { key: 'n' })
    expect(await screen.findByRole('dialog', { name: 'New Task' })).toBeInTheDocument()
  })

  it('"n" does nothing while typing in the search box', async () => {
    await renderReady([])
    fireEvent.click(screen.getByTitle('Search tasks'))
    fireEvent.keyDown(screen.getByPlaceholderText('Search tasks…'), { key: 'n' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('"/" focuses the search input', async () => {
    await renderReady([])
    fireEvent.keyDown(document, { key: '/' })
    expect(await screen.findByPlaceholderText('Search tasks…')).toHaveFocus()
  })

  it('Escape closes the open task detail panel', async () => {
    const a = makeTask({ id: 'a', title: 'Alpha' })
    await renderReady([a])
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    expect(await screen.findByRole('heading', { name: 'Alpha' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('heading', { name: 'Alpha' })).not.toBeInTheDocument()
  })

  it('Escape closes the "···" options menu', async () => {
    await renderReady([])
    fireEvent.click(screen.getByTitle('More options'))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('drag-and-drop reorder', () => {
  it('reorders only the visible active tasks, excluding an archived-incomplete task', async () => {
    const dragA = makeTask({ id: 'drag-a', title: 'Drag A' })
    const dragB = makeTask({ id: 'drag-b', title: 'Drag B' })
    const dragC = makeTask({ id: 'drag-c', title: 'Drag C', archived: true })
    const { container } = await renderReady([dragA, dragB, dragC])

    const wrapperA = screen.getByText('Drag A').closest('[draggable]')!
    const dropZone = container.querySelector('.h-4')!
    reorderTasks.mockResolvedValueOnce(undefined)

    fireEvent.dragStart(wrapperA, { dataTransfer: {} })
    fireEvent.dragOver(dropZone, { dataTransfer: {} })
    fireEvent.drop(dropZone, { dataTransfer: {} })

    await waitFor(() => expect(reorderTasks).toHaveBeenCalledWith(['drag-b', 'drag-a']))
  })

  it('disables dragging while a search query is active', async () => {
    const dragA = makeTask({ id: 'drag-a', title: 'Drag A' })
    await renderReady([dragA])

    fireEvent.click(screen.getByTitle('Search tasks'))
    fireEvent.change(screen.getByPlaceholderText('Search tasks…'), {
      target: { value: 'Drag A' },
    })

    const wrapper = screen.getByText('Drag A').closest('[draggable]')!
    expect(wrapper).toHaveAttribute('draggable', 'false')
  })
})

describe('keyboard list navigation', () => {
  it('only one card is a Tab stop at a time; ArrowDown/ArrowUp/Home/End move it', async () => {
    const a = makeTask({ id: 'a', title: 'Alpha' })
    const b = makeTask({ id: 'b', title: 'Beta' })
    const c = makeTask({ id: 'c', title: 'Gamma' })
    await renderReady([a, b, c])

    const cardA = screen.getByRole('button', { name: 'Alpha' })
    const cardB = screen.getByRole('button', { name: 'Beta' })
    const cardC = screen.getByRole('button', { name: 'Gamma' })
    expect(cardA).toHaveAttribute('tabindex', '0')
    expect(cardB).toHaveAttribute('tabindex', '-1')
    expect(cardC).toHaveAttribute('tabindex', '-1')

    fireEvent.keyDown(cardA, { key: 'ArrowDown' })
    expect(cardB).toHaveFocus()
    expect(cardB).toHaveAttribute('tabindex', '0')
    expect(cardA).toHaveAttribute('tabindex', '-1')

    fireEvent.keyDown(cardB, { key: 'ArrowDown' })
    expect(cardC).toHaveFocus()

    // Clamps at the last card instead of wrapping.
    fireEvent.keyDown(cardC, { key: 'ArrowDown' })
    expect(cardC).toHaveFocus()

    fireEvent.keyDown(cardC, { key: 'Home' })
    expect(cardA).toHaveFocus()

    fireEvent.keyDown(cardA, { key: 'End' })
    expect(cardC).toHaveFocus()
  })

  it('opens the context menu for the focused card via the ContextMenu key', async () => {
    const a = makeTask({ id: 'a', title: 'Alpha' })
    await renderReady([a])
    const cardA = screen.getByRole('button', { name: 'Alpha' })

    fireEvent.keyDown(cardA, { key: 'ContextMenu' })

    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Mark as Complete' })).toBeInTheDocument()
  })
})
