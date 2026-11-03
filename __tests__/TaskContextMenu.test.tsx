// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TaskContextMenu from '../components/TaskContextMenu'
import { quickDueDate } from '../lib/dates'

function renderMenu(overrides: Partial<Parameters<typeof TaskContextMenu>[0]> = {}) {
  const handlers = {
    onComplete: vi.fn(),
    onReopen: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  }
  render(<TaskContextMenu x={0} y={0} tab="active" {...handlers} {...overrides} />)
  return handlers
}

describe('TaskContextMenu', () => {
  afterEach(() => cleanup())

  it('sets quick due dates on an active task, and clears one only when set', () => {
    const onSetDueDate = vi.fn()
    renderMenu({ tab: 'active', onSetDueDate })
    expect(screen.queryByRole('menuitem', { name: 'Clear due date' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Due tomorrow' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Due next Monday' }))
    expect(onSetDueDate.mock.calls).toEqual([
      [quickDueDate('tomorrow')],
      [quickDueDate('next-monday')],
    ])
    cleanup()

    renderMenu({ tab: 'active', onSetDueDate, hasDueDate: true })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear due date' }))
    expect(onSetDueDate).toHaveBeenLastCalledWith(null)
  })

  it('offers no due dates outside the active tab', () => {
    renderMenu({ tab: 'done', onSetDueDate: vi.fn() })
    expect(screen.queryByRole('menuitem', { name: 'Due tomorrow' })).not.toBeInTheDocument()
  })

  it('exposes role="menu" with menuitem actions', () => {
    renderMenu({ tab: 'active' })
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Mark as Complete' })).toBeInTheDocument()
  })

  it('shows Mark as Complete and Archive for the active tab, not Reopen/Unarchive', () => {
    renderMenu({ tab: 'active' })
    expect(screen.getByRole('menuitem', { name: 'Mark as Complete' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Reopen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Unarchive' })).not.toBeInTheDocument()
  })

  it('shows Reopen and Archive for the done tab, not Mark as Complete/Unarchive', () => {
    renderMenu({ tab: 'done' })
    expect(screen.getByRole('menuitem', { name: 'Reopen' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Mark as Complete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Unarchive' })).not.toBeInTheDocument()
  })

  it('shows only Unarchive for the archived tab', () => {
    renderMenu({ tab: 'archived' })
    expect(screen.getByRole('menuitem', { name: 'Unarchive' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Mark as Complete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Reopen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).not.toBeInTheDocument()
  })

  it('calls the matching handler when an action is clicked', () => {
    const handlers = renderMenu({ tab: 'active' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark as Complete' }))
    expect(handlers.onComplete).toHaveBeenCalledTimes(1)

    cleanup()
    const handlers2 = renderMenu({ tab: 'active' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect(handlers2.onArchive).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', () => {
    const handlers = renderMenu()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(handlers.onClose).toHaveBeenCalledTimes(1)
  })

  it('requires a second click to confirm delete', () => {
    const handlers = renderMenu()
    const deleteButton = screen.getByRole('menuitem', { name: 'Delete' })
    fireEvent.click(deleteButton)
    expect(handlers.onDelete).not.toHaveBeenCalled()

    const confirmButton = screen.getByRole('menuitem', { name: 'Confirm Delete?' })
    fireEvent.click(confirmButton)
    expect(handlers.onDelete).toHaveBeenCalledTimes(1)
  })

  it('focuses the first menu item on mount', () => {
    renderMenu({ tab: 'active' })
    expect(screen.getByRole('menuitem', { name: 'Mark as Complete' })).toHaveFocus()
  })

  it('moves focus between items with ArrowDown/ArrowUp, wrapping at both ends', () => {
    renderMenu({ tab: 'active' })
    const first = screen.getByRole('menuitem', { name: 'Mark as Complete' })
    const second = screen.getByRole('menuitem', { name: 'Archive' })
    const last = screen.getByRole('menuitem', { name: 'Delete' })
    expect(first).toHaveFocus()

    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(second).toHaveFocus()

    fireEvent.keyDown(document, { key: 'ArrowUp' })
    expect(first).toHaveFocus()

    fireEvent.keyDown(document, { key: 'ArrowUp' })
    expect(last).toHaveFocus()

    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(first).toHaveFocus()
  })
})
