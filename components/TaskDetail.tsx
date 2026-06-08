'use client'

import { useState, useRef, useEffect } from 'react'
import type { Tag, Task } from '@/lib/types'
import { updateTask, deleteTask, linkTask, unlinkTask } from '@/app/actions'
import TagSelector from './TagSelector'
import { MDEditor, MDPreview, makeImageHandlers } from './MdEditor'
import { searchEmojis } from '@/lib/emojis'

interface TaskDetailProps {
  task: Task
  tags: Tag[]
  allTasks: Task[]
  onUpdate: (task: Task) => void
  onDelete: (id: string) => void
  onClose: () => void
  onTagCreated: (tag: Tag) => void
  onLinksChanged: (task: Task, linkedTask: Task) => void
  onSelectTask: (id: string) => void
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
  allTasks,
  onUpdate,
  onDelete,
  onClose,
  onTagCreated,
  onLinksChanged,
  onSelectTask,
}: TaskDetailProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(task.title)
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState(task.description)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved'>(
    'idle',
  )
  const [linkSearch, setLinkSearch] = useState('')
  const [isLinkSearchFocused, setIsLinkSearchFocused] = useState(false)
  const [emojiResults, setEmojiResults] = useState<ReadonlyArray<readonly [string, string]>>([])
  const [emojiIndex, setEmojiIndex] = useState(0)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedDescRef = useRef(task.description)
  const editorWrapperRef = useRef<HTMLDivElement>(null)
  const imageHandlers = makeImageHandlers(setDescriptionDraft)

  function detectEmojiQuery(textarea: HTMLTextAreaElement) {
    const cursor = textarea.selectionStart
    const before = textarea.value.slice(0, cursor)
    const match = before.match(/:([a-z0-9_+\-]*)$/)
    if (match) {
      const results = searchEmojis(match[1])
      setEmojiResults(results)
      setEmojiIndex(0)
    } else {
      setEmojiResults([])
    }
  }

  function insertEmoji(emoji: string) {
    const textarea = editorWrapperRef.current?.querySelector('textarea')
    if (!textarea) return
    const cursor = textarea.selectionStart
    const before = textarea.value.slice(0, cursor)
    const match = before.match(/:([a-z0-9_+\-]*)$/)
    if (!match) return
    const start = cursor - match[0].length
    const newValue = textarea.value.slice(0, start) + emoji + textarea.value.slice(cursor)
    setDescriptionDraft(newValue)
    setEmojiResults([])
    setTimeout(() => {
      textarea.focus()
      const pos = start + [...emoji].length
      textarea.setSelectionRange(pos, pos)
    }, 0)
  }

  const emojiTextareaProps = {
    ...imageHandlers,
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (emojiResults.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setEmojiIndex((i) => Math.min(i + 1, emojiResults.length - 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setEmojiIndex((i) => Math.max(i - 1, 0))
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          insertEmoji(emojiResults[emojiIndex][1])
          return
        }
        if (e.key === 'Escape') {
          setEmojiResults([])
          return
        }
      }
    },
    onKeyUp: (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
        detectEmojiQuery(e.currentTarget)
      }
    },
    onClick: (e: React.MouseEvent<HTMLTextAreaElement>) => {
      detectEmojiQuery(e.currentTarget)
    },
  }

  const linkedTasks = allTasks.filter((t) => task.linkedTaskIds.includes(t.id))
  const linkableTasks = allTasks
    .filter(
      (t) =>
        t.id !== task.id &&
        !task.linkedTaskIds.includes(t.id) &&
        (!linkSearch || t.title.toLowerCase().includes(linkSearch.toLowerCase())),
    )
    .slice(0, 8)

  async function handleLink(linkedTaskId: string) {
    const { task: updated, linkedTask } = await linkTask(task.id, linkedTaskId)
    onLinksChanged(updated, linkedTask)
    setLinkSearch('')
    setIsLinkSearchFocused(false)
  }

  async function handleUnlink(linkedTaskId: string) {
    const { task: updated, linkedTask } = await unlinkTask(task.id, linkedTaskId)
    onLinksChanged(updated, linkedTask)
  }

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

  useEffect(() => {
    if (!isEditingDescription) return
    if (descriptionDraft === lastSavedDescRef.current) return

    setAutoSaveStatus('pending')
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)

    autoSaveTimerRef.current = setTimeout(async () => {
      setAutoSaveStatus('saving')
      try {
        const updated = await updateTask(task.id, { description: descriptionDraft })
        lastSavedDescRef.current = descriptionDraft
        onUpdate(updated)
        setAutoSaveStatus('saved')
        setTimeout(() => setAutoSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2000)
      } catch {
        setAutoSaveStatus('idle')
      }
    }, 1500)

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descriptionDraft, isEditingDescription])

  async function handleDone() {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    if (descriptionDraft !== lastSavedDescRef.current) {
      try {
        const updated = await updateTask(task.id, { description: descriptionDraft })
        lastSavedDescRef.current = descriptionDraft
        onUpdate(updated)
      } catch {}
    }
    setIsEditingDescription(false)
    setAutoSaveStatus('idle')
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
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-700 px-4">
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
              className="rounded border border-zinc-600 bg-zinc-700 px-2 py-1.5 text-sm text-zinc-100 scheme-dark focus:border-zinc-400 focus:outline-none"
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

        {/* Linked Tasks */}
        <div>
          <label className="mb-2 block text-xs tracking-wide text-zinc-400 uppercase">
            Linked Tasks
          </label>

          {linkedTasks.length > 0 && (
            <div className="mb-2 space-y-1">
              {linkedTasks.map((linked) => (
                <div
                  key={linked.id}
                  className="flex items-center gap-2 rounded-md bg-zinc-700/50 px-2.5 py-1.5"
                >
                  <button
                    onClick={() => onSelectTask(linked.id)}
                    className={`min-w-0 flex-1 truncate text-left text-sm transition-colors hover:text-zinc-100 ${
                      linked.completed ? 'text-zinc-400 line-through' : 'text-zinc-200'
                    }`}
                  >
                    {linked.title}
                  </button>
                  <button
                    onClick={() => handleUnlink(linked.id)}
                    className="shrink-0 text-lg leading-none text-zinc-500 transition-colors hover:text-zinc-300"
                    title="Unlink"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="relative">
            <input
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              onFocus={() => setIsLinkSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsLinkSearchFocused(false), 150)}
              placeholder="Link a task…"
              className="w-full rounded-md border border-zinc-600 bg-zinc-700 px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-400 focus:outline-none"
            />
            {isLinkSearchFocused && linkableTasks.length > 0 && (
              <div className="absolute top-full left-0 z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-zinc-600 bg-zinc-800 py-1 shadow-xl">
                {linkableTasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleLink(t.id)}
                    className={`w-full px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-zinc-700 hover:text-zinc-100 ${
                      t.completed ? 'text-zinc-400 line-through' : 'text-zinc-200'
                    }`}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
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
                onClick={() => setIsEditingDescription(true)}
                className="text-xs text-zinc-400 transition-colors hover:text-zinc-200"
              >
                Edit
              </button>
            )}
          </div>

          {isEditingDescription ? (
            <div>
              <div ref={editorWrapperRef} className="relative">
                <div data-color-mode="dark">
                  <MDEditor
                    value={descriptionDraft}
                    onChange={(val) => setDescriptionDraft(val || '')}
                    height={320}
                    preview="live"
                    textareaProps={emojiTextareaProps}
                    previewOptions={{ skipHtml: false }}
                  />
                </div>
                {emojiResults.length > 0 && (
                  <div className="absolute bottom-full left-0 z-50 mb-1 w-56 overflow-hidden rounded-md border border-zinc-600 bg-zinc-800 py-1 shadow-xl">
                    {emojiResults.map(([name, emoji], i) => (
                      <button
                        key={name}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          insertEmoji(emoji)
                        }}
                        className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors ${
                          i === emojiIndex
                            ? 'bg-zinc-700 text-zinc-100'
                            : 'text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'
                        }`}
                      >
                        <span className="text-base">{emoji}</span>
                        <span className="text-zinc-400">:{name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={handleDone}
                  disabled={autoSaveStatus === 'saving'}
                  className="rounded-md bg-zinc-700 px-3 py-1 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-600 disabled:opacity-50"
                >
                  Done
                </button>
                {autoSaveStatus === 'pending' && (
                  <span className="text-xs text-zinc-500">Unsaved changes…</span>
                )}
                {autoSaveStatus === 'saving' && (
                  <span className="text-xs text-zinc-400">Saving…</span>
                )}
                {autoSaveStatus === 'saved' && (
                  <span className="text-xs text-emerald-400">Saved</span>
                )}
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
                if ((e.target as HTMLElement).closest('.copied')) {
                  return
                }
                if ((e.target as HTMLElement).closest('summary')) {
                  return
                }
                setIsEditingDescription(true)
              }}
              className="-mx-1 min-h-15 cursor-text rounded-md px-1"
            >
              {task.description ? (
                <div data-color-mode="dark">
                  <MDPreview
                    source={task.description}
                    style={{ background: 'transparent' }}
                    skipHtml={false}
                  />
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
