'use client'

import { useState, useRef, useEffect } from 'react'
import { createTask } from '@/app/actions'
import type { Tag, Task } from '@/lib/types'
import TagSelector from './TagSelector'
import { MDEditor, MarkdownLink } from './MdEditor'

interface CreateTaskModalProps {
  tags: Tag[]
  onCreated: (task: Task) => void
  onClose: () => void
  onTagCreated: (tag: Tag) => void
}

export default function CreateTaskModal({
  tags,
  onCreated,
  onClose,
  onTagCreated,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    setIsPending(true)
    try {
      const task = await createTask({
        title: title.trim(),
        description,
        tags: selectedTags,
        dueDate: dueDate || null,
      })
      onCreated(task)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="border-surface-600 bg-surface-800 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border shadow-2xl">
        <div className="border-surface-700 flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-surface-100 text-sm font-semibold tracking-wide uppercase">
            New Task
          </h2>
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-surface-100 text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div>
              <input
                ref={titleRef}
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  setError('')
                }}
                placeholder="Task title"
                className="border-surface-600 bg-surface-700 text-surface-100 placeholder:text-surface-500 focus:border-surface-400 w-full rounded-lg border px-3 py-2 text-base focus:outline-none"
              />
              {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
            </div>

            <div>
              <label className="text-surface-400 mb-2 block text-xs tracking-wide uppercase">
                Tags
              </label>
              <TagSelector
                tags={tags}
                selected={selectedTags}
                onChange={setSelectedTags}
                onTagCreated={onTagCreated}
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="text-surface-400 w-16 shrink-0 text-xs tracking-wide uppercase">
                Due date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="border-surface-600 bg-surface-700 text-surface-100 focus:border-surface-400 rounded-md border px-2 py-1 text-sm focus:outline-none"
              />
            </div>

            <div>
              <label className="text-surface-400 mb-2 block text-xs tracking-wide uppercase">
                Description
              </label>
              <div data-color-mode="dark">
                <MDEditor
                  value={description}
                  onChange={(val) => setDescription(val || '')}
                  height={200}
                  preview="edit"
                  previewOptions={{
                    components: { a: MarkdownLink },
                  }}
                />
              </div>
            </div>
          </div>

          <div className="border-surface-700 flex justify-end gap-2 border-t px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="bg-surface-700 text-surface-200 hover:bg-surface-600 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="bg-primary-600 text-surface-900 hover:bg-primary-500 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isPending ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
