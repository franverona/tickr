// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TaskDetail from '../components/TaskDetail'
import type { Tag, Task } from '../lib/types'

const { updateTask, deleteTask, addTaskUrl, deleteTaskUrl, updateTaskUrl } = vi.hoisted(() => ({
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  addTaskUrl: vi.fn(),
  deleteTaskUrl: vi.fn(),
  updateTaskUrl: vi.fn(),
}))
vi.mock('@/app/actions', () => ({
  updateTask,
  deleteTask,
  addTaskUrl,
  deleteTaskUrl,
  updateTaskUrl,
}))

// Mock for @/components/MdEditor — MDEditor/MarkdownLink/etc. copied from
// CreateTaskModal.test.tsx. MDPreview is enhanced here: it scans `source`
// for markdown checklist lines (mirroring TaskDetail.tsx's own
// CHECKLIST_ITEM_RE) and renders each one through the real `input` render
// prop TaskDetail passes in, so clicking a checkbox exercises the same
// handleToggleChecklist wiring the app uses — not just a dumb <div>.
const CHECKLIST_LINE_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](.*)$/gm

vi.mock('@/components/MdEditor', () => ({
  MDEditor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="md-editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  MDPreview: ({
    source,
    components,
  }: {
    source: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    components?: { input?: (props: any) => React.ReactNode }
  }) => {
    const items: { mark: string; text: string }[] = []
    let match: RegExpExecArray | null
    CHECKLIST_LINE_RE.lastIndex = 0
    while ((match = CHECKLIST_LINE_RE.exec(source))) {
      items.push({ mark: match[2], text: match[3] })
    }
    const InputComponent = components?.input
    return (
      <div data-testid="md-preview">
        {items.map((item, i) => (
          <label key={i}>
            {InputComponent ? (
              InputComponent({ type: 'checkbox', checked: item.mark !== ' ', node: {} })
            ) : (
              <input type="checkbox" checked={item.mark !== ' '} readOnly />
            )}
            {item.text}
          </label>
        ))}
      </div>
    )
  },
  MarkdownLink: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
  makeImageHandlers: () => ({ onDrop: vi.fn(), onPaste: vi.fn() }),
  replaceImageWidth: (markdown: string) => markdown,
  remarkOutlineList: () => (tree: unknown) => tree,
}))

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Fix the flaky test',
    // Empty description: TaskDetail renders "No description." instead of
    // MDPreview, so no MDEditor mock is needed for this plan's slice.
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

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 'tag-1',
    label: 'bug',
    color: 'bg-red-600 text-red-100 border-red-500',
    ...overrides,
  }
}

function renderTaskDetail(
  task: Task,
  tags: Tag[] = [],
  overrides: Partial<Parameters<typeof TaskDetail>[0]> = {},
) {
  const props = {
    task,
    tags,
    allTasks: [],
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    onTagCreated: vi.fn(),
    onSelectTask: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  }
  const result = render(<TaskDetail {...props} />)
  return { ...result, props }
}

describe('TaskDetail', () => {
  afterEach(() => {
    cleanup()
    updateTask.mockReset()
    deleteTask.mockReset()
    addTaskUrl.mockReset()
    deleteTaskUrl.mockReset()
    updateTaskUrl.mockReset()
  })

  it('edits and saves the title', async () => {
    const task = makeTask()
    const updated = makeTask({ title: 'Fix it for real' })
    updateTask.mockResolvedValueOnce(updated)
    const { props } = renderTaskDetail(task)

    fireEvent.click(screen.getByText('Fix the flaky test'))
    const input = screen.getByDisplayValue('Fix the flaky test')
    fireEvent.change(input, { target: { value: 'Fix it for real' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await vi.waitFor(() => expect(props.onUpdate).toHaveBeenCalledWith(updated))
    expect(updateTask).toHaveBeenCalledWith('task-1', { title: 'Fix it for real' })
  })

  it('toggles a tag via the embedded TagSelector', async () => {
    const tag = makeTag()
    const task = makeTask()
    const updated = makeTask({ tags: [tag.id] })
    updateTask.mockResolvedValueOnce(updated)
    const { props } = renderTaskDetail(task, [tag])

    fireEvent.click(screen.getByRole('button', { name: 'bug' }))

    await vi.waitFor(() => expect(props.onUpdate).toHaveBeenCalledWith(updated))
    expect(updateTask).toHaveBeenCalledWith('task-1', { tags: ['tag-1'] })
  })

  it('changes the due date', async () => {
    const task = makeTask()
    const updated = makeTask({ dueDate: '2026-02-01' })
    updateTask.mockResolvedValueOnce(updated)
    const { props, container } = renderTaskDetail(task)

    const dateInput = container.querySelector('input[type="date"]')!
    fireEvent.change(dateInput, { target: { value: '2026-02-01' } })

    await vi.waitFor(() => expect(props.onUpdate).toHaveBeenCalledWith(updated))
    expect(updateTask).toHaveBeenCalledWith('task-1', { dueDate: '2026-02-01' })
  })

  it('clears the due date', async () => {
    const task = makeTask({ dueDate: '2026-02-01' })
    const updated = makeTask({ dueDate: null })
    updateTask.mockResolvedValueOnce(updated)
    const { props } = renderTaskDetail(task)

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    await vi.waitFor(() => expect(props.onUpdate).toHaveBeenCalledWith(updated))
    expect(updateTask).toHaveBeenCalledWith('task-1', { dueDate: null })
  })

  it('marks the task complete', async () => {
    const task = makeTask()
    const updated = makeTask({ completed: true })
    updateTask.mockResolvedValueOnce(updated)
    const { props } = renderTaskDetail(task)

    fireEvent.click(screen.getByRole('button', { name: 'Mark Complete' }))

    await vi.waitFor(() => expect(props.onUpdate).toHaveBeenCalledWith(updated))
    expect(updateTask).toHaveBeenCalledWith('task-1', { completed: true })
  })

  it('archives the task', async () => {
    const task = makeTask()
    const updated = makeTask({ archived: true })
    updateTask.mockResolvedValueOnce(updated)
    const { props } = renderTaskDetail(task)

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))

    await vi.waitFor(() => expect(props.onUpdate).toHaveBeenCalledWith(updated))
    expect(updateTask).toHaveBeenCalledWith('task-1', { archived: true })
  })

  it('requires a second click to confirm delete', async () => {
    const task = makeTask()
    deleteTask.mockResolvedValueOnce(undefined)
    const { props } = renderTaskDetail(task)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('button', { name: 'Confirm Delete' })).toBeInTheDocument()
    expect(deleteTask).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }))

    await vi.waitFor(() => expect(props.onDelete).toHaveBeenCalledWith('task-1'))
    expect(deleteTask).toHaveBeenCalledWith('task-1')
  })

  it('cancels the delete confirmation without calling deleteTask', () => {
    const task = makeTask()
    renderTaskDetail(task)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(deleteTask).not.toHaveBeenCalled()
  })

  it('auto-saves the description after the debounce elapses', async () => {
    vi.useFakeTimers()
    const task = makeTask()
    const updated = makeTask({ description: 'New notes' })
    updateTask.mockResolvedValueOnce(updated)
    const { props } = renderTaskDetail(task)

    fireEvent.click(screen.getByText('Edit'))
    const editor = screen.getByTestId('md-editor')
    fireEvent.change(editor, { target: { value: 'New notes' } })

    await vi.advanceTimersByTimeAsync(1500)

    expect(updateTask).toHaveBeenCalledWith('task-1', { description: 'New notes' })
    expect(props.onUpdate).toHaveBeenCalledWith(updated)
    vi.useRealTimers()
  })

  it('flushes a pending debounced save when unmounted before the debounce elapses', async () => {
    const task = makeTask()
    const updated = makeTask({ description: 'Switched away mid-edit' })
    updateTask.mockResolvedValueOnce(updated)
    const { props, unmount } = renderTaskDetail(task)

    fireEvent.click(screen.getByText('Edit'))
    const editor = screen.getByTestId('md-editor')
    fireEvent.change(editor, { target: { value: 'Switched away mid-edit' } })

    // Simulates switching tasks or closing the panel within the 1.5s
    // debounce window — page.tsx remounts TaskDetail via key={task.id}.
    unmount()

    await vi.waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith('task-1', { description: 'Switched away mid-edit' }),
    )
    expect(props.onUpdate).toHaveBeenCalledWith(updated)
  })

  it('saves the description immediately when Done is clicked', async () => {
    const task = makeTask()
    const updated = makeTask({ description: 'Finished notes' })
    updateTask.mockResolvedValueOnce(updated)
    const { props } = renderTaskDetail(task)

    fireEvent.click(screen.getByText('Edit'))
    const editor = screen.getByTestId('md-editor')
    fireEvent.change(editor, { target: { value: 'Finished notes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    await vi.waitFor(() => expect(props.onUpdate).toHaveBeenCalledWith(updated))
    expect(updateTask).toHaveBeenCalledWith('task-1', { description: 'Finished notes' })
    expect(screen.queryByTestId('md-editor')).not.toBeInTheDocument()
  })

  it('adds a link', async () => {
    const task = makeTask()
    const updated = makeTask({ urls: [{ id: 'url-1', url: 'not-a-real-url', label: 'notes' }] })
    addTaskUrl.mockResolvedValueOnce(updated)
    const { props } = renderTaskDetail(task)

    // Links section starts expanded (showUrlLinks defaults to true).
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
    fireEvent.change(screen.getByPlaceholderText('URL'), { target: { value: 'not-a-real-url' } })
    fireEvent.change(screen.getByPlaceholderText('Label (optional)'), {
      target: { value: 'notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await vi.waitFor(() => expect(props.onUpdate).toHaveBeenCalledWith(updated))
    expect(addTaskUrl).toHaveBeenCalledWith('task-1', { url: 'not-a-real-url', label: 'notes' })
  })

  it('edits an existing link', async () => {
    const task = makeTask({
      urls: [{ id: 'url-1', url: 'https://example.com', label: 'Example' }],
    })
    const updated = makeTask({
      urls: [{ id: 'url-1', url: 'https://example.com/updated', label: 'Example' }],
    })
    updateTaskUrl.mockResolvedValueOnce(updated)
    const { props } = renderTaskDetail(task)

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    const urlInput = screen.getByDisplayValue('https://example.com')
    fireEvent.change(urlInput, { target: { value: 'https://example.com/updated' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(props.onUpdate).toHaveBeenCalledWith(updated))
    expect(updateTaskUrl).toHaveBeenCalledWith('task-1', 'url-1', {
      url: 'https://example.com/updated',
      label: 'Example',
    })
  })

  it('deletes a link after confirmation', async () => {
    const task = makeTask({
      urls: [{ id: 'url-1', url: 'https://example.com', label: 'Example' }],
    })
    const updated = makeTask({ urls: [] })
    deleteTaskUrl.mockResolvedValueOnce(updated)
    const { props } = renderTaskDetail(task)

    fireEvent.click(screen.getByTitle('Remove link'))
    expect(deleteTaskUrl).not.toHaveBeenCalled()
    const linkRow = screen.getByText('Delete?').closest('div')!.parentElement!
    fireEvent.click(within(linkRow).getByRole('button', { name: 'Delete' }))

    await vi.waitFor(() => expect(props.onUpdate).toHaveBeenCalledWith(updated))
    expect(deleteTaskUrl).toHaveBeenCalledWith('task-1', 'url-1')
  })

  it('cancels a link delete confirmation without calling deleteTaskUrl', () => {
    const task = makeTask({
      urls: [{ id: 'url-1', url: 'https://example.com', label: 'Example' }],
    })
    renderTaskDetail(task)

    fireEvent.click(screen.getByTitle('Remove link'))
    const linkRow = screen.getByText('Delete?').closest('div')!.parentElement!
    fireEvent.click(within(linkRow).getByRole('button', { name: 'Cancel' }))

    expect(deleteTaskUrl).not.toHaveBeenCalled()
    expect(screen.getByTitle('Remove link')).toBeInTheDocument()
  })

  it('does not delete a link when the user cancels the confirmation', () => {
    const task = makeTask({
      urls: [{ id: 'url-1', url: 'https://example.com', label: 'Example' }],
    })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderTaskDetail(task)

    fireEvent.click(screen.getByTitle('Remove link'))

    expect(deleteTaskUrl).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('checks an unchecked checklist item', async () => {
    const task = makeTask({ description: '- [ ] First item\n- [x] Second item' })
    const updated = makeTask({ description: '- [x] First item\n- [x] Second item' })
    updateTask.mockResolvedValueOnce(updated)
    const { props } = renderTaskDetail(task)

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])

    await vi.waitFor(() => expect(props.onUpdate).toHaveBeenCalledWith(updated))
    expect(updateTask).toHaveBeenCalledWith('task-1', {
      description: '- [x] First item\n- [x] Second item',
    })
  })

  it('unchecks a checked checklist item', async () => {
    const task = makeTask({ description: '- [ ] First item\n- [x] Second item' })
    const updated = makeTask({ description: '- [ ] First item\n- [ ] Second item' })
    updateTask.mockResolvedValueOnce(updated)
    const { props } = renderTaskDetail(task)

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])

    await vi.waitFor(() => expect(props.onUpdate).toHaveBeenCalledWith(updated))
    expect(updateTask).toHaveBeenCalledWith('task-1', {
      description: '- [ ] First item\n- [ ] Second item',
    })
  })
})
