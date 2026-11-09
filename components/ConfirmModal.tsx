'use client'

import { useId } from 'react'
import { useFocusTrap } from '@/lib/useFocusTrap'

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const modalRef = useFocusTrap<HTMLDivElement>()
  const headingId = useId()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="border-surface-700 bg-surface-800 w-full max-w-90 rounded-xl border p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Keeps page-level shortcuts (Esc closing the panel, N, /…) from firing behind the modal
          e.stopPropagation()
          if (e.key === 'Escape') onCancel()
        }}
      >
        <h2 id={headingId} className="text-surface-100 text-sm font-semibold">
          {title}
        </h2>
        <p className="text-surface-300 mt-2 text-sm">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="bg-surface-700 text-surface-200 hover:bg-surface-600 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-red-100 transition-colors hover:bg-red-600"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
