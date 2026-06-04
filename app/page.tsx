'use client'

import { useState, useEffect, useRef } from 'react'
import type { Tag, Task } from '@/lib/types'
import { getTasks, getTags, reorderTasks, importTasks, updateTask, deleteTask } from '@/app/actions'
import TaskCard from '@/components/TaskCard'
import TaskDetail from '@/components/TaskDetail'
import CreateTaskModal from '@/components/CreateTaskModal'
import TagManagementModal from '@/components/TagManagementModal'
import TaskContextMenu from '@/components/TaskContextMenu'
import Logo from '@/components/Logo'
import { exportToZip } from '@/lib/export'
import { processImportZip } from '@/lib/import'

export default function Page() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [tab, setTab] = useState<'active' | 'done' | 'archived'>('active')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isTagsOpen, setIsTagsOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [menuFeedback, setMenuFeedback] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [contextMenu, setContextMenu] = useState<{ taskId: string; x: number; y: number } | null>(
    null,
  )
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const dragSrcIdxRef = useRef<number | null>(null)
  const dragOverIdxRef = useRef<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([getTasks(), getTags()]).then(([t, g]) => {
      setTasks(t)
      setTags(g)
      setIsLoading(false)
    })
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    if (isMenuOpen) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [isMenuOpen])

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

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setIsImporting(true)
    setMenuFeedback('Importing…')
    try {
      const items = await processImportZip(file)
      const { imported, tasks: newTasks, tags: newTags } = await importTasks(items)
      setTasks(newTasks)
      setTags(newTags)
      setMenuFeedback(`Imported ${imported}`)
    } catch (err) {
      console.error('Import failed:', err)
      setMenuFeedback('Failed')
    } finally {
      setIsImporting(false)
      setTimeout(() => setMenuFeedback(null), 4000)
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

  const filteredTasks = tasks.filter((task) =>
    tab === 'active'
      ? !task.completed && !task.archived
      : tab === 'done'
        ? task.completed && !task.archived
        : task.archived,
  )

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

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const src = dragSrcIdxRef.current
    const over = dragOverIdxRef.current
    dragSrcIdxRef.current = null
    dragOverIdxRef.current = null
    setDragSrcIdx(null)
    setDragOverIdx(null)

    if (src === null || over === null || src === over || over === src + 1) return

    const active = tasks.filter((t) => !t.completed)
    const reordered = [...active]
    const [item] = reordered.splice(src, 1)
    reordered.splice(over > src ? over - 1 : over, 0, item)

    setTasks((prev) => [...reordered, ...prev.filter((t) => t.completed)])
    reorderTasks(reordered.map((t) => t.id))
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

  async function handleContextMenuAction(
    action: 'complete' | 'reopen' | 'archive' | 'unarchive' | 'delete',
  ) {
    if (!contextMenu) return
    const { taskId } = contextMenu
    setContextMenu(null)
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
  }

  const hasNoTasks = !isLoading && tasks.length === 0

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-900">
      {/* Top bar */}
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-zinc-700 bg-zinc-900 px-4 py-2.5">
        <div className="mr-1 flex items-center gap-2">
          <Logo size={22} />
          <h1 className="text-base font-bold tracking-tight text-zinc-100">Tickr</h1>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {menuFeedback && <span className="text-xs text-zinc-500">{menuFeedback}</span>}

          <input
            ref={importInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={handleImportFile}
          />

          {/* ··· menu */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setIsMenuOpen((o) => !o)}
              disabled={isExporting || isImporting}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-600 text-base font-bold tracking-widest text-zinc-400 transition-colors hover:border-zinc-400 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="More options"
            >
              ···
            </button>

            {isMenuOpen && (
              <div className="absolute top-full right-0 z-20 mt-1 w-48 rounded-lg border border-zinc-700 bg-zinc-800 py-1 shadow-xl">
                <button
                  onClick={() => {
                    setIsMenuOpen(false)
                    setIsTagsOpen(true)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
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

                <div className="my-1 border-t border-zinc-700" />

                <button
                  onClick={() => handleExport('json')}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
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
                  onClick={() => handleExport('csv')}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
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

                <div className="my-1 border-t border-zinc-700" />

                <button
                  onClick={() => {
                    setIsMenuOpen(false)
                    importInputRef.current?.click()
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
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
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            <span className="text-base leading-none">+</span>
            New Task
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Task list */}
        <div
          className={`flex flex-shrink-0 flex-col border-r border-zinc-700 ${
            selectedTask ? 'w-[360px]' : 'w-full'
          }`}
        >
          <div className="flex h-10 items-center border-b border-zinc-700 px-4">
            <div className="flex h-full gap-5">
              {(['active', 'done', 'archived'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t)
                    setSelectedTaskId(null)
                  }}
                  className={`flex h-full items-center border-b-2 text-xs font-medium transition-colors ${
                    tab === t
                      ? 'border-zinc-300 text-zinc-100'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t === 'active' ? 'Active' : t === 'done' ? 'Done' : 'Archived'}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-zinc-500">
              {isLoading
                ? ''
                : `${filteredTasks.length} ${filteredTasks.length === 1 ? 'task' : 'tasks'}`}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {hasNoTasks ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
                <p className="text-sm">No tasks yet</p>
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="text-sm text-blue-500 transition-colors hover:text-blue-400"
                >
                  Create your first task →
                </button>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-zinc-500">
                <p className="text-sm">
                  {tab === 'done'
                    ? 'No completed tasks yet'
                    : tab === 'archived'
                      ? 'No archived tasks'
                      : 'No active tasks'}
                </p>
              </div>
            ) : tab === 'active' ? (
              <div className="flex flex-col gap-2">
                {filteredTasks.map((task, i) => (
                  <div key={task.id}>
                    {dragSrcIdx !== null &&
                      dragOverIdx === i &&
                      dragSrcIdx !== i &&
                      dragOverIdx !== dragSrcIdx + 1 && (
                        <div className="mb-2 h-0.5 rounded-full bg-blue-500" />
                      )}
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        handleDragStart(i)
                      }}
                      onDragOver={(e) => handleDragOver(e, i)}
                      onDrop={handleDrop}
                      onDragEnd={handleDragEnd}
                      className={dragSrcIdx === i ? 'opacity-40' : ''}
                    >
                      <TaskCard
                        task={task}
                        tags={tags}
                        isSelected={task.id === selectedTaskId}
                        onClick={() =>
                          setSelectedTaskId(task.id === selectedTaskId ? null : task.id)
                        }
                        onContextMenu={(e) => handleContextMenu(e, task.id)}
                      />
                    </div>
                  </div>
                ))}
                <div
                  className="h-4"
                  onDragOver={(e) => handleDragOver(e, filteredTasks.length)}
                  onDrop={handleDrop}
                >
                  {dragSrcIdx !== null &&
                    dragOverIdx === filteredTasks.length &&
                    dragOverIdx !== dragSrcIdx + 1 && (
                      <div className="h-0.5 rounded-full bg-blue-500" />
                    )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    tags={tags}
                    isSelected={task.id === selectedTaskId}
                    onClick={() => setSelectedTaskId(task.id === selectedTaskId ? null : task.id)}
                    onContextMenu={(e) => handleContextMenu(e, task.id)}
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
              onUpdate={handleTaskUpdated}
              onDelete={handleTaskDeleted}
              onClose={() => setSelectedTaskId(null)}
              onTagCreated={handleTagCreated}
            />
          </div>
        ) : (
          !hasNoTasks && (
            <div className="hidden flex-1 flex-col items-center justify-center gap-1.5 select-none md:flex">
              <p className="text-sm font-medium text-zinc-400">Select a task to view details</p>
              <button
                onClick={() => setIsCreateOpen(true)}
                className="text-sm text-blue-500 transition-colors hover:text-blue-400"
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
