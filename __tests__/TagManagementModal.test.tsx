// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TagManagementModal from '../components/TagManagementModal'
import type { Tag } from '../lib/types'

const { updateTag, deleteTag } = vi.hoisted(() => ({
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}))
vi.mock('@/app/actions', () => ({ updateTag, deleteTag }))

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 'tag-1',
    label: 'bug',
    color: 'bg-red-600 text-red-100 border-red-500',
    ...overrides,
  }
}

describe('TagManagementModal', () => {
  afterEach(() => {
    cleanup()
    updateTag.mockReset()
    deleteTag.mockReset()
  })

  it('shows "No tags yet" when there are no tags', () => {
    render(
      <TagManagementModal
        tags={[]}
        onClose={() => {}}
        onTagUpdated={() => {}}
        onTagDeleted={() => {}}
      />,
    )
    expect(screen.getByText('No tags yet')).toBeInTheDocument()
  })

  it('renders a badge for each existing tag', () => {
    render(
      <TagManagementModal
        tags={[makeTag()]}
        onClose={() => {}}
        onTagUpdated={() => {}}
        onTagDeleted={() => {}}
      />,
    )
    expect(screen.getByText('bug')).toBeInTheDocument()
  })

  it('reveals the edit form pre-filled with the current label', () => {
    render(
      <TagManagementModal
        tags={[makeTag()]}
        onClose={() => {}}
        onTagUpdated={() => {}}
        onTagDeleted={() => {}}
      />,
    )
    fireEvent.click(screen.getByTitle('Edit tag'))
    expect(screen.getByDisplayValue('bug')).toBeInTheDocument()
  })

  it('saves an edited label and reports it via onTagUpdated', async () => {
    const updated = makeTag({ label: 'urgent-bug' })
    updateTag.mockResolvedValueOnce(updated)
    const onTagUpdated = vi.fn()

    render(
      <TagManagementModal
        tags={[makeTag()]}
        onClose={() => {}}
        onTagUpdated={onTagUpdated}
        onTagDeleted={() => {}}
      />,
    )
    fireEvent.click(screen.getByTitle('Edit tag'))
    fireEvent.change(screen.getByDisplayValue('bug'), { target: { value: 'urgent-bug' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => expect(onTagUpdated).toHaveBeenCalledWith(updated))
    expect(screen.queryByDisplayValue('urgent-bug')).not.toBeInTheDocument()
  })

  it('shows a validation error and does not call updateTag when the label is emptied', () => {
    render(
      <TagManagementModal
        tags={[makeTag()]}
        onClose={() => {}}
        onTagUpdated={() => {}}
        onTagDeleted={() => {}}
      />,
    )
    fireEvent.click(screen.getByTitle('Edit tag'))
    fireEvent.change(screen.getByDisplayValue('bug'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Name required')).toBeInTheDocument()
    expect(updateTag).not.toHaveBeenCalled()
  })

  it('deletes a tag after confirmation and reports it via onTagDeleted', async () => {
    deleteTag.mockResolvedValueOnce(undefined)
    const onTagDeleted = vi.fn()

    render(
      <TagManagementModal
        tags={[makeTag()]}
        onClose={() => {}}
        onTagUpdated={() => {}}
        onTagDeleted={onTagDeleted}
      />,
    )
    fireEvent.click(screen.getByTitle('Delete tag'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await vi.waitFor(() => expect(onTagDeleted).toHaveBeenCalledWith('tag-1'))
  })
})
