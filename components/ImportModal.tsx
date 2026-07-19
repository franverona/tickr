'use client'

import { useEffect, useId, useState } from 'react'
import { importTasks } from '@/app/actions'
import { processImportZip } from '@/lib/import'
import type { Tag, Task } from '@/lib/types'
import { useFocusTrap } from '@/lib/useFocusTrap'

const CONFIRM_PHRASE = 'DELETE'

interface ImportModalProps {
  file: File
  onClose: () => void
  onImported: (result: { imported: number; tasks: Task[]; tags: Tag[] }) => void
}

export default function ImportModal({ file, onClose, onImported }: ImportModalProps) {
  const [mode, setMode] = useState<'merge' | 'override'>('merge')
  const [confirmText, setConfirmText] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState('')
  const modalRef = useFocusTrap<HTMLDivElement>()
  const headingId = useId()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, isPending])

  const canConfirm = mode === 'merge' || confirmText.trim() === CONFIRM_PHRASE

  async function handleConfirm() {
    if (!canConfirm) return
    setIsPending(true)
    setError('')
    try {
      const items = await processImportZip(file)
      const result = await importTasks(items, mode === 'override')
      onImported(result)
    } catch {
      setError('Import failed. Check the file and try again.')
      setIsPending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose()
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="border-surface-600 bg-surface-800 flex w-full max-w-md flex-col rounded-xl border shadow-2xl"
      >
        <div className="border-surface-700 flex items-center justify-between border-b px-5 py-3">
          <h2
            id={headingId}
            className="text-surface-100 text-sm font-semibold tracking-wide uppercase"
          >
            Import Tasks
          </h2>
          <button
            onClick={onClose}
            disabled={isPending}
            aria-label="Close"
            className="text-surface-400 hover:text-surface-100 text-xl leading-none transition-colors disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-surface-400 text-sm">
            Importing <span className="text-surface-200 font-medium">{file.name}</span>
          </p>

          <div className="space-y-2">
            <label className="border-surface-600 hover:border-surface-400 flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5">
              <input
                type="radio"
                checked={mode === 'merge'}
                onChange={() => {
                  setMode('merge')
                  setConfirmText('')
                  setError('')
                }}
                className="mt-0.5"
              />
              <span>
                <span className="text-surface-100 block text-sm font-medium">
                  Add to existing tasks
                </span>
                <span className="text-surface-500 block text-xs">
                  Imported tasks are appended to your current tasks.
                </span>
              </span>
            </label>

            <label className="border-surface-600 flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 hover:border-red-500/60">
              <input
                type="radio"
                checked={mode === 'override'}
                onChange={() => {
                  setMode('override')
                  setError('')
                }}
                className="mt-0.5"
              />
              <span>
                <span className="text-surface-100 block text-sm font-medium">
                  Replace all existing data
                </span>
                <span className="text-surface-500 block text-xs">
                  Deletes every current task and tag before importing.
                </span>
              </span>
            </label>
          </div>

          {mode === 'override' && (
            <div>
              <label className="text-surface-400 mb-1.5 block text-xs tracking-wide uppercase">
                Type {CONFIRM_PHRASE} to confirm
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_PHRASE}
                autoFocus
                className="border-surface-600 bg-surface-700 text-surface-100 placeholder:text-surface-500 w-full rounded-lg border px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
              />
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="border-surface-700 flex justify-end gap-2 border-t px-5 py-3">
          <button
            onClick={onClose}
            disabled={isPending}
            className="text-surface-300 hover:text-surface-100 rounded-lg px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || isPending}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              mode === 'override'
                ? 'bg-red-600 text-red-50 hover:bg-red-500'
                : 'bg-primary-600 text-surface-900 hover:bg-primary-500'
            }`}
          >
            {isPending ? 'Importing…' : mode === 'override' ? 'Replace & Import' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
