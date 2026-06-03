'use client'

import { useState, useRef, useEffect } from 'react'
import type { Tag, Task } from '@/lib/types'
import { updateTask, deleteTask } from '@/app/actions'
import TagSelector from './TagSelector'
import { MDEditor, MDPreview, makeImageHandlers } from './MdEditor'

interface TaskDetailProps {
  task: Task
  tags: Tag[]
  onUpdate: (task: Task) => void
  onDelete: (id: string) => void
  onClose: () => void
  onTagCreated: (tag: Tag) => void
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function TaskDetail({
  task,
  tags,
  onUpdate,
  onDelete,
  onClose,
  onTagCreated,
}: TaskDetailProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState(task.description)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const imageHandlers = makeImageHandlers(setDescriptionDraft)

  // task.id changes are handled by key={task.id} in the parent, which remounts
  // this component entirely — no manual state reset needed here.

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }
  }, [isEditingTitle])

  async function saveTitle() {
    const trimmed = titleDraft.trim()
    if (!trimmed) {
      setTitleDraft(task.title)
      setIsEditingTitle(false)
      return
    }
    if (trimmed === task.title) {
      setIsEditingTitle(false)
      return
    }
    const updated = await updateTask(task.id, { title: trimmed })
    onUpdate(updated)
    setIsEditingTitle(false)
  }

  async function saveTags(tags: string[]) {
    const updated = await updateTask(task.id, { tags })
    onUpdate(updated)
  }

  async function saveDueDate(dueDate: string | null) {
    const updated = await updateTask(task.id, { dueDate })
    onUpdate(updated)
  }

  async function saveDescription() {
    setIsSaving(true)
    try {
      const updated = await updateTask(task.id, {
        description: descriptionDraft,
      })
      onUpdate(updated)
      setIsEditingDescription(false)
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleComplete() {
    const updated = await updateTask(task.id, { completed: !task.completed })
    onUpdate(updated)
  }

  async function toggleArchived() {
    const updated = await updateTask(task.id, { archived: !task.archived })
    onUpdate(updated)
  }

  async function handleDelete() {
    await deleteTask(task.id)
    onDelete(task.id)
  }

  const today = new Date().toISOString().split('T')[0]
  const isOverdue = task.dueDate && task.dueDate < today && !task.completed

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-zinc-700 px-4">
        <span className="text-xs tracking-wide text-zinc-400 uppercase">Detail</span>
        <button
          onClick={onClose}
          className="text-xl leading-none text-zinc-400 transition-colors hover:text-zinc-100"
        >
          ×
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {/* Title */}
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle()
              if (e.key === 'Escape') {
                setTitleDraft(task.title)
                setIsEditingTitle(false)
              }
            }}
            className="w-full rounded-md border border-zinc-500 bg-zinc-700 px-2 py-1 text-lg font-semibold text-zinc-100 focus:border-zinc-300 focus:outline-none"
          />
        ) : (
          <h2
            onClick={() => setIsEditingTitle(true)}
            className={`-mx-2 cursor-text rounded-md px-2 py-1 text-lg font-semibold transition-colors hover:bg-zinc-700/50 ${
              task.completed ? 'text-zinc-400 line-through' : 'text-zinc-100'
            }`}
          >
            {task.title}
          </h2>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {task.archived ? (
            <button
              onClick={toggleArchived}
              className="flex-1 rounded-md bg-zinc-600 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-500"
            >
              Unarchive
            </button>
          ) : (
            <>
              <button
                onClick={toggleComplete}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  task.completed
                    ? 'bg-zinc-600 text-zinc-200 hover:bg-zinc-500'
                    : 'bg-emerald-800 text-emerald-100 hover:bg-emerald-700'
                }`}
              >
                {task.completed ? 'Reopen' : 'Mark Complete'}
              </button>
              <button
                onClick={toggleArchived}
                className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-600 hover:text-zinc-100"
                title="Archive task"
              >
                Archive
              </button>
            </>
          )}

          {showDeleteConfirm ? (
            <div className="flex gap-1.5">
              <button
                onClick={handleDelete}
                className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-red-100 transition-colors hover:bg-red-600"
              >
                Confirm Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-600 hover:text-red-400"
            >
              Delete
            </button>
          )}
        </div>

        <div className="border-t border-zinc-700/70" />

        {/* Tags */}
        <div>
          <label className="mb-2 block text-xs tracking-wide text-zinc-400 uppercase">Tags</label>
          <TagSelector
            tags={tags}
            selected={task.tags}
            onChange={saveTags}
            onTagCreated={onTagCreated}
          />
        </div>

        {/* Due date */}
        <div>
          <label className="mb-2 block text-xs tracking-wide text-zinc-400 uppercase">
            Due Date
          </label>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={task.dueDate || ''}
              onChange={(e) => saveDueDate(e.target.value || null)}
              className="rounded border border-zinc-600 bg-zinc-700 px-2 py-1.5 text-sm text-zinc-100 [color-scheme:dark] focus:border-zinc-400 focus:outline-none"
            />
            {task.dueDate && (
              <button
                onClick={() => saveDueDate(null)}
                className="text-xs text-zinc-400 transition-colors hover:text-zinc-200"
              >
                Clear
              </button>
            )}
            {isOverdue && (
              <span className="text-xs font-medium text-red-400">
                Overdue — {formatDate(task.dueDate!)}
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-zinc-700/70" />

        {/* Description */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs tracking-wide text-zinc-400 uppercase">Description</label>
            {!isEditingDescription && (
              <button
                onClick={() => {
                  setDescriptionDraft(task.description)
                  setIsEditingDescription(true)
                }}
                className="text-xs text-zinc-400 transition-colors hover:text-zinc-200"
              >
                Edit
              </button>
            )}
          </div>

          {isEditingDescription ? (
            <div>
              <div data-color-mode="dark">
                <MDEditor
                  value={descriptionDraft}
                  onChange={(val) => setDescriptionDraft(val || '')}
                  height={320}
                  preview="live"
                  textareaProps={imageHandlers}
                />
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={saveDescription}
                  disabled={isSaving}
                  className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setDescriptionDraft(task.description)
                    setIsEditingDescription(false)
                  }}
                  className="rounded-md bg-zinc-700 px-3 py-1 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={(e) => {
                const anchor = (e.target as HTMLElement).closest('a')
                if (anchor) {
                  e.preventDefault()
                  window.open(anchor.getAttribute('href') ?? '', '_blank', 'noopener,noreferrer')
                  return
                }
                setDescriptionDraft(task.description)
                setIsEditingDescription(true)
              }}
              className="-mx-1 min-h-[60px] cursor-text rounded-md px-1"
            >
              {task.description ? (
                <div data-color-mode="dark">
                  <MDPreview source={task.description} style={{ background: 'transparent' }} />
                </div>
              ) : (
                <p className="py-1 text-sm text-zinc-500 italic">Click to add a description…</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
