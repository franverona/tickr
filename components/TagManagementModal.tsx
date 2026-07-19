'use client'

import { useId, useState } from 'react'
import { updateTag, deleteTag } from '@/app/actions'
import { COLOR_PALETTE } from '@/lib/constants'
import type { Tag } from '@/lib/types'
import TagBadge from './TagBadge'
import { useFocusTrap } from '@/lib/useFocusTrap'

interface TagManagementModalProps {
  tags: Tag[]
  onClose: () => void
  onTagUpdated: (tag: Tag) => void
  onTagDeleted: (id: string) => void
}

export default function TagManagementModal({
  tags,
  onClose,
  onTagUpdated,
  onTagDeleted,
}: TagManagementModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editColor, setEditColor] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')
  const modalRef = useFocusTrap<HTMLDivElement>()
  const headingId = useId()

  function startEdit(tag: Tag) {
    setEditingId(tag.id)
    setDeletingId(null)
    setEditLabel(tag.label)
    setEditColor(tag.color)
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setError('')
  }

  async function handleSave(id: string) {
    const label = editLabel.trim()
    if (!label) {
      setError('Name required')
      return
    }
    setIsSaving(true)
    try {
      const updated = await updateTag(id, { label, color: editColor })
      onTagUpdated(updated)
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tag')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setIsDeleting(true)
    try {
      await deleteTag(id)
      onTagDeleted(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tag')
      setIsDeleting(false)
    }
  }

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
        className="border-surface-700 bg-surface-800 flex max-h-[80vh] w-full max-w-110 flex-col rounded-xl border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-surface-700 flex flex-shrink-0 items-center justify-between border-b px-4 py-3">
          <h2 id={headingId} className="text-surface-100 text-sm font-semibold">
            Manage Tags
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-surface-400 hover:text-surface-100 text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {tags.length === 0 && (
            <p className="text-surface-500 py-4 text-center text-sm">No tags yet</p>
          )}

          {tags.map((tag) => (
            <div
              key={tag.id}
              className="border-surface-700 bg-surface-700/30 rounded-lg border p-2.5"
            >
              {editingId === tag.id ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-surface-400 w-10 shrink-0 text-[11px]">Color</span>
                    <div className="flex flex-wrap gap-1.5">
                      {COLOR_PALETTE.map((c) => (
                        <button
                          key={c.name}
                          type="button"
                          title={c.name}
                          onClick={() => setEditColor(c.classes)}
                          className={`h-4 w-4 rounded-full ${c.dot} transition-transform ${
                            editColor === c.classes
                              ? 'ring-offset-surface-700 scale-125 ring-2 ring-white ring-offset-1'
                              : 'opacity-70 hover:scale-110 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-surface-400 w-10 shrink-0 text-[11px]">Name</span>
                    <input
                      autoFocus
                      type="text"
                      value={editLabel}
                      onChange={(e) => {
                        setEditLabel(e.target.value)
                        setError('')
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleSave(tag.id)
                        }
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      maxLength={40}
                      className="border-surface-600 bg-surface-700 text-surface-100 placeholder:text-surface-500 focus:border-surface-400 min-w-0 flex-1 rounded border px-2 py-1 text-xs focus:outline-none"
                    />
                    <button
                      onClick={() => handleSave(tag.id)}
                      disabled={isSaving}
                      className="bg-accent-600 hover:bg-accent-500 shrink-0 rounded px-2.5 py-1 text-xs font-medium text-white transition-colors disabled:opacity-50"
                    >
                      {isSaving ? '…' : 'Save'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-surface-400 hover:text-surface-200 shrink-0 text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  </div>

                  {editLabel.trim() && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-surface-400 w-10 shrink-0 text-[11px]">Preview</span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${editColor}`}
                      >
                        {editLabel.trim()}
                      </span>
                    </div>
                  )}

                  {error && <p className="text-xs text-red-400">{error}</p>}
                </div>
              ) : deletingId === tag.id ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-surface-300 flex-1 text-xs">
                      Delete <TagBadge tag={tag} size="sm" />? This will remove it from all tasks.
                    </p>
                    <button
                      onClick={() => handleDelete(tag.id)}
                      disabled={isDeleting}
                      className="shrink-0 rounded bg-red-700 px-2.5 py-1 text-xs font-medium text-red-100 transition-colors hover:bg-red-600 disabled:opacity-50"
                    >
                      {isDeleting ? '…' : 'Delete'}
                    </button>
                    <button
                      onClick={() => {
                        setDeletingId(null)
                        setError('')
                      }}
                      className="text-surface-400 hover:text-surface-200 shrink-0 text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  {error && <p className="text-xs text-red-400">{error}</p>}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <TagBadge tag={tag} />
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => startEdit(tag)}
                      title="Edit tag"
                      className="text-surface-400 hover:bg-surface-600 hover:text-surface-100 rounded p-1.5 transition-colors"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => {
                        setDeletingId(tag.id)
                        setEditingId(null)
                        setError('')
                      }}
                      title="Delete tag"
                      className="text-surface-400 hover:bg-surface-600 rounded p-1.5 transition-colors hover:text-red-400"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
