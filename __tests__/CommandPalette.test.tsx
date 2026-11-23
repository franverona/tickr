// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CommandPalette from '../components/CommandPalette'

function renderPalette(overrides: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onNewTask: vi.fn(),
    onOpenSearch: vi.fn(),
    onOpenTags: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    onOpenShortcuts: vi.fn(),
    onSelectTask: vi.fn(),
    onToggleSortByDue: vi.fn(),
    onCopyLast7Days: vi.fn(),
    onGoToTab: vi.fn(),
  }
  render(<CommandPalette tasks={[]} sortByDue={false} {...handlers} {...overrides} />)
  return handlers
}

describe('CommandPalette', () => {
  afterEach(() => cleanup())

  it('runs the tab, sort and copy commands, then closes', () => {
    const h = renderPalette()
    fireEvent.click(screen.getByRole('button', { name: 'Go to Done' }))
    expect(h.onGoToTab).toHaveBeenCalledWith('done')
    fireEvent.click(screen.getByRole('button', { name: 'Sort Active by due date' }))
    expect(h.onToggleSortByDue).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Copy last 7 days' }))
    expect(h.onCopyLast7Days).toHaveBeenCalled()
    expect(h.onClose).toHaveBeenCalledTimes(3)
  })

  it('labels the sort command by the current sort, and filters by query', () => {
    renderPalette({ sortByDue: true })
    expect(screen.getByRole('button', { name: 'Sort Active manually' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'archived' } })
    expect(screen.getByRole('button', { name: 'Go to Archived' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Go to Done' })).not.toBeInTheDocument()
  })
})
