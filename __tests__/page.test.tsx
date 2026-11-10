// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Page from '../app/page'
import type { Tag, Task } from '../lib/types'
import { quickDueDate } from '../lib/dates'

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

describe('initial load', () => {
  it('shows an error instead of loading forever when the first load fails', async () => {
    getTasks.mockRejectedValue(new Error('database is down'))
    getTags.mockResolvedValue([])
    render(<Page />)

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load tasks")
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText('No tasks yet')).not.toBeInTheDocument()
  })
})

describe('detail panel', () => {
  async function openDoneTaskFromSearch() {
    const done = makeTask({ id: 'a', title: 'Alpha', completed: true, dueDate: '2026-01-01' })
    await renderReady([done])
    fireEvent.keyDown(document, { key: '/' })
    fireEvent.change(await screen.findByPlaceholderText('Search tasks…'), {
      target: { value: 'alpha' },
    })
    fireEvent.click(await screen.findByRole('button', { name: /^Alpha/ }))
    expect(await screen.findByRole('heading', { name: 'Alpha' })).toBeInTheDocument()
    return done
  }

  it('stays open when saving a task from another tab', async () => {
    const done = await openDoneTaskFromSearch()
    updateTask.mockResolvedValueOnce({ ...done, dueDate: null })

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    await waitFor(() => expect(updateTask).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull())
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument()
  })

  it('closes when the task leaves the current tab', async () => {
    const a = makeTask({ id: 'a', title: 'Alpha' })
    await renderReady([a])
    fireEvent.click(await screen.findByRole('button', { name: 'Alpha' }))
    updateTask.mockResolvedValueOnce({ ...a, archived: true })

    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }))

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Alpha' })).toBeNull())
  })
})

describe('quick add', () => {
  it('opens the new task in the detail panel', async () => {
    await renderReady([makeTask({ id: 'a', title: 'Alpha' })])
    createTask.mockResolvedValueOnce(makeTask({ id: 'b', title: 'Beta' }))

    const input = await screen.findByRole('textbox', { name: 'Quick add task' })
    fireEvent.change(input, { target: { value: 'Beta' } })
    fireEvent.submit(input)

    expect(await screen.findByRole('heading', { name: 'Beta' })).toBeInTheDocument()
    expect(input).toHaveValue('')
  })
})

describe('new task modal', () => {
  it('clears a search that would hide the new task', async () => {
    await renderReady([makeTask({ id: 'a', title: 'Alpha' })])
    fireEvent.keyDown(document, { key: '/' })
    fireEvent.change(await screen.findByPlaceholderText('Search tasks…'), {
      target: { value: 'alpha' },
    })
    createTask.mockResolvedValueOnce(makeTask({ id: 'b', title: 'Beta' }))
    // Clicking away keeps a non-empty search open, and frees `n`
    ;(document.activeElement as HTMLElement).blur()

    fireEvent.keyDown(document, { key: 'n' })
    const title = await screen.findByPlaceholderText('Task title')
    fireEvent.change(title, { target: { value: 'Beta' } })
    fireEvent.submit(title)

    expect(await screen.findByRole('heading', { name: 'Beta' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search tasks…')).toBeNull()
    expect(screen.getByRole('button', { name: 'Beta' })).toBeInTheDocument()
  })
})

describe('due reminder', () => {
  it('asks for notification permission once, not on every task change', async () => {
    const requestPermission = vi.fn(async () => 'default')
    vi.stubGlobal(
      'Notification',
      Object.assign(vi.fn(), { permission: 'default', requestPermission }),
    )
    try {
      await renderReady([makeTask({ id: 'a', title: 'Alpha', dueDate: '2000-01-01' })])
      await waitFor(() => expect(requestPermission).toHaveBeenCalled())
      createTask.mockResolvedValueOnce(makeTask({ id: 'b', title: 'Beta' }))

      const input = await screen.findByRole('textbox', { name: 'Quick add task' })
      fireEvent.change(input, { target: { value: 'Beta' } })
      fireEvent.submit(input)
      expect(await screen.findByRole('heading', { name: 'Beta' })).toBeInTheDocument()

      expect(requestPermission).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('duplicate', () => {
  it('copies the task from the context menu and opens the copy', async () => {
    const source = makeTask({
      id: 'a',
      title: 'Release',
      description: '- [ ] tag',
      tags: ['wip'],
      dueDate: '2026-05-01',
      urls: [{ id: 'u1', url: 'https://example.com', label: 'Runbook' }],
    })
    await renderReady([source])
    createTask.mockResolvedValueOnce(makeTask({ id: 'b', title: 'Release (copy)' }))

    fireEvent.contextMenu(await screen.findByRole('button', { name: /^Release/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))

    expect(await screen.findByRole('heading', { name: 'Release (copy)' })).toBeInTheDocument()
    expect(createTask).toHaveBeenCalledWith({
      title: 'Release (copy)',
      description: '- [ ] tag',
      tags: ['wip'],
      dueDate: '2026-05-01',
      urls: [{ url: 'https://example.com', label: 'Runbook' }],
    })
  })
})

describe('undo', () => {
  it('undoes completing a task from the toast', async () => {
    const a = makeTask({ id: 'a', title: 'Alpha' })
    await renderReady([a])
    updateTask.mockResolvedValueOnce({ ...a, completed: true })
    updateTask.mockResolvedValueOnce(a)

    fireEvent.contextMenu(await screen.findByRole('button', { name: /^Alpha/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mark as Complete' }))
    expect(await screen.findByText('Task marked as done')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Alpha/ })).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))

    await waitFor(() => expect(updateTask).toHaveBeenLastCalledWith('a', { completed: false }))
    expect(await screen.findByRole('button', { name: /^Alpha/ })).toBeInTheDocument()
  })

  it('offers no undo for reopening', async () => {
    const a = makeTask({ id: 'a', title: 'Alpha', completed: true })
    localStorage.setItem('tickr:tab', 'done')
    await renderReady([a])
    updateTask.mockResolvedValueOnce({ ...a, completed: false })

    fireEvent.contextMenu(await screen.findByRole('button', { name: /^Alpha/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reopen' }))

    expect(await screen.findByText('Task reopened')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })
})

describe('actions on search results', () => {
  it('offers the actions of the task, not of the tab', async () => {
    await renderReady([makeTask({ id: 'a', title: 'Alpha', completed: true })])
    fireEvent.keyDown(document, { key: '/' })
    fireEvent.change(await screen.findByPlaceholderText('Search tasks…'), {
      target: { value: 'alpha' },
    })

    fireEvent.contextMenu(await screen.findByRole('button', { name: /^Alpha/ }))

    expect(await screen.findByRole('menuitem', { name: 'Reopen' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Mark as Complete' })).not.toBeInTheDocument()
  })
})

describe('status feedback', () => {
  it('confirms completing a task from its card', async () => {
    const a = makeTask({ id: 'a', title: 'Alpha' })
    await renderReady([a])
    updateTask.mockResolvedValueOnce({ ...a, completed: true })

    fireEvent.click(screen.getByRole('button', { name: 'Complete Alpha' }))

    expect(await screen.findByText('Task marked as done')).toBeInTheDocument()
  })
})

describe('copy last 7 days', () => {
  it('copies recently completed tasks from the Done tab', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const done = makeTask({
      id: 'a',
      title: 'Shipped it',
      completed: true,
      completedAt: new Date().toISOString(),
    })
    await renderReady([done])

    expect(screen.queryByRole('button', { name: 'Copy last 7 days' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Done/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy last 7 days' }))

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('Done in the last 7 days:\n- Shipped it'),
    )
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument()
  })
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

  it('matches a link URL even when its label and the task text do not', async () => {
    const linked = makeTask({
      id: 'a',
      title: 'Alpha',
      urls: [{ id: 'u1', url: 'https://jira.example.com/browse/NDC-7921', label: 'Ticket' }],
    })
    const unlinked = makeTask({ id: 'b', title: 'Beta' })
    await renderReady([linked, unlinked])

    fireEvent.click(screen.getByTitle('Search tasks'))
    fireEvent.change(screen.getByPlaceholderText('Search tasks…'), {
      target: { value: 'ndc-7921' },
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

describe('bulk action scope', () => {
  function select(...titles: string[]) {
    for (const title of titles) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(title) }))
    }
  }

  it('ignores selected tasks that leave view when the search is cleared', async () => {
    const a = makeTask({ id: 'a', title: 'Alpha' })
    const d = makeTask({ id: 'd', title: 'Delta', completed: true })
    await renderReady([a, d])
    fireEvent.click(screen.getByTitle('Search tasks'))
    const search = screen.getByPlaceholderText('Search tasks…')
    fireEvent.change(search, { target: { value: 'Delta' } })
    fireEvent.click(screen.getByText('Select'))
    select('Delta')
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    // Back on the Active tab, the Done task is hidden and must not be acted on
    fireEvent.change(search, { target: { value: '' } })
    expect(screen.getByText('0 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete' })).toBeDisabled()
  })

  it('applies an action only to the selected tasks it fits', async () => {
    const a = makeTask({ id: 'a', title: 'Alpha task' })
    const c = makeTask({ id: 'c', title: 'Gamma task', archived: true })
    await renderReady([a, c])
    fireEvent.click(screen.getByTitle('Search tasks'))
    fireEvent.change(screen.getByPlaceholderText('Search tasks…'), { target: { value: 'task' } })
    fireEvent.click(screen.getByText('Select'))
    select('Alpha', 'Gamma')

    updateTasks.mockResolvedValueOnce({ succeeded: [{ ...a, completed: true }], failedIds: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }))
    await waitFor(() => expect(updateTasks).toHaveBeenCalledWith(['a'], { completed: true }))
  })
})

describe('quick due dates', () => {
  it('sets the due date of every selected active task from the bulk bar', async () => {
    const a = makeTask({ id: 'a', title: 'Alpha' })
    const b = makeTask({ id: 'b', title: 'Beta' })
    await renderReady([a, b])
    fireEvent.click(screen.getByText('Select'))
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
    fireEvent.click(screen.getByRole('button', { name: /Beta/ }))

    const dueDate = quickDueDate('tomorrow')
    updateTasks.mockResolvedValueOnce({
      succeeded: [
        { ...a, dueDate },
        { ...b, dueDate },
      ],
      failedIds: [],
    })
    fireEvent.change(screen.getByLabelText('Set due date'), { target: { value: 'tomorrow' } })

    await waitFor(() => expect(updateTasks).toHaveBeenCalledWith(['a', 'b'], { dueDate }))
    expect(await screen.findByText('Updated 2 tasks')).toBeInTheDocument()
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

  it('N opens the new-task modal with Caps Lock on', async () => {
    await renderReady([makeTask({ id: 'a', title: 'Alpha' })])
    fireEvent.keyDown(document, { key: 'N' })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('/ returns focus to a search box that is already open', async () => {
    await renderReady([makeTask({ id: 'a', title: 'Alpha' })])
    fireEvent.keyDown(document, { key: '/' })
    const input = await screen.findByPlaceholderText('Search tasks…')
    input.blur()

    fireEvent.keyDown(document, { key: '/' })

    expect(input).toHaveFocus()
  })

  it('Escape closes the open task detail panel', async () => {
    const a = makeTask({ id: 'a', title: 'Alpha' })
    await renderReady([a])
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    expect(await screen.findByRole('heading', { name: 'Alpha' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('heading', { name: 'Alpha' })).not.toBeInTheDocument()
  })

  it('Escape in a field that closes on Escape leaves the task open', async () => {
    const a = makeTask({ id: 'a', title: 'Alpha' })
    await renderReady([a])
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    expect(await screen.findByRole('heading', { name: 'Alpha' })).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Add link'))
    const input = screen.getByPlaceholderText('URL')
    // Browsers unmount the field before the document listener runs, so focus is
    // already gone by then; act() defers that here, so drop focus by hand.
    input.blur()
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByPlaceholderText('URL')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument()
  })

  it('Escape closes the "···" options menu', async () => {
    await renderReady([])
    fireEvent.click(screen.getByTitle('More options'))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('focuses the first item of the "···" menu on open, and ArrowDown/ArrowUp cycle focus', async () => {
    await renderReady([])
    fireEvent.click(screen.getByTitle('More options'))

    const first = screen.getByRole('menuitem', { name: 'Tags' })
    const second = screen.getByRole('menuitem', { name: 'Export as JSON' })
    await waitFor(() => expect(first).toHaveFocus())

    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(second).toHaveFocus()

    fireEvent.keyDown(document, { key: 'ArrowUp' })
    expect(first).toHaveFocus()
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

    expect(screen.getByText('Drag A').closest('[draggable]')).toBeNull()
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
