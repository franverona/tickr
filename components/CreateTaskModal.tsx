'use client'

import { useState, useRef, useEffect } from 'react'
import { createTask } from '@/app/actions'
import type { Tag, Task } from '@/lib/types'
import TagSelector from './TagSelector'
import { MDEditor } from './MdEditor'

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
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [dueDate, setDueDate] = useState('')
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-zinc-600 bg-zinc-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-700 px-5 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-100 uppercase">New Task</h2>
          <button
            onClick={onClose}
            className="text-xl leading-none text-zinc-400 transition-colors hover:text-zinc-100"
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
                className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-3 py-2 text-base text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-400 focus:outline-none"
              />
              {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
            </div>

            <div>
              <label className="mb-2 block text-xs tracking-wide text-zinc-400 uppercase">
                Tags
              </label>
              <TagSelector
                tags={tags}
                selected={selectedTags}
                onChange={setSelectedTags}
                onTagCreated={onTagCreated}
              />
            </div>

            <div>
              <label className="mb-2 block text-xs tracking-wide text-zinc-400 uppercase">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="rounded border border-zinc-600 bg-zinc-700 px-2 py-1.5 text-sm text-zinc-100 [color-scheme:dark] focus:border-zinc-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs tracking-wide text-zinc-400 uppercase">
                Description
              </label>
              <div data-color-mode="dark">
                <MDEditor
                  value={description}
                  onChange={(val) => setDescription(val || '')}
                  height={200}
                  preview="edit"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-zinc-700 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-zinc-700 px-4 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {isPending ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
