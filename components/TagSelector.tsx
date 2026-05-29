'use client'

import { useState, useRef, useEffect } from 'react'
import { createTag } from '@/app/actions'
import { COLOR_PALETTE } from '@/lib/constants'
import type { Tag } from '@/lib/types'

interface TagSelectorProps {
  tags: Tag[]
  selected: string[]
  onChange: (tags: string[]) => void
  onTagCreated: (tag: Tag) => void
}

export default function TagSelector({ tags, selected, onChange, onTagCreated }: TagSelectorProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState<string>(COLOR_PALETTE[0].classes)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isCreating) inputRef.current?.focus()
  }, [isCreating])

  function toggle(tagId: string) {
    onChange(selected.includes(tagId) ? selected.filter((t) => t !== tagId) : [...selected, tagId])
  }

  function cancelCreate() {
    setIsCreating(false)
    setNewLabel('')
    setError('')
  }

  async function handleCreate() {
    const label = newLabel.trim()
    if (!label) {
      setError('Name required')
      return
    }
    setIsSubmitting(true)
    try {
      const tag = await createTag({ label, color: newColor })
      onTagCreated(tag)
      onChange([...selected, tag.id])
      cancelCreate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tag')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => {
          const isSelected = selected.includes(tag.id)
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              className={`inline-flex cursor-pointer items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-all ${
                isSelected
                  ? tag.color
                  : 'border-zinc-500 bg-transparent text-zinc-300 hover:border-zinc-300 hover:text-zinc-100'
              }`}
            >
              {tag.label}
            </button>
          )
        })}

        {!isCreating && (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center rounded-full border border-dashed border-zinc-500 px-2 py-0.5 text-xs text-zinc-400 transition-all hover:border-zinc-300 hover:text-zinc-200"
          >
            + New tag
          </button>
        )}
      </div>

      {isCreating && (
        <div className="mt-2 space-y-2 rounded-lg border border-zinc-600/50 bg-zinc-700/50 p-2">
          {/* Color swatches */}
          <div className="flex items-center gap-1.5">
            <span className="w-10 shrink-0 text-[11px] text-zinc-400">Color</span>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  title={c.name}
                  onClick={() => setNewColor(c.classes)}
                  className={`h-4 w-4 rounded-full ${c.dot} transition-transform ${
                    newColor === c.classes
                      ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-zinc-700'
                      : 'opacity-70 hover:scale-110 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Label + submit */}
          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-[11px] text-zinc-400">Name</span>
            <input
              ref={inputRef}
              type="text"
              value={newLabel}
              onChange={(e) => {
                setNewLabel(e.target.value)
                setError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleCreate()
                }
                if (e.key === 'Escape') cancelCreate()
              }}
              placeholder="e.g. needs-clarification"
              maxLength={40}
              className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-700 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={isSubmitting}
              className="shrink-0 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {isSubmitting ? '…' : 'Add'}
            </button>
            <button
              type="button"
              onClick={cancelCreate}
              className="shrink-0 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Preview */}
          {newLabel.trim() && (
            <div className="flex items-center gap-1.5">
              <span className="w-10 shrink-0 text-[11px] text-zinc-400">Preview</span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${newColor}`}
              >
                {newLabel.trim()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
