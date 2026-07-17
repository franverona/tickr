// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TaskContextMenu from '../components/TaskContextMenu'

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

  it('shows Mark as Complete and Archive for the active tab, not Reopen/Unarchive', () => {
    renderMenu({ tab: 'active' })
    expect(screen.getByRole('button', { name: 'Mark as Complete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reopen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unarchive' })).not.toBeInTheDocument()
  })

  it('shows Reopen and Archive for the done tab, not Mark as Complete/Unarchive', () => {
    renderMenu({ tab: 'done' })
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as Complete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unarchive' })).not.toBeInTheDocument()
  })

  it('shows only Unarchive for the archived tab', () => {
    renderMenu({ tab: 'archived' })
    expect(screen.getByRole('button', { name: 'Unarchive' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as Complete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reopen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument()
  })

  it('calls the matching handler when an action is clicked', () => {
    const handlers = renderMenu({ tab: 'active' })
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Complete' }))
    expect(handlers.onComplete).toHaveBeenCalledTimes(1)

    cleanup()
    const handlers2 = renderMenu({ tab: 'active' })
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(handlers2.onArchive).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', () => {
    const handlers = renderMenu()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(handlers.onClose).toHaveBeenCalledTimes(1)
  })

  it('requires a second click to confirm delete', () => {
    const handlers = renderMenu()
    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(deleteButton)
    expect(handlers.onDelete).not.toHaveBeenCalled()

    const confirmButton = screen.getByRole('button', { name: 'Confirm Delete?' })
    fireEvent.click(confirmButton)
    expect(handlers.onDelete).toHaveBeenCalledTimes(1)
  })
})
