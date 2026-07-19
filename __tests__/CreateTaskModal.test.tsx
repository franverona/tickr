// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CreateTaskModal from '../components/CreateTaskModal'
import type { Task } from '../lib/types'

// Reusable mock for @/components/MdEditor — copy this block into future test
// files (e.g. TaskDetail.test.tsx) that render MDEditor/MDPreview. Stubs all
// six named exports so any importer works, even if a given test only
// exercises a subset of them.
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

const { createTask } = vi.hoisted(() => ({ createTask: vi.fn() }))
vi.mock('@/app/actions', () => ({ createTask }))

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'New task',
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

describe('CreateTaskModal', () => {
  afterEach(() => {
    cleanup()
    createTask.mockReset()
  })

  it('renders without error, including the mocked description editor', () => {
    render(
      <CreateTaskModal tags={[]} onCreated={() => {}} onClose={() => {}} onTagCreated={() => {}} />,
    )
    expect(screen.getByPlaceholderText('Task title')).toBeInTheDocument()
    expect(screen.getByTestId('md-editor')).toBeInTheDocument()
  })

  it('submits title and description (typed into the mocked editor) via createTask', async () => {
    const created = makeTask({ title: 'Write docs', description: 'Some **markdown**' })
    createTask.mockResolvedValueOnce(created)
    const onCreated = vi.fn()

    render(
      <CreateTaskModal
        tags={[]}
        onCreated={onCreated}
        onClose={() => {}}
        onTagCreated={() => {}}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Write docs' } })
    fireEvent.change(screen.getByTestId('md-editor'), { target: { value: 'Some **markdown**' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }))

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Write docs', description: 'Some **markdown**' }),
    )
  })

  it('still shows "Title is required" for an empty title, unaffected by the mock', () => {
    render(
      <CreateTaskModal tags={[]} onCreated={() => {}} onClose={() => {}} onTagCreated={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }))

    expect(screen.getByText('Title is required')).toBeInTheDocument()
    expect(createTask).not.toHaveBeenCalled()
  })

  it('does not close on Escape while focus is inside the title field', () => {
    const onClose = vi.fn()
    render(
      <CreateTaskModal tags={[]} onCreated={() => {}} onClose={onClose} onTagCreated={() => {}} />,
    )
    // Title input is auto-focused on mount (useFocusTrap).
    expect(screen.getByPlaceholderText('Task title')).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape when focus is not inside a text input', () => {
    const onClose = vi.fn()
    render(
      <CreateTaskModal tags={[]} onCreated={() => {}} onClose={onClose} onTagCreated={() => {}} />,
    )
    screen.getByRole('button', { name: 'Cancel' }).focus()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
  })
})
