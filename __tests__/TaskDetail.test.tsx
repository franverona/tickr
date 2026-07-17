// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TaskDetail from '../components/TaskDetail'
import type { Tag, Task } from '../lib/types'

const { updateTask, deleteTask } = vi.hoisted(() => ({
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}))
vi.mock('@/app/actions', () => ({
  updateTask,
  deleteTask,
  addTaskUrl: vi.fn(),
  deleteTaskUrl: vi.fn(),
  updateTaskUrl: vi.fn(),
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
})
