'use client'

import type { Tag, Task } from '@/lib/types'
import TagBadge from './TagBadge'
import { formatDueDate, getDueStatus } from '@/lib/dates'

interface TaskCardProps {
  task: Task
  tags: Tag[]
  isSelected: boolean
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  selectMode?: boolean
  checked?: boolean
}

export default function TaskCard({
  task,
  tags,
  isSelected,
  onClick,
  onContextMenu,
  selectMode,
  checked,
}: TaskCardProps) {
  const preview = task.description
    .replace(/<[^>]*>/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[#*`_~[\]>]/g, '')
    .replace(/\n+/g, ' ')
    .trim()

  const dueStatus = getDueStatus(task.dueDate, task.completed)

  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`w-full rounded-lg border p-3 text-left transition-colors ${
        isSelected
          ? 'border-surface-400 bg-surface-700'
          : 'border-surface-700 bg-surface-800 hover:border-surface-600 hover:bg-surface-700/50'
      } ${task.completed ? 'opacity-55' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {selectMode && (
            <span
              role="checkbox"
              aria-checked={checked ?? false}
              className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                checked ? 'border-accent-500 bg-accent-500' : 'border-surface-500'
              }`}
            >
              {checked && (
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-surface-900"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </span>
          )}
          <span
            className={`text-sm leading-snug font-medium ${
              task.completed ? 'text-surface-400 line-through' : 'text-surface-100'
            }`}
          >
            {task.title}
          </span>
        </div>
      </div>

      {(task.tags.length > 0 || task.dueDate) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {task.tags.map((tagId) => {
            const tag = tags.find((t) => t.id === tagId)
            return tag ? <TagBadge key={tagId} tag={tag} size="sm" /> : null
          })}
          {task.dueDate && (
            <span
              className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium ${
                dueStatus === 'overdue'
                  ? 'border-red-500 bg-red-950 text-red-300'
                  : dueStatus === 'today'
                    ? 'border-amber-500 bg-amber-950 text-amber-300'
                    : 'border-surface-600 bg-surface-700 text-surface-300'
              }`}
            >
              {formatDueDate(task.dueDate)}
            </span>
          )}
        </div>
      )}

      {preview && (
        <p className="text-surface-400 mt-1.5 line-clamp-2 text-xs leading-relaxed">{preview}</p>
      )}
    </button>
  )
}
