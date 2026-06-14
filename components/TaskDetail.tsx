'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import type { Tag, Task } from '@/lib/types'
import { updateTask, deleteTask, addTaskUrl, deleteTaskUrl, updateTaskUrl } from '@/app/actions'
import TagSelector from './TagSelector'
import { MDEditor, MDPreview, makeImageHandlers, replaceImageWidth } from './MdEditor'
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
  onSelectTask: (id: string) => void
}

const CHECKLIST_ITEM_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/gm

function createResizableImg(onResize: (src: string, w: number) => void) {
  return function ResizableImg({ src, alt, width }: React.ComponentPropsWithoutRef<'img'>) {
    const [displayWidth, setDisplayWidth] = useState<number | undefined>(
      typeof width === 'number'
        ? width
        : typeof width === 'string'
          ? parseInt(width) || undefined
          : undefined,
    )
    const imgRef = useRef<HTMLImageElement>(null)
    const dragState = useRef<{ startX: number; startWidth: number } | null>(null)

    function onHandleMouseDown(e: React.MouseEvent) {
      e.preventDefault()
      e.stopPropagation()
      dragState.current = {
        startX: e.clientX,
        startWidth: imgRef.current?.offsetWidth ?? displayWidth ?? 300,
      }

      function onMouseMove(ev: MouseEvent) {
        if (!dragState.current) return
        const w = Math.max(50, dragState.current.startWidth + ev.clientX - dragState.current.startX)
        setDisplayWidth(w)
      }

      function onMouseUp(ev: MouseEvent) {
        if (!dragState.current) return
        const w = Math.max(50, dragState.current.startWidth + ev.clientX - dragState.current.startX)
        dragState.current = null
        setDisplayWidth(w)
        if (typeof src === 'string') onResize(src, w)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    }

    return (
      <span className="group/img relative inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt={alt ?? ''}
          style={{
            width: displayWidth ? `${displayWidth}px` : undefined,
            maxWidth: '100%',
          }}
        />
        <span
          data-resize-handle="true"
          className="bg-surface-900/80 absolute right-0 bottom-0 flex h-6 w-6 cursor-se-resize items-center justify-center rounded-tl-md opacity-0 ring-1 ring-white/20 transition-opacity group-hover/img:opacity-100"
          onMouseDown={onHandleMouseDown}
          title="Drag to resize"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M11 1L1 11M11 5L5 11M11 9L9 11" />
          </svg>
        </span>
      </span>
    )
  }
}

function ProviderIcon({ url }: { url: string }) {
  let hostname = ''
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {}

  if (hostname.includes('gitlab'))
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="#FC6D26" aria-label="GitLab">
        <path d="M23.955 13.587l-1.342-4.135-2.664-8.189c-.135-.403-.701-.403-.837 0l-2.664 8.189H7.552L4.888 1.263c-.135-.403-.701-.403-.836 0L1.387 9.452.044 13.587c-.121.371.014.782.331 1.023L12 23.053l11.625-8.443c.318-.241.452-.652.33-1.023" />
      </svg>
    )
  if (hostname.includes('atlassian') || hostname.includes('jira'))
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="#0052CC" aria-label="Jira">
        <path d="M11.571 11.513H0a5.218 5.218 0 005.232 5.215h2.13v2.057A5.215 5.215 0 0012.575 24V12.518a1.005 1.005 0 00-1.004-1.005zm5.723-5.756H5.736a5.215 5.215 0 005.215 5.214h2.129v2.058a5.215 5.215 0 005.215 5.214V6.758a1.004 1.004 0 00-1.001-1.001zM23.016 0H11.445a5.215 5.215 0 005.215 5.215h2.129v2.057A5.215 5.215 0 0024 12.486V1.005A1.005 1.005 0 0023.016 0z" />
      </svg>
    )
  if (hostname.includes('github'))
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="#e6edf3" aria-label="GitHub">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    )
  if (hostname.includes('figma'))
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 200 300"
        className="h-4 w-auto shrink-0"
        aria-label="Figma"
      >
        <path
          fill="#0acf83"
          d="M50 300c27.6 0 50-22.4 50-50v-50H50c-27.6 0-50 22.4-50 50s22.4 50 50 50z"
        />
        <path fill="#a259ff" d="M0 150c0-27.6 22.4-50 50-50h50v100H50c-27.6 0-50-22.4-50-50z" />
        <path fill="#f24e1e" d="M0 50C0 22.4 22.4 0 50 0h50v100H50C22.4 100 0 77.6 0 50z" />
        <path fill="#ff7262" d="M100 0h50c27.6 0 50 22.4 50 50s-22.4 50-50 50h-50V0z" />
        <path
          fill="#1abcfe"
          d="M200 150c0 27.6-22.4 50-50 50s-50-22.4-50-50 22.4-50 50-50 50 22.4 50 50z"
        />
      </svg>
    )
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="text-surface-500 h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
    >
      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
    </svg>
  )
}

function isReviewLink(url: string): boolean {
  try {
    const pathname = new URL(url).pathname
    return /\/merge_requests\/\d+/.test(pathname) || /\/pull\/\d+/.test(pathname)
  } catch {
    return false
  }
}

function suggestLabel(url: string): string {
  try {
    const u = new URL(url)
    const jiraMatch = u.pathname.match(/\/browse\/([A-Z]+-\d+)/)
    if (jiraMatch) return jiraMatch[1]
    const mrMatch = u.pathname.match(/\/merge_requests\/(\d+)/)
    if (mrMatch) return `MR !${mrMatch[1]}`
    const issueMatch = u.pathname.match(/\/issues\/(\d+)/)
    if (issueMatch) return `Issue #${issueMatch[1]}`
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
    return u.hostname
  } catch {
    return ''
  }
}

function toggleChecklistItem(source: string, index: number): string {
  let count = 0
  return source.replace(CHECKLIST_ITEM_RE, (match, prefix, mark) => {
    if (count++ !== index) return match
    return `${prefix}[${mark === ' ' ? 'x' : ' '}]`
  })
}

function ScrollableTable({ children, ...props }: React.ComponentPropsWithoutRef<'table'>) {
  return (
    <div className="overflow-x-auto">
      <table {...props}>{children}</table>
    </div>
  )
}

function suggestionItemClass(active: boolean): string {
  return `flex w-full items-center justify-between gap-2.5 px-3 py-1.5 text-left text-sm transition-colors ${
    active
      ? 'bg-surface-700 text-surface-100'
      : 'text-surface-300 hover:bg-surface-700 hover:text-surface-100'
  }`
}

type Suggestion =
  | { kind: 'emoji'; items: ReadonlyArray<readonly [string, string]> }
  | { kind: 'mention'; items: Task[] }
  | { kind: 'snippet'; items: ReadonlyArray<Snippet> }

export default function TaskDetail({
  task,
  tags,
  allTasks,
  onUpdate,
  onDelete,
  onClose,
  onTagCreated,
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
  const [showUrlLinks, setShowUrlLinks] = useState(true)
  const [showAddUrl, setShowAddUrl] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const [urlLabelDraft, setUrlLabelDraft] = useState('')
  const [editingUrlId, setEditingUrlId] = useState<string | null>(null)
  const [copiedUrlId, setCopiedUrlId] = useState<string | null>(null)
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)
  const [editUrlDraft, setEditUrlDraft] = useState('')
  const [editLabelDraft, setEditLabelDraft] = useState('')
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedDescRef = useRef(task.description)
  const editorWrapperRef = useRef<HTMLDivElement>(null)
  const imageHandlers = makeImageHandlers(setDescriptionDraft)

  // setDescriptionDraft is stable (from useState) — safe to capture with empty deps
  const EditModeImg = useMemo(
    () =>
      createResizableImg((src, w) =>
        setDescriptionDraft((prev) => replaceImageWidth(prev, src, w)),
      ),
    [],
  )

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

  useEffect(() => {
    if (!isEditingDescription) return
    const wrapper = editorWrapperRef.current
    if (!wrapper) return

    function handleShiftTab(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !e.shiftKey) return
      const ta = wrapper!.querySelector<HTMLTextAreaElement>('textarea')
      if (!ta || document.activeElement !== ta) return

      e.preventDefault()
      // Stop capture from reaching textarea so the library's bubble-phase
      // listener never fires (it has a bug: inserts spaces for Shift+Tab
      // when there is no multi-line selection).
      e.stopPropagation()

      const { value, selectionStart, selectionEnd } = ta
      if (selectionStart === null || selectionEnd === null) return

      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
      const lineEndRaw = value.indexOf('\n', selectionEnd)
      const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw

      const lines = value.slice(lineStart, lineEnd).split('\n')
      let removedOnFirstLine = 0
      let totalRemoved = 0

      const dedentedLines = lines.map((line, i) => {
        let removed = 0
        let result = line
        if (line.startsWith('\t')) {
          result = line.slice(1)
          removed = 1
        } else if (line.startsWith('    ')) {
          result = line.slice(4)
          removed = 4
        } else if (line.startsWith('  ')) {
          result = line.slice(2)
          removed = 2
        } else if (line.startsWith(' ')) {
          result = line.slice(1)
          removed = 1
        }
        if (i === 0) removedOnFirstLine = removed
        totalRemoved += removed
        return result
      })

      if (totalRemoved === 0) return

      const newValue = value.slice(0, lineStart) + dedentedLines.join('\n') + value.slice(lineEnd)
      const newStart = Math.max(selectionStart - removedOnFirstLine, lineStart)
      const newEnd = Math.max(selectionEnd - totalRemoved, lineStart)

      setDescriptionDraft(newValue)
      setTimeout(() => ta.setSelectionRange(newStart, newEnd), 0)
    }

    wrapper.addEventListener('keydown', handleShiftTab, { capture: true })
    return () => wrapper.removeEventListener('keydown', handleShiftTab, { capture: true })
  }, [isEditingDescription])

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

  async function handleAddUrl() {
    const url = urlDraft.trim()
    if (!url) return
    const label = urlLabelDraft.trim() || suggestLabel(url) || url
    const updated = await addTaskUrl(task.id, { url, label })
    onUpdate(updated)
    setUrlDraft('')
    setUrlLabelDraft('')
    setShowAddUrl(false)
  }

  async function handleDeleteUrl(urlId: string) {
    const updated = await deleteTaskUrl(task.id, urlId)
    onUpdate(updated)
  }

  async function handleCopyForSlack(u: Task['urls'][number]) {
    const message = `For review:\n${task.title} → ${u.url}`
    await navigator.clipboard.writeText(message)
    setCopiedUrlId(u.id)
    setTimeout(() => setCopiedUrlId((id) => (id === u.id ? null : id)), 2000)
  }

  async function handleCopyLink(u: Task['urls'][number]) {
    await navigator.clipboard.writeText(u.url)
    setCopiedLinkId(u.id)
    setTimeout(() => setCopiedLinkId((id) => (id === u.id ? null : id)), 2000)
  }

  async function handleSaveEditUrl() {
    const url = editUrlDraft.trim()
    if (!url || !editingUrlId) return
    const label = editLabelDraft.trim() || suggestLabel(url) || url
    const updated = await updateTaskUrl(task.id, editingUrlId, { url, label })
    onUpdate(updated)
    setEditingUrlId(null)
    setEditUrlDraft('')
    setEditLabelDraft('')
  }

  function startEditUrl(urlId: string, currentUrl: string, currentLabel: string) {
    setEditingUrlId(urlId)
    setEditUrlDraft(currentUrl)
    setEditLabelDraft(currentLabel)
    setShowAddUrl(false)
  }

  function cancelEditUrl() {
    setEditingUrlId(null)
    setEditUrlDraft('')
    setEditLabelDraft('')
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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-surface-700 flex h-10 shrink-0 items-center gap-3 border-b px-4">
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
            className="border-surface-500 bg-surface-700 text-surface-100 focus:border-surface-300 min-w-0 flex-1 rounded border px-2 py-0.5 text-sm font-medium focus:outline-none"
          />
        ) : (
          <h2
            onClick={() => setIsEditingTitle(true)}
            title={task.title}
            className={`group hover:text-surface-300 flex min-w-0 flex-1 cursor-text items-center gap-1.5 transition-colors ${
              task.completed ? 'text-surface-400 line-through' : 'text-surface-100'
            }`}
          >
            <span className="min-w-0 truncate text-sm font-medium">{task.title}</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-50"
            >
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </h2>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          {task.archived ? (
            <button
              onClick={toggleArchived}
              className="bg-surface-600 text-surface-200 hover:bg-surface-500 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
            >
              Unarchive
            </button>
          ) : (
            <>
              <button
                onClick={toggleComplete}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  task.completed
                    ? 'bg-surface-600 text-surface-200 hover:bg-surface-500'
                    : 'bg-emerald-800 text-emerald-100 hover:bg-emerald-700'
                }`}
              >
                {task.completed ? 'Reopen' : 'Mark Complete'}
              </button>
              <button
                onClick={toggleArchived}
                className="bg-surface-700 text-surface-300 hover:bg-surface-600 hover:text-surface-100 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                title="Archive task"
              >
                Archive
              </button>
            </>
          )}
          {showDeleteConfirm ? (
            <>
              <button
                onClick={handleDelete}
                className="rounded-md bg-red-700 px-2.5 py-1 text-xs font-medium text-red-100 transition-colors hover:bg-red-600"
              >
                Confirm Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="bg-surface-700 text-surface-200 hover:bg-surface-600 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="bg-surface-700 text-surface-300 hover:bg-surface-600 rounded-md px-2.5 py-1 text-xs font-medium transition-colors hover:text-red-400"
            >
              Delete
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-surface-400 hover:text-surface-100 shrink-0 text-xl leading-none transition-colors"
        >
          ×
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {/* Compact metadata rows: Tags, Links */}
        <div className="space-y-2.5">
          {/* Tags */}
          <div className="flex items-center gap-3">
            <span className="text-surface-500 w-16 shrink-0 text-xs tracking-wide uppercase">
              Tags
            </span>
            <div className="min-w-0 flex-1">
              <TagSelector
                tags={tags}
                selected={task.tags}
                onChange={saveTags}
                onTagCreated={onTagCreated}
              />
            </div>
          </div>

          {/* Links */}
          <div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowUrlLinks((v) => !v)}
                className="text-surface-500 hover:text-surface-300 flex items-center gap-1.5 text-xs tracking-wide uppercase transition-colors"
              >
                <span
                  className={`text-[10px] transition-transform ${showUrlLinks ? 'rotate-90' : ''}`}
                >
                  ▸
                </span>
                <span>Links{task.urls.length > 0 ? ` (${task.urls.length})` : ''}</span>
              </button>
              {showUrlLinks && !showAddUrl && (
                <button
                  onClick={() => setShowAddUrl(true)}
                  className="text-surface-500 hover:bg-surface-700 hover:text-surface-300 ml-1 rounded px-1.5 py-0.5 text-xs transition-colors"
                  title="Add link"
                >
                  + Add
                </button>
              )}
            </div>

            {showUrlLinks && (
              <div className="mt-2 space-y-1.5 pl-5.5">
                {task.urls.map((u) =>
                  editingUrlId === u.id ? (
                    <div key={u.id} className="flex flex-col gap-1.5">
                      <input
                        autoFocus
                        value={editUrlDraft}
                        onChange={(e) => setEditUrlDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEditUrl()
                          if (e.key === 'Escape') cancelEditUrl()
                        }}
                        placeholder="URL"
                        className="border-surface-600 bg-surface-700 text-surface-100 placeholder:text-surface-500 focus:border-surface-400 w-full rounded-md border px-2.5 py-1 text-sm focus:outline-none"
                      />
                      <input
                        value={editLabelDraft}
                        onChange={(e) => setEditLabelDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEditUrl()
                          if (e.key === 'Escape') cancelEditUrl()
                        }}
                        placeholder={suggestLabel(editUrlDraft) || 'Label (optional)'}
                        className="border-surface-600 bg-surface-700 text-surface-100 placeholder:text-surface-500 focus:border-surface-400 w-full rounded-md border px-2.5 py-1 text-sm focus:outline-none"
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={handleSaveEditUrl}
                          disabled={!editUrlDraft.trim()}
                          className="bg-surface-700 text-surface-200 hover:bg-surface-600 rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEditUrl}
                          className="text-surface-400 hover:text-surface-200 rounded-md px-3 py-1 text-xs transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={u.id} className="group flex items-center gap-2">
                      <ProviderIcon url={u.url} />
                      <a
                        href={u.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-surface-300 hover:text-surface-100 min-w-0 truncate text-sm transition-colors hover:underline"
                        title={u.url}
                      >
                        {u.label}
                      </a>
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => handleCopyLink(u)}
                          className="text-surface-500 hover:bg-surface-700 hover:text-surface-300 rounded px-1 py-0.5 text-xs transition-colors"
                          title="Copy link"
                        >
                          {copiedLinkId === u.id ? 'Copied!' : 'Copy link'}
                        </button>
                        {isReviewLink(u.url) && (
                          <button
                            onClick={() => handleCopyForSlack(u)}
                            className="text-surface-500 hover:bg-surface-700 hover:text-surface-300 rounded px-1 py-0.5 text-xs transition-colors"
                            title="Copy Slack review message"
                          >
                            {copiedUrlId === u.id ? 'Copied!' : 'Copy for Slack'}
                          </button>
                        )}
                        <button
                          onClick={() => startEditUrl(u.id, u.url, u.label)}
                          className="text-surface-500 hover:bg-surface-700 hover:text-surface-300 rounded px-1 py-0.5 text-xs transition-colors"
                          title="Edit link"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteUrl(u.id)}
                          className="text-surface-600 hover:text-surface-300 text-lg leading-none transition-colors"
                          title="Remove link"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ),
                )}

                {showAddUrl && (
                  <div className="flex flex-col gap-1.5 pt-0.5">
                    <input
                      autoFocus
                      value={urlDraft}
                      onChange={(e) => setUrlDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddUrl()
                        if (e.key === 'Escape') {
                          setShowAddUrl(false)
                          setUrlDraft('')
                          setUrlLabelDraft('')
                        }
                      }}
                      placeholder="URL"
                      className="border-surface-600 bg-surface-700 text-surface-100 placeholder:text-surface-500 focus:border-surface-400 w-full rounded-md border px-2.5 py-1 text-sm focus:outline-none"
                    />
                    <input
                      value={urlLabelDraft}
                      onChange={(e) => setUrlLabelDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddUrl()
                        if (e.key === 'Escape') {
                          setShowAddUrl(false)
                          setUrlDraft('')
                          setUrlLabelDraft('')
                        }
                      }}
                      placeholder={suggestLabel(urlDraft) || 'Label (optional)'}
                      className="border-surface-600 bg-surface-700 text-surface-100 placeholder:text-surface-500 focus:border-surface-400 w-full rounded-md border px-2.5 py-1 text-sm focus:outline-none"
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={handleAddUrl}
                        disabled={!urlDraft.trim()}
                        className="bg-surface-700 text-surface-200 hover:bg-surface-600 rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => {
                          setShowAddUrl(false)
                          setUrlDraft('')
                          setUrlLabelDraft('')
                        }}
                        className="text-surface-400 hover:text-surface-200 rounded-md px-3 py-1 text-xs transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-surface-700/70 border-t" />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-surface-400 text-xs tracking-wide uppercase">Description</label>
            <div className="flex items-center gap-2">
              {isEditingDescription ? (
                <>
                  {autoSaveStatus === 'pending' && (
                    <span className="text-surface-500 text-xs">Unsaved…</span>
                  )}
                  {autoSaveStatus === 'saving' && (
                    <span className="text-surface-400 text-xs">Saving…</span>
                  )}
                  {autoSaveStatus === 'saved' && (
                    <span className="text-xs text-emerald-400">Saved</span>
                  )}
                  <button
                    onClick={handleDone}
                    disabled={autoSaveStatus === 'saving'}
                    className="bg-surface-600 text-surface-100 hover:bg-surface-500 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    Done
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditingDescription(true)}
                  className="text-surface-400 hover:text-surface-200 text-xs transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          {isEditingDescription ? (
            <div>
              <div ref={editorWrapperRef} className="relative">
                <div data-color-mode="dark">
                  <MDEditor
                    value={descriptionDraft}
                    onChange={(val) => setDescriptionDraft(val || '')}
                    height={560}
                    preview="live"
                    textareaProps={suggestionTextareaProps}
                    previewOptions={{
                      skipHtml: false,
                      components: { img: EditModeImg, table: ScrollableTable },
                    }}
                  />
                </div>
                {suggestion && suggestion.items.length > 0 && (
                  <div className="border-surface-600 bg-surface-800 absolute bottom-full left-0 z-50 mb-1 w-64 overflow-hidden rounded-md border py-1 shadow-xl">
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
                          <span className="text-surface-400">:{name}</span>
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
                          <span className="text-surface-500">/{s.key}</span>
                        </button>
                      ))}
                  </div>
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
              }}
              className="-mx-1 min-h-15 rounded-md px-1"
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
                          table: ScrollableTable,
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
                <p className="text-surface-500 py-1 text-sm italic">No description.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
