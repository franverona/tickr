'use client'

import { useEffect, useRef, useState } from 'react'
import type { Task } from '@/lib/types'

interface Command {
  id: string
  label: string
  hint?: string
  action: () => void
}

interface CommandPaletteProps {
  tasks: Task[]
  onClose: () => void
  onNewTask: () => void
  onOpenSearch: () => void
  onOpenTags: () => void
  onExport: (format: 'json' | 'csv') => void
  onImport: () => void
  onOpenShortcuts: () => void
  onSelectTask: (taskId: string) => void
}

export default function CommandPalette({
  tasks,
  onClose,
  onNewTask,
  onOpenSearch,
  onOpenTags,
  onExport,
  onImport,
  onOpenShortcuts,
  onSelectTask,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const commands: Command[] = [
    { id: 'new-task', label: 'New Task', hint: 'N', action: onNewTask },
    { id: 'search', label: 'Search Tasks', hint: '/', action: onOpenSearch },
    { id: 'tags', label: 'Manage Tags', action: onOpenTags },
    { id: 'export-json', label: 'Export as JSON', action: () => onExport('json') },
    { id: 'export-csv', label: 'Export as CSV', action: () => onExport('csv') },
    { id: 'import', label: 'Import Tasks', action: onImport },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', hint: '?', action: onOpenShortcuts },
  ]

  const q = query.trim().toLowerCase()
  const filteredCommands = q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands
  const taskResults = q ? tasks.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 6) : []

  type Item = { type: 'command'; command: Command } | { type: 'task'; task: Task }

  const items: Item[] = [
    ...filteredCommands.map((command): Item => ({ type: 'command', command })),
    ...taskResults.map((task): Item => ({ type: 'task', task })),
  ]

  function runItem(item: Item) {
    if (item.type === 'command') item.command.action()
    else onSelectTask(item.task.id)
    onClose()
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (items.length === 0 ? 0 : (i + 1) % items.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (items.length === 0 ? 0 : (i - 1 + items.length) % items.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[activeIndex]
      if (item) runItem(item)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/60 p-4 pt-24" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="border-surface-700 bg-surface-800 h-fit w-full max-w-md overflow-hidden rounded-xl border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={handleInputKeyDown}
          placeholder="Type a command or search tasks…"
          className="border-surface-700 bg-surface-800 text-surface-100 placeholder-surface-500 w-full border-b px-4 py-3 text-sm focus:outline-none"
        />

        <div className="max-h-80 overflow-y-auto p-1.5">
          {items.length === 0 && (
            <p className="text-surface-500 px-2.5 py-3 text-center text-xs">No matches</p>
          )}

          {filteredCommands.length > 0 && (
            <div className="space-y-0.5">
              {filteredCommands.map((command) => {
                const index = items.findIndex(
                  (item) => item.type === 'command' && item.command.id === command.id,
                )
                return (
                  <button
                    key={command.id}
                    type="button"
                    tabIndex={-1}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runItem({ type: 'command', command })}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                      index === activeIndex ? 'bg-surface-700 text-surface-100' : 'text-surface-300'
                    }`}
                  >
                    <span>{command.label}</span>
                    {command.hint && (
                      <kbd className="border-surface-600 bg-surface-700 text-surface-400 rounded border px-1.5 py-0.5 font-mono text-[11px]">
                        {command.hint}
                      </kbd>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {taskResults.length > 0 && (
            <div className="border-surface-700 mt-1.5 space-y-0.5 border-t pt-1.5">
              {taskResults.map((task) => {
                const index = items.findIndex(
                  (item) => item.type === 'task' && item.task.id === task.id,
                )
                return (
                  <button
                    key={task.id}
                    type="button"
                    tabIndex={-1}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runItem({ type: 'task', task })}
                    className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                      index === activeIndex ? 'bg-surface-700 text-surface-100' : 'text-surface-300'
                    }`}
                  >
                    {task.title}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
