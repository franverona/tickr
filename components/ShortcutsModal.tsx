'use client'

import { useEffect, useId } from 'react'
import { useFocusTrap } from '@/lib/useFocusTrap'

interface ShortcutsModalProps {
  onClose: () => void
}

const SHORTCUTS: [string, string][] = [
  ['N', 'New task'],
  ['/', 'Search'],
  ['↑ / ↓', 'Move between tasks'],
  ['Home / End', 'Jump to first / last task'],
  ['Shift+F10 / Menu key', 'Open task context menu'],
  ['Drag', 'Reorder active tasks (manual sort)'],
  ['Esc', 'Close panel / menu'],
  ['?', 'Show this list'],
]

export default function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  const modalRef = useFocusTrap<HTMLDivElement>()
  const headingId = useId()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="border-surface-700 bg-surface-800 w-full max-w-90 rounded-xl border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-surface-700 flex items-center justify-between border-b px-4 py-3">
          <h2 id={headingId} className="text-surface-100 text-sm font-semibold">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-surface-400 hover:text-surface-100 text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <ul className="space-y-2 p-4">
          {SHORTCUTS.map(([key, label]) => (
            <li key={key} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-surface-300">{label}</span>
              <kbd className="border-surface-600 bg-surface-700 text-surface-200 shrink-0 rounded border px-1.5 py-0.5 font-mono text-xs">
                {key}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
