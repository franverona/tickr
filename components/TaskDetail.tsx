'use client'

import { useState, useRef, useEffect } from 'react'
import type { Tag, Task } from '@/lib/types'
import { updateTask, deleteTask, linkTask, unlinkTask } from '@/app/actions'
import TagSelector from './TagSelector'
import { MDEditor, MDPreview, makeImageHandlers } from './MdEditor'
import { searchEmojis } from '@/lib/emojis'
import { searchSnippets, type Snippet } from '@/lib/snippets'

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

const CHECKLIST_ITEM_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/gm

function toggleChecklistItem(source: string, index: number): string {
  let count = 0
  return source.replace(CHECKLIST_ITEM_RE, (match, prefix, mark) => {
    if (count++ !== index) return match
    return `${prefix}[${mark === ' ' ? 'x' : ' '}]`
  })
}

function suggestionItemClass(active: boolean): string {
  return `flex w-full items-center justify-between gap-2.5 px-3 py-1.5 text-left text-sm transition-colors ${
    active ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'
  }`
}

type Suggestion =
  | { kind: 'emoji'; items: ReadonlyArray<readonly [string, string]> }
  | { kind: 'mention'; items: Task[] }
  | { kind: 'snippet'; items: ReadonlyArray<Snippet> }

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
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedDescRef = useRef(task.description)
  const editorWrapperRef = useRef<HTMLDivElement>(null)
  const imageHandlers = makeImageHandlers(setDescriptionDraft)

  const EMOJI_RE = /:([a-z0-9_+\-]*)$/
  const MENTION_RE = /(?:^|\s)@([^\n]{0,60})$/
  const SNIPPET_RE = /(?:^|\s)\/([a-z-]{0,20})$/

  function detectSuggestion(textarea: HTMLTextAreaElement) {
    const cursor = textarea.selectionStart
    const before = textarea.value.slice(0, cursor)

    const emojiMatch = before.match(EMOJI_RE)
    if (emojiMatch) {
      setSuggestion({ kind: 'emoji', items: searchEmojis(emojiMatch[1]) })
      setSuggestionIndex(0)
      return
    }

    const mentionMatch = before.match(MENTION_RE)
    if (mentionMatch) {
      const query = mentionMatch[1].toLowerCase()
      const items = allTasks
        .filter((t) => t.id !== task.id && t.title.toLowerCase().includes(query))
        .slice(0, 8)
      setSuggestion(items.length > 0 ? { kind: 'mention', items } : null)
      setSuggestionIndex(0)
      return
    }

    const snippetMatch = before.match(SNIPPET_RE)
    if (snippetMatch) {
      const items = searchSnippets(snippetMatch[1])
      setSuggestion(items.length > 0 ? { kind: 'snippet', items } : null)
      setSuggestionIndex(0)
      return
    }

    setSuggestion(null)
  }

  function applySuggestionInsertion(
    textarea: HTMLTextAreaElement,
    start: number,
    end: number,
    text: string,
  ) {
    const newValue = textarea.value.slice(0, start) + text + textarea.value.slice(end)
    setDescriptionDraft(newValue)
    setSuggestion(null)
    setTimeout(() => {
      textarea.focus()
      const pos = start + [...text].length
      textarea.setSelectionRange(pos, pos)
    }, 0)
  }

  function selectSuggestion(index: number) {
    if (!suggestion) return
    const textarea = editorWrapperRef.current?.querySelector('textarea')
    if (!textarea) return
    const cursor = textarea.selectionStart
    const before = textarea.value.slice(0, cursor)

    if (suggestion.kind === 'emoji') {
      const match = before.match(EMOJI_RE)
      if (!match) return
      applySuggestionInsertion(
        textarea,
        cursor - match[0].length,
        cursor,
        suggestion.items[index][1],
      )
      return
    }

    if (suggestion.kind === 'mention') {
      const match = before.match(MENTION_RE)
      if (!match) return
      const start = cursor - match[1].length - 1
      const target = suggestion.items[index]
      applySuggestionInsertion(textarea, start, cursor, `[${target.title}](#${target.id})`)
      linkTask(task.id, target.id).then(({ task: updated, linkedTask }) =>
        onLinksChanged(updated, linkedTask),
      )
      return
    }

    const match = before.match(SNIPPET_RE)
    if (!match) return
    const start = cursor - match[1].length - 1
    applySuggestionInsertion(textarea, start, cursor, suggestion.items[index].insert)
  }

  const suggestionTextareaProps = {
    ...imageHandlers,
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (suggestion && suggestion.items.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSuggestionIndex((i) => Math.min(i + 1, suggestion.items.length - 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSuggestionIndex((i) => Math.max(i - 1, 0))
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          selectSuggestion(suggestionIndex)
          return
        }
        if (e.key === 'Escape') {
          setSuggestion(null)
          return
        }
      }
    },
    onKeyUp: (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
        detectSuggestion(e.currentTarget)
      }
    },
    onClick: (e: React.MouseEvent<HTMLTextAreaElement>) => {
      detectSuggestion(e.currentTarget)
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

  async function handleToggleChecklist(index: number) {
    const updated = await updateTask(task.id, {
      description: toggleChecklistItem(task.description, index),
    })
    onUpdate(updated)
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
                    textareaProps={suggestionTextareaProps}
                    previewOptions={{ skipHtml: false }}
                  />
                </div>
                {suggestion && suggestion.items.length > 0 && (
                  <div className="absolute bottom-full left-0 z-50 mb-1 w-64 overflow-hidden rounded-md border border-zinc-600 bg-zinc-800 py-1 shadow-xl">
                    {suggestion.kind === 'emoji' &&
                      suggestion.items.map(([name, emoji], i) => (
                        <button
                          key={name}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            selectSuggestion(i)
                          }}
                          className={suggestionItemClass(i === suggestionIndex)}
                        >
                          <span className="text-base">{emoji}</span>
                          <span className="text-zinc-400">:{name}</span>
                        </button>
                      ))}
                    {suggestion.kind === 'mention' &&
                      suggestion.items.map((t, i) => (
                        <button
                          key={t.id}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            selectSuggestion(i)
                          }}
                          className={suggestionItemClass(i === suggestionIndex)}
                        >
                          <span className="truncate">{t.title}</span>
                        </button>
                      ))}
                    {suggestion.kind === 'snippet' &&
                      suggestion.items.map((s, i) => (
                        <button
                          key={s.key}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            selectSuggestion(i)
                          }}
                          className={suggestionItemClass(i === suggestionIndex)}
                        >
                          <span>{s.label}</span>
                          <span className="text-zinc-500">/{s.key}</span>
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
                  const href = anchor.getAttribute('href') ?? ''
                  if (href.startsWith('#')) {
                    onSelectTask(href.slice(1))
                  } else {
                    window.open(href, '_blank', 'noopener,noreferrer')
                  }
                  return
                }
                if ((e.target as HTMLElement).closest('.copied')) {
                  return
                }
                if ((e.target as HTMLElement).closest('summary')) {
                  return
                }
                if ((e.target as HTMLElement).closest('input[type="checkbox"]')) {
                  return
                }
                setIsEditingDescription(true)
              }}
              className="-mx-1 min-h-15 cursor-text rounded-md px-1"
            >
              {task.description ? (
                (() => {
                  // react-markdown-preview invokes component renderers more than once per
                  // node (e.g. React Strict Mode double-render), so a plain incrementing
                  // counter assigns inconsistent indices to the same checkbox across calls.
                  // Cache the index per AST node (stable identity within one render pass).
                  let nextChecklistIndex = 0
                  const checklistIndices = new WeakMap<object, number>()
                  return (
                    <div data-color-mode="dark">
                      <MDPreview
                        source={task.description}
                        style={{ background: 'transparent' }}
                        skipHtml={false}
                        components={{
                          input: ({ node, ...props }) => {
                            if (props.type !== 'checkbox') return <input {...props} />
                            let index = node ? checklistIndices.get(node) : undefined
                            if (index === undefined) {
                              index = nextChecklistIndex++
                              if (node) checklistIndices.set(node, index)
                            }
                            return (
                              <input
                                type="checkbox"
                                checked={Boolean(props.checked)}
                                onChange={() => handleToggleChecklist(index)}
                                className="mr-1.5 -ml-5 align-middle accent-emerald-600"
                              />
                            )
                          },
                        }}
                      />
                    </div>
                  )
                })()
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
