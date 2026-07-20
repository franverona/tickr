'use client'

import { useState, useEffect, useRef } from 'react'
import type { Tag, Task } from '@/lib/types'
import {
  getTasks,
  getTags,
  reorderTasks,
  updateTask,
  deleteTask,
  updateTasks,
  deleteTasks,
} from '@/app/actions'
import TaskCard from '@/components/TaskCard'
import TaskDetail from '@/components/TaskDetail'
import CreateTaskModal from '@/components/CreateTaskModal'
import TagManagementModal from '@/components/TagManagementModal'
import TaskContextMenu from '@/components/TaskContextMenu'
import ImportModal from '@/components/ImportModal'
import ShortcutsModal from '@/components/ShortcutsModal'
import Logo from '@/components/Logo'
import { exportToZip } from '@/lib/export'
import { getDueStatus } from '@/lib/dates'

const TAB_STORAGE_KEY = 'tickr:tab'
const SELECTED_TASK_STORAGE_KEY = 'tickr:selectedTaskId'
const DUE_NOTIFY_STORAGE_KEY = 'tickr:last-due-notify'

function compareDueDate(a: Task, b: Task): number {
  if (!a.dueDate && !b.dueDate) return 0
  if (!a.dueDate) return 1
  if (!b.dueDate) return -1
  return a.dueDate.localeCompare(b.dueDate)
}

function taskStatus(task: Task): 'active' | 'done' | 'archived' {
  if (task.archived) return 'archived'
  if (task.completed) return 'done'
  return 'active'
}

const STATUS_ORDER = { active: 0, done: 1, archived: 2 } as const

export default function Page() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [tab, setTab] = useState<'active' | 'done' | 'archived'>('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isTagsOpen, setIsTagsOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null)
  const [menuFeedback, setMenuFeedback] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [contextMenu, setContextMenu] = useState<{ taskId: string; x: number; y: number } | null>(
    null,
  )
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false)
  const [isBulkTagOpen, setIsBulkTagOpen] = useState(false)
  const bulkTagMenuRef = useRef<HTMLDivElement>(null)
  const [activeSort, setActiveSort] = useState<'manual' | 'dueDate'>('manual')
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false)
  const [toast, setToast] = useState<{
    message: string
    kind: 'loading' | 'success' | 'error'
  } | null>(null)
  const [toastClosing, setToastClosing] = useState(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const dragSrcIdxRef = useRef<number | null>(null)
  const dragOverIdxRef = useRef<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const cardRefs = useRef(new Map<string, HTMLButtonElement>())

  useEffect(() => {
    Promise.all([getTasks(), getTags()]).then(([t, g]) => {
      setTasks(t)
      setTags(g)
      setIsLoading(false)
    })
  }, [])

  // Restore last-viewed tab/task on mount rather than in useState initializers,
  // so the client's first render still matches the server-rendered HTML
  // (avoids a hydration mismatch) — this trades a one-frame flash of the
  // defaults for correctness. That's exactly the case the disabled rule
  // below warns about, but it's the React-docs-recommended fix for values
  // that can only be known on the client (react.dev/reference/react/useEffect
  // #displaying-different-content-on-the-server-and-client).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const savedTab = localStorage.getItem(TAB_STORAGE_KEY)
    if (savedTab === 'active' || savedTab === 'done' || savedTab === 'archived') setTab(savedTab)
    const savedTaskId = localStorage.getItem(SELECTED_TASK_STORAGE_KEY)
    if (savedTaskId) setSelectedTaskId(savedTaskId)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useEffect(() => {
    localStorage.setItem(TAB_STORAGE_KEY, tab)
  }, [tab])

  useEffect(() => {
    if (selectedTaskId) localStorage.setItem(SELECTED_TASK_STORAGE_KEY, selectedTaskId)
    else localStorage.removeItem(SELECTED_TASK_STORAGE_KEY)
  }, [selectedTaskId])

  // Notify at most once per calendar day (tracked in localStorage, not just
  // sessionStorage, so reloading later the same day doesn't re-prompt) about
  // tasks due today or overdue.
  useEffect(() => {
    if (isLoading || typeof Notification === 'undefined') return
    const today = new Date().toISOString().slice(0, 10)
    if (localStorage.getItem(DUE_NOTIFY_STORAGE_KEY) === today) return

    const due = tasks.filter(
      (t) =>
        !t.completed &&
        !t.archived &&
        (getDueStatus(t.dueDate, t.completed) === 'overdue' ||
          getDueStatus(t.dueDate, t.completed) === 'today'),
    )
    if (due.length === 0) return

    function notify() {
      const n = new Notification(`${due.length} task${due.length === 1 ? '' : 's'} due`, {
        body: due
          .slice(0, 5)
          .map((t) => t.title)
          .join('\n'),
        tag: 'tickr-due-reminder',
      })
      n.onclick = () => window.focus()
      localStorage.setItem(DUE_NOTIFY_STORAGE_KEY, today)
    }

    if (Notification.permission === 'granted') notify()
    else if (Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') notify()
      })
    }
  }, [isLoading, tasks])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    if (isMenuOpen) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [isMenuOpen])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (bulkTagMenuRef.current && !bulkTagMenuRef.current.contains(e.target as Node)) {
        setIsBulkTagOpen(false)
      }
    }
    if (isBulkTagOpen) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [isBulkTagOpen])

  useEffect(() => {
    if (!isMenuOpen) return
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    items?.[0]?.focus()

    function onMenuKeyDown(e: KeyboardEvent) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const menuItems = menuRef.current
        ? Array.from(menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
        : []
      if (menuItems.length === 0) return
      e.preventDefault()
      const current = menuItems.indexOf(document.activeElement as HTMLButtonElement)
      const next =
        e.key === 'ArrowDown'
          ? (current + 1) % menuItems.length
          : (current - 1 + menuItems.length) % menuItems.length
      menuItems[next]?.focus()
    }
    document.addEventListener('keydown', onMenuKeyDown)
    return () => document.removeEventListener('keydown', onMenuKeyDown)
  }, [isMenuOpen])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement
      const isTyping =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable)
      const isModalOpen =
        isCreateOpen || isTagsOpen || pendingImportFile !== null || isShortcutsOpen

      if (e.key === 'Escape') {
        if (isMenuOpen) {
          setIsMenuOpen(false)
          return
        }
        if (!isTyping && !isModalOpen && selectedTaskId) {
          setSelectedTaskId(null)
        }
        return
      }

      if (isTyping || isModalOpen || e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'n') {
        e.preventDefault()
        setIsCreateOpen(true)
      } else if (e.key === '/') {
        e.preventDefault()
        setIsSearchOpen(true)
      } else if (e.key === '?') {
        e.preventDefault()
        setIsShortcutsOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isCreateOpen, isTagsOpen, pendingImportFile, selectedTaskId, isMenuOpen, isShortcutsOpen])

  async function handleExport(format: 'json' | 'csv') {
    setIsMenuOpen(false)
    setIsExporting(true)
    setMenuFeedback('Exporting…')
    try {
      await exportToZip(tasks, tags, format)
    } finally {
      setIsExporting(false)
      setMenuFeedback(null)
    }
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setPendingImportFile(file)
  }

  function handleImported(result: { imported: number; tasks: Task[]; tags: Tag[] }) {
    setTasks(result.tasks)
    setTags(result.tags)
    setPendingImportFile(null)
    setMenuFeedback(`Imported ${result.imported}`)
    setTimeout(() => setMenuFeedback(null), 4000)
  }

  function showToast(message: string, kind: 'loading' | 'success' | 'error') {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToastClosing(false)
    setToast({ message, kind })
    if (kind !== 'loading') {
      toastTimerRef.current = setTimeout(() => setToastClosing(true), 3000)
    }
  }

  function handleTagCreated(tag: Tag) {
    setTags((prev) => [...prev, tag])
  }

  function handleTagUpdated(tag: Tag) {
    setTags((prev) => prev.map((t) => (t.id === tag.id ? tag : t)))
  }

  function handleTagDeleted(id: string) {
    setTags((prev) => prev.filter((t) => t.id !== id))
    setTasks((prev) =>
      prev.map((t) =>
        t.tags.includes(id) ? { ...t, tags: t.tags.filter((tid) => tid !== id) } : t,
      ),
    )
  }

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null

  const query = searchQuery.trim().toLowerCase()
  const tagLabelById = new Map(tags.map((t) => [t.id, t.label.toLowerCase()]))
  // A non-empty query searches across every tab (not just the current one) —
  // otherwise a task you know exists can silently fail to show up just
  // because it's archived while you're viewing Active.
  const isSearching = query.length > 0

  const filteredTasks = tasks
    .filter((task) => {
      if (isSearching) {
        return (
          task.title.toLowerCase().includes(query) ||
          task.description.toLowerCase().includes(query) ||
          task.tags.some((id) => tagLabelById.get(id)?.includes(query)) ||
          task.urls.some((url) => url.label.toLowerCase().includes(query))
        )
      }
      return tab === 'active'
        ? !task.completed && !task.archived
        : tab === 'done'
          ? task.completed && !task.archived
          : task.archived
    })
    .sort((a, b) => {
      if (isSearching) return STATUS_ORDER[taskStatus(a)] - STATUS_ORDER[taskStatus(b)]
      if (tab === 'active' && activeSort === 'dueDate') return compareDueDate(a, b)
      if (tab === 'done') return (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
      if (tab === 'archived') return (b.archivedAt ?? '').localeCompare(a.archivedAt ?? '')
      return 0
    })

  // Roving tabindex: only one card is a Tab stop at a time (falls back to
  // the first visible card if the last-active one scrolled out of the
  // current tab/search filter), so Tab moves in/out of the list as a single
  // stop and ArrowUp/ArrowDown/Home/End move within it.
  const rovingCardId = filteredTasks.some((t) => t.id === activeCardId)
    ? activeCardId
    : (filteredTasks[0]?.id ?? null)

  function handleTaskUpdated(updated: Task) {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    if (updated.id === selectedTaskId) {
      const stillInTab =
        tab === 'active'
          ? !updated.completed && !updated.archived
          : tab === 'done'
            ? updated.completed && !updated.archived
            : updated.archived
      if (!stillInTab) setSelectedTaskId(null)
    }
  }

  function handleTaskDeleted(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    if (selectedTaskId === id) setSelectedTaskId(null)
  }

  function handleTaskCreated(task: Task) {
    setTasks((prev) => [task, ...prev])
    setTab('active')
    setSelectedTaskId(task.id)
    setIsCreateOpen(false)
  }

  function handleDragStart(i: number) {
    dragSrcIdxRef.current = i
    dragOverIdxRef.current = null
    setDragSrcIdx(i)
    setDragOverIdx(null)
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIdxRef.current !== i) {
      dragOverIdxRef.current = i
      setDragOverIdx(i)
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const src = dragSrcIdxRef.current
    const over = dragOverIdxRef.current
    dragSrcIdxRef.current = null
    dragOverIdxRef.current = null
    setDragSrcIdx(null)
    setDragOverIdx(null)

    if (src === null || over === null || src === over || over === src + 1) return

    // Must match filteredTasks' active-tab set exactly (same filter, same
    // order) since src/over are indices into that array — reorder is only
    // ever triggered while it has no search query applied (see draggable
    // below), so filteredTasks here is just tasks filtered, unsorted.
    const active = tasks.filter((t) => !t.completed && !t.archived)
    const reordered = [...active]
    const [item] = reordered.splice(src, 1)
    reordered.splice(over > src ? over - 1 : over, 0, item)

    setTasks((prev) => [...reordered, ...prev.filter((t) => t.completed || t.archived)])
    showToast('Saving order…', 'loading')
    try {
      await reorderTasks(reordered.map((t) => t.id))
      showToast('Order saved', 'success')
    } catch {
      showToast('Failed to save order', 'error')
    }
  }

  function handleDragEnd() {
    dragSrcIdxRef.current = null
    dragOverIdxRef.current = null
    setDragSrcIdx(null)
    setDragOverIdx(null)
  }

  function handleContextMenu(e: React.MouseEvent, taskId: string) {
    e.preventDefault()
    setContextMenu({ taskId, x: e.clientX, y: e.clientY })
  }

  function focusCardAt(index: number) {
    const clamped = Math.max(0, Math.min(filteredTasks.length - 1, index))
    const task = filteredTasks[clamped]
    if (!task) return
    setActiveCardId(task.id)
    cardRefs.current.get(task.id)?.focus()
  }

  function handleCardKeyDown(e: React.KeyboardEvent, index: number, task: Task) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusCardAt(index + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusCardAt(index - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusCardAt(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusCardAt(filteredTasks.length - 1)
    } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      // Standard OS convention for opening a context menu via keyboard —
      // otherwise TaskContextMenu (Complete/Archive/Delete) is unreachable
      // without a mouse.
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      setContextMenu({ taskId: task.id, x: rect.left, y: rect.bottom })
    }
  }

  async function handleContextMenuAction(
    action: 'complete' | 'reopen' | 'archive' | 'unarchive' | 'delete',
  ) {
    if (!contextMenu) return
    const { taskId } = contextMenu
    setContextMenu(null)
    try {
      if (action === 'delete') {
        await deleteTask(taskId)
        handleTaskDeleted(taskId)
      } else {
        const data =
          action === 'complete'
            ? { completed: true }
            : action === 'reopen'
              ? { completed: false }
              : action === 'archive'
                ? { archived: true }
                : { archived: false }
        const updated = await updateTask(taskId, data)
        handleTaskUpdated(updated)
      }
    } catch {
      showToast(action === 'delete' ? 'Failed to delete task' : 'Failed to update task', 'error')
    }
  }

  function handleTaskCardClick(taskId: string) {
    setActiveCardId(taskId)
    if (isSelectMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(taskId)) next.delete(taskId)
        else next.add(taskId)
        return next
      })
    } else {
      setSelectedTaskId(taskId === selectedTaskId ? null : taskId)
    }
  }

  function cancelSelectMode() {
    setIsSelectMode(false)
    setSelectedIds(new Set())
    setBulkConfirmDelete(false)
  }

  const allFilteredSelected =
    filteredTasks.length > 0 && filteredTasks.every((t) => selectedIds.has(t.id))

  function toggleSelectAll() {
    setSelectedIds(allFilteredSelected ? new Set() : new Set(filteredTasks.map((t) => t.id)))
  }

  async function handleBulkAction(
    action: 'complete' | 'reopen' | 'archive' | 'unarchive' | 'delete',
  ) {
    const ids = Array.from(selectedIds)
    const count = ids.length
    const noun = count === 1 ? 'task' : 'tasks'
    const verb = action === 'delete' ? 'Deleting' : 'Updating'
    const infinitive = action === 'delete' ? 'delete' : 'update'
    showToast(`${verb} ${count} ${noun}…`, 'loading')
    try {
      let failedIds: string[]
      if (action === 'delete') {
        const result = await deleteTasks(ids)
        failedIds = result.failedIds
        const succeededIds = new Set(result.succeededIds)
        setTasks((prev) => prev.filter((t) => !succeededIds.has(t.id)))
        if (selectedTaskId && succeededIds.has(selectedTaskId)) setSelectedTaskId(null)
      } else {
        const data =
          action === 'complete'
            ? { completed: true }
            : action === 'reopen'
              ? { completed: false }
              : action === 'archive'
                ? { archived: true }
                : { archived: false }
        const result = await updateTasks(ids, data)
        failedIds = result.failedIds
        setTasks((prev) => prev.map((t) => result.succeeded.find((u) => u.id === t.id) ?? t))
      }

      const pastVerb = action === 'delete' ? 'Deleted' : 'Updated'
      if (failedIds.length === 0) {
        showToast(`${pastVerb} ${count} ${noun}`, 'success')
        cancelSelectMode()
      } else if (failedIds.length === count) {
        showToast(`Failed to ${infinitive} ${count} ${noun}`, 'error')
      } else {
        const succeededCount = count - failedIds.length
        showToast(
          `${pastVerb} ${succeededCount} of ${count} ${noun} — ${failedIds.length} failed`,
          'error',
        )
        // Narrow the selection to just the failures so retrying the same action tries only them.
        setSelectedIds(new Set(failedIds))
      }
    } catch {
      showToast(`Failed to ${verb.toLowerCase()} ${count} ${noun}`, 'error')
    }
  }

  async function handleBulkAddTag(tagId: string) {
    setIsBulkTagOpen(false)
    const targets = tasks.filter((t) => selectedIds.has(t.id) && !t.tags.includes(tagId))
    if (targets.length === 0) return
    showToast(`Tagging ${targets.length} task${targets.length === 1 ? '' : 's'}…`, 'loading')
    try {
      const results = await Promise.allSettled(
        targets.map((t) => updateTask(t.id, { tags: [...t.tags, tagId] })),
      )
      const succeeded = results
        .filter((r): r is PromiseFulfilledResult<Task> => r.status === 'fulfilled')
        .map((r) => r.value)
      setTasks((prev) => prev.map((t) => succeeded.find((u) => u.id === t.id) ?? t))
      const failedCount = targets.length - succeeded.length
      if (failedCount === 0) {
        showToast(`Tagged ${targets.length} task${targets.length === 1 ? '' : 's'}`, 'success')
      } else {
        showToast(
          `Tagged ${succeeded.length} of ${targets.length} — ${failedCount} failed`,
          'error',
        )
      }
    } catch {
      showToast('Failed to tag tasks', 'error')
    }
  }

  const hasNoTasks = !isLoading && tasks.length === 0

  return (
    <div className="bg-surface-900 flex h-screen flex-col overflow-hidden">
      {/* Top bar */}
      <header className="border-surface-700 bg-surface-900 flex shrink-0 items-center gap-2 border-b px-3 py-2.5 sm:gap-3 sm:px-4">
        <div className="mr-1 flex items-center gap-2">
          <Logo size={22} />
          <h1 className="text-surface-100 text-base font-bold tracking-tight">Tickr</h1>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {menuFeedback && (
            <span className="text-surface-500 hidden text-xs sm:inline">{menuFeedback}</span>
          )}

          <input
            ref={importInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={handleImportFile}
          />

          {/* Search */}
          {isSearchOpen ? (
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => {
                  if (!searchQuery) setIsSearchOpen(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchQuery('')
                    setIsSearchOpen(false)
                  }
                }}
                placeholder="Search tasks…"
                className="border-surface-600 bg-surface-800 text-surface-100 placeholder-surface-500 focus:border-surface-400 h-8 w-28 rounded-lg border px-2.5 pr-7 text-sm focus:outline-none sm:w-44"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    searchInputRef.current?.focus()
                  }}
                  className="text-surface-500 hover:text-surface-200 absolute top-1/2 right-1.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded transition-colors"
                  title="Clear search"
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
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => setIsSearchOpen(true)}
              className="border-surface-600 text-surface-400 hover:border-surface-400 hover:text-surface-100 flex h-8 w-8 items-center justify-center rounded-lg border transition-colors"
              title="Search tasks"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}

          <button
            onClick={() => setIsShortcutsOpen(true)}
            className="border-surface-600 text-surface-400 hover:border-surface-400 hover:text-surface-100 hidden h-8 w-8 items-center justify-center rounded-lg border text-sm font-semibold transition-colors sm:flex"
            title="Keyboard shortcuts (?)"
          >
            ?
          </button>

          {/* ··· menu */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setIsMenuOpen((o) => !o)}
              disabled={isExporting || pendingImportFile !== null}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              className="border-surface-600 text-surface-400 hover:border-surface-400 hover:text-surface-100 flex h-8 w-8 items-center justify-center rounded-lg border text-base font-bold tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              title="More options"
            >
              ···
            </button>

            {isMenuOpen && (
              <div
                role="menu"
                className="border-surface-700 bg-surface-800 absolute top-full right-0 z-20 mt-1 w-48 rounded-lg border py-1 shadow-xl"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setIsMenuOpen(false)
                    setIsTagsOpen(true)
                  }}
                  className="text-surface-300 hover:bg-surface-700 hover:text-surface-100 flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                  </svg>
                  Tags
                </button>

                <div className="border-surface-700 my-1 border-t" />

                <button
                  role="menuitem"
                  onClick={() => handleExport('json')}
                  className="text-surface-300 hover:bg-surface-700 hover:text-surface-100 flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export as JSON
                </button>
                <button
                  role="menuitem"
                  onClick={() => handleExport('csv')}
                  className="text-surface-300 hover:bg-surface-700 hover:text-surface-100 flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export as CSV
                </button>

                <div className="border-surface-700 my-1 border-t" />

                <button
                  role="menuitem"
                  onClick={() => {
                    setIsMenuOpen(false)
                    importInputRef.current?.click()
                  }}
                  className="text-surface-300 hover:bg-surface-700 hover:text-surface-100 flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Import
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="bg-primary-600 text-surface-900 hover:bg-primary-500 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          >
            <span className="text-base leading-none">+</span>
            <span className="hidden sm:inline">New Task</span>
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Task list */}
        <div
          className={`border-surface-700 flex shrink-0 flex-col border-r ${
            selectedTask ? 'hidden md:flex md:w-90' : 'flex w-full md:w-90'
          }`}
        >
          {isSelectMode ? (
            <div className="border-surface-700 flex h-12 flex-col justify-center gap-1 border-b px-3 sm:px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-surface-300 text-xs font-medium">
                    {selectedIds.size} selected
                  </span>
                  <button
                    onClick={toggleSelectAll}
                    className="text-accent-500 hover:text-accent-400 text-xs transition-colors"
                  >
                    {allFilteredSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <button
                  onClick={cancelSelectMode}
                  className="text-surface-400 hover:text-surface-100 text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div ref={bulkTagMenuRef} className="relative">
                  <button
                    onClick={() => setIsBulkTagOpen((o) => !o)}
                    disabled={selectedIds.size === 0}
                    aria-haspopup="menu"
                    aria-expanded={isBulkTagOpen}
                    className="text-surface-300 hover:text-surface-100 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Tag
                  </button>
                  {isBulkTagOpen && (
                    <div
                      role="menu"
                      className="border-surface-700 bg-surface-800 absolute top-full left-0 z-20 mt-1 w-44 rounded-lg border p-1.5 shadow-xl"
                    >
                      {tags.length === 0 ? (
                        <p className="text-surface-500 px-1.5 py-1 text-xs">No tags yet</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {tags.map((tag) => (
                            <button
                              key={tag.id}
                              role="menuitem"
                              onClick={() => handleBulkAddTag(tag.id)}
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-transform hover:scale-105 ${tag.color}`}
                            >
                              {tag.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {tab === 'active' && (
                  <button
                    onClick={() => handleBulkAction('complete')}
                    disabled={selectedIds.size === 0}
                    className="text-surface-300 hover:text-surface-100 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Complete
                  </button>
                )}
                {tab === 'done' && (
                  <button
                    onClick={() => handleBulkAction('reopen')}
                    disabled={selectedIds.size === 0}
                    className="text-surface-300 hover:text-surface-100 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Reopen
                  </button>
                )}
                {(tab === 'active' || tab === 'done') && (
                  <button
                    onClick={() => handleBulkAction('archive')}
                    disabled={selectedIds.size === 0}
                    className="text-surface-300 hover:text-surface-100 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Archive
                  </button>
                )}
                {tab === 'archived' && (
                  <button
                    onClick={() => handleBulkAction('unarchive')}
                    disabled={selectedIds.size === 0}
                    className="text-surface-300 hover:text-surface-100 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Unarchive
                  </button>
                )}
                {bulkConfirmDelete ? (
                  <button
                    onClick={() => handleBulkAction('delete')}
                    disabled={selectedIds.size === 0}
                    className="text-xs text-red-400 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Confirm Delete?
                  </button>
                ) : (
                  <button
                    onClick={() => setBulkConfirmDelete(true)}
                    disabled={selectedIds.size === 0}
                    className="text-xs text-red-400 transition-colors hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="border-surface-700 flex h-12 items-center border-b px-3 sm:px-4">
              <div className="flex h-full gap-4 sm:gap-5">
                {(['active', 'done', 'archived'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTab(t)
                      setSelectedTaskId(null)
                      cancelSelectMode()
                    }}
                    className={`flex h-full items-center border-b-2 text-xs font-medium transition-colors ${
                      tab === t
                        ? 'border-surface-300 text-surface-100'
                        : 'text-surface-400 hover:text-surface-200 border-transparent'
                    }`}
                  >
                    {t === 'active' ? 'Active' : t === 'done' ? 'Done' : 'Archived'}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2.5">
                {tab === 'active' && !isSearching && (
                  <select
                    value={activeSort}
                    onChange={(e) => setActiveSort(e.target.value as 'manual' | 'dueDate')}
                    title="Sort tasks"
                    className="border-surface-600 bg-surface-800 text-surface-300 hover:border-surface-400 rounded-lg border px-1.5 py-1 text-xs focus:outline-none"
                  >
                    <option value="manual">Manual order</option>
                    <option value="dueDate">Due date</option>
                  </select>
                )}
                <span className="text-surface-500 text-xs">
                  {isLoading
                    ? ''
                    : `${filteredTasks.length} ${
                        isSearching
                          ? filteredTasks.length === 1
                            ? 'result'
                            : 'results'
                          : filteredTasks.length === 1
                            ? 'task'
                            : 'tasks'
                      }`}
                </span>
                {!isLoading && filteredTasks.length > 0 && (
                  <button
                    onClick={() => {
                      setIsSelectMode(true)
                      setSelectedTaskId(null)
                    }}
                    className="text-surface-400 hover:text-surface-100 text-xs transition-colors"
                  >
                    Select
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3">
            {isLoading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="border-surface-700 bg-surface-800 animate-pulse rounded-lg border p-3"
                  >
                    <div className="bg-surface-700 h-3.5 w-3/4 rounded" />
                    <div className="bg-surface-700 mt-2.5 h-2.5 w-1/2 rounded" />
                  </div>
                ))}
              </div>
            ) : hasNoTasks ? (
              <div className="text-surface-500 flex h-full flex-col items-center justify-center gap-3">
                <p className="text-sm">No tasks yet</p>
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="text-accent-500 hover:text-accent-400 text-sm transition-colors"
                >
                  Create your first task →
                </button>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-surface-500 flex h-32 items-center justify-center">
                <p className="text-sm">
                  {query
                    ? 'No tasks match your search'
                    : tab === 'done'
                      ? 'No completed tasks yet'
                      : tab === 'archived'
                        ? 'No archived tasks'
                        : 'No active tasks'}
                </p>
              </div>
            ) : tab === 'active' && !isSearching ? (
              <div className="flex flex-col gap-2">
                {filteredTasks.map((task, i) => (
                  <div key={task.id}>
                    {dragSrcIdx !== null &&
                      dragOverIdx === i &&
                      dragSrcIdx !== i &&
                      dragOverIdx !== dragSrcIdx + 1 && (
                        <div className="bg-accent-500 mb-2 h-0.5 rounded-full" />
                      )}
                    <div
                      draggable={activeSort === 'manual'}
                      onDragStart={
                        activeSort !== 'manual'
                          ? undefined
                          : (e) => {
                              e.dataTransfer.effectAllowed = 'move'
                              handleDragStart(i)
                            }
                      }
                      onDragOver={activeSort !== 'manual' ? undefined : (e) => handleDragOver(e, i)}
                      onDrop={activeSort !== 'manual' ? undefined : handleDrop}
                      onDragEnd={activeSort !== 'manual' ? undefined : handleDragEnd}
                      className={dragSrcIdx === i ? 'opacity-40' : ''}
                    >
                      <TaskCard
                        ref={(el) => {
                          if (el) cardRefs.current.set(task.id, el)
                          else cardRefs.current.delete(task.id)
                        }}
                        task={task}
                        tags={tags}
                        isSelected={task.id === selectedTaskId}
                        onClick={() => handleTaskCardClick(task.id)}
                        onContextMenu={(e) => handleContextMenu(e, task.id)}
                        onKeyDown={(e) => handleCardKeyDown(e, i, task)}
                        selectMode={isSelectMode}
                        checked={selectedIds.has(task.id)}
                        tabIndex={task.id === rovingCardId ? 0 : -1}
                      />
                    </div>
                  </div>
                ))}
                <div
                  className="h-4"
                  onDragOver={
                    activeSort !== 'manual'
                      ? undefined
                      : (e) => handleDragOver(e, filteredTasks.length)
                  }
                  onDrop={activeSort !== 'manual' ? undefined : handleDrop}
                >
                  {dragSrcIdx !== null &&
                    dragOverIdx === filteredTasks.length &&
                    dragOverIdx !== dragSrcIdx + 1 && (
                      <div className="bg-accent-500 h-0.5 rounded-full" />
                    )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTasks.map((task, i) => (
                  <TaskCard
                    key={task.id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(task.id, el)
                      else cardRefs.current.delete(task.id)
                    }}
                    task={task}
                    tags={tags}
                    isSelected={task.id === selectedTaskId}
                    onClick={() => handleTaskCardClick(task.id)}
                    onContextMenu={(e) => handleContextMenu(e, task.id)}
                    onKeyDown={(e) => handleCardKeyDown(e, i, task)}
                    selectMode={isSelectMode}
                    checked={selectedIds.has(task.id)}
                    tabIndex={task.id === rovingCardId ? 0 : -1}
                    showStatus={isSearching}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Task detail panel */}
        {selectedTask ? (
          <div className="min-w-0 flex-1 overflow-hidden">
            <TaskDetail
              key={selectedTask.id}
              task={selectedTask}
              tags={tags}
              allTasks={tasks}
              onUpdate={handleTaskUpdated}
              onDelete={handleTaskDeleted}
              onClose={() => setSelectedTaskId(null)}
              onTagCreated={handleTagCreated}
              onSelectTask={setSelectedTaskId}
              onError={(message) => showToast(message, 'error')}
            />
          </div>
        ) : (
          !hasNoTasks && (
            <div className="hidden flex-1 flex-col items-center justify-center gap-1.5 select-none md:flex">
              <p className="text-surface-400 text-sm font-medium">Select a task to view details</p>
              <button
                onClick={() => setIsCreateOpen(true)}
                className="text-accent-500 hover:text-accent-400 text-sm transition-colors"
              >
                or create a new one →
              </button>
            </div>
          )
        )}
      </div>

      {isCreateOpen && (
        <CreateTaskModal
          tags={tags}
          onCreated={handleTaskCreated}
          onClose={() => setIsCreateOpen(false)}
          onTagCreated={handleTagCreated}
        />
      )}

      {isTagsOpen && (
        <TagManagementModal
          tags={tags}
          onClose={() => setIsTagsOpen(false)}
          onTagUpdated={handleTagUpdated}
          onTagDeleted={handleTagDeleted}
        />
      )}

      {pendingImportFile && (
        <ImportModal
          file={pendingImportFile}
          onClose={() => setPendingImportFile(null)}
          onImported={handleImported}
        />
      )}

      {isShortcutsOpen && <ShortcutsModal onClose={() => setIsShortcutsOpen(false)} />}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          onTransitionEnd={() => {
            if (toastClosing) setToast(null)
          }}
          className={`fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm shadow-xl transition-all duration-200 ease-out starting:translate-y-2 starting:opacity-0 ${
            toastClosing ? 'translate-y-2 opacity-0' : 'translate-y-0 opacity-100'
          } ${
            toast.kind === 'error'
              ? 'bg-red-600 text-white'
              : 'border-surface-700 bg-surface-800 text-surface-100 border'
          }`}
        >
          {toast.kind === 'loading' && (
            <span className="border-surface-500 border-t-accent-500 h-3.5 w-3.5 animate-spin rounded-full border-2" />
          )}
          {toast.kind === 'success' && <span className="text-emerald-400">✓</span>}
          {toast.kind === 'error' && <span>⚠</span>}
          <span>{toast.message}</span>
        </div>
      )}

      {contextMenu && (
        <TaskContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          tab={tab}
          onComplete={() => handleContextMenuAction('complete')}
          onReopen={() => handleContextMenuAction('reopen')}
          onArchive={() => handleContextMenuAction('archive')}
          onUnarchive={() => handleContextMenuAction('unarchive')}
          onDelete={() => handleContextMenuAction('delete')}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
