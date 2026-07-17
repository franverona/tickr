// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ImportModal from '../components/ImportModal'
import type { ImportedTask } from '../lib/import'

const { processImportZip } = vi.hoisted(() => ({ processImportZip: vi.fn() }))
vi.mock('@/lib/import', () => ({ processImportZip }))

const { importTasks } = vi.hoisted(() => ({ importTasks: vi.fn() }))
vi.mock('@/app/actions', () => ({ importTasks }))

const items: ImportedTask[] = []
const result = { imported: 0, tasks: [], tags: [] }

function makeFile() {
  return new File(['{}'], 'export.zip')
}

describe('ImportModal', () => {
  afterEach(() => {
    cleanup()
    processImportZip.mockReset()
    importTasks.mockReset()
  })

  it('renders the file name with merge mode selected by default', () => {
    render(<ImportModal file={makeFile()} onClose={() => {}} onImported={() => {}} />)
    expect(screen.getByText('export.zip')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Add to existing tasks/ })).toBeChecked()
  })

  it('disables Import in override mode until "DELETE" is typed exactly', () => {
    render(<ImportModal file={makeFile()} onClose={() => {}} onImported={() => {}} />)
    fireEvent.click(screen.getByRole('radio', { name: /Replace all existing data/ }))
    const importButton = screen.getByRole('button', { name: 'Replace & Import' })
    expect(importButton).toBeDisabled()

    const confirmInput = screen.getByPlaceholderText('DELETE')
    fireEvent.change(confirmInput, { target: { value: 'delete' } })
    expect(importButton).toBeDisabled()

    fireEvent.change(confirmInput, { target: { value: 'DELETE' } })
    expect(importButton).not.toBeDisabled()
  })

  it('merge flow calls processImportZip then importTasks(items, false) and reports the result', async () => {
    const file = makeFile()
    processImportZip.mockResolvedValueOnce(items)
    importTasks.mockResolvedValueOnce(result)
    const onImported = vi.fn()

    render(<ImportModal file={file} onClose={() => {}} onImported={onImported} />)
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    await vi.waitFor(() => expect(onImported).toHaveBeenCalledWith(result))
    expect(processImportZip).toHaveBeenCalledWith(file)
    expect(importTasks).toHaveBeenCalledWith(items, false)
  })

  it('override flow calls importTasks(items, true) after typing DELETE', async () => {
    processImportZip.mockResolvedValueOnce(items)
    importTasks.mockResolvedValueOnce(result)
    const onImported = vi.fn()

    render(<ImportModal file={makeFile()} onClose={() => {}} onImported={onImported} />)
    fireEvent.click(screen.getByRole('radio', { name: /Replace all existing data/ }))
    fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Replace & Import' }))

    await vi.waitFor(() => expect(onImported).toHaveBeenCalledWith(result))
    expect(importTasks).toHaveBeenCalledWith(items, true)
  })

  it('shows an inline error and re-enables Import when the import fails', async () => {
    processImportZip.mockResolvedValueOnce(items)
    importTasks.mockRejectedValueOnce(new Error('boom'))

    render(<ImportModal file={makeFile()} onClose={() => {}} onImported={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    await screen.findByText('Import failed. Check the file and try again.')
    expect(screen.getByRole('button', { name: 'Import' })).not.toBeDisabled()
  })

  it('calls onClose when Escape is pressed and not pending', () => {
    const onClose = vi.fn()
    render(<ImportModal file={makeFile()} onClose={onClose} onImported={() => {}} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
