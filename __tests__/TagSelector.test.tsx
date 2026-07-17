// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TagSelector from '../components/TagSelector'
import type { Tag } from '../lib/types'

const { createTag } = vi.hoisted(() => ({ createTag: vi.fn() }))
vi.mock('@/app/actions', () => ({ createTag }))

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 'tag-1',
    label: 'bug',
    color: 'bg-red-600 text-red-100 border-red-500',
    ...overrides,
  }
}

describe('TagSelector', () => {
  afterEach(() => {
    cleanup()
    createTag.mockReset()
  })

  it('renders a button for each existing tag', () => {
    render(
      <TagSelector tags={[makeTag()]} selected={[]} onChange={() => {}} onTagCreated={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'bug' })).toBeInTheDocument()
  })

  it('calls onChange with the tag added when an unselected tag is clicked', () => {
    const onChange = vi.fn()
    render(
      <TagSelector tags={[makeTag()]} selected={[]} onChange={onChange} onTagCreated={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'bug' }))
    expect(onChange).toHaveBeenCalledWith(['tag-1'])
  })

  it('calls onChange with the tag removed when a selected tag is clicked', () => {
    const onChange = vi.fn()
    render(
      <TagSelector
        tags={[makeTag()]}
        selected={['tag-1']}
        onChange={onChange}
        onTagCreated={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'bug' }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('reveals the creation form when "+ New tag" is clicked', () => {
    render(<TagSelector tags={[]} selected={[]} onChange={() => {}} onTagCreated={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New tag' }))
    expect(screen.getByPlaceholderText('e.g. needs-clarification')).toBeInTheDocument()
  })

  it('creates a tag and reports it via onTagCreated and onChange', async () => {
    const newTag = makeTag({ id: 'tag-2', label: 'urgent' })
    createTag.mockResolvedValueOnce(newTag)
    const onChange = vi.fn()
    const onTagCreated = vi.fn()

    render(<TagSelector tags={[]} selected={[]} onChange={onChange} onTagCreated={onTagCreated} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New tag' }))
    fireEvent.change(screen.getByPlaceholderText('e.g. needs-clarification'), {
      target: { value: 'urgent' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await vi.waitFor(() => expect(onTagCreated).toHaveBeenCalledWith(newTag))
    expect(onChange).toHaveBeenCalledWith(['tag-2'])
    expect(screen.queryByPlaceholderText('e.g. needs-clarification')).not.toBeInTheDocument()
  })

  it('shows a validation error and does not call createTag when the label is empty', () => {
    render(<TagSelector tags={[]} selected={[]} onChange={() => {}} onTagCreated={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New tag' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('Name required')).toBeInTheDocument()
    expect(createTag).not.toHaveBeenCalled()
  })
})
