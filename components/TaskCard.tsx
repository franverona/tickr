'use client'

import { forwardRef } from 'react'
import type { Tag, Task } from '@/lib/types'
import TagBadge from './TagBadge'
import { formatDueDate, formatTimestamp, getDueStatus } from '@/lib/dates'
import { checklistProgress } from '@/lib/checklist'
import { ticketLabel } from '@/lib/suggestLabel'

interface TaskCardProps {
  task: Task
  tags: Tag[]
  isSelected: boolean
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void
  selectMode?: boolean
  checked?: boolean
  tabIndex?: number
  showStatus?: boolean
  compact?: boolean
  onToggleComplete?: () => void
}

const TaskCard = forwardRef<HTMLButtonElement, TaskCardProps>(function TaskCard(
  {
    task,
    tags,
    isSelected,
    onClick,
    onContextMenu,
    onKeyDown,
    selectMode,
    checked,
    tabIndex,
    showStatus,
    compact,
    onToggleComplete,
  },
  ref,
) {
  const preview = task.description
    .replace(/<[^>]*>/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[#*`_~[\]>]/g, '')
    .replace(/\n+/g, ' ')
    .trim()

  const dueStatus = getDueStatus(task.dueDate, task.completed)
  const doneAt = task.completed ? task.completedAt : null
  const checklist = checklistProgress(task.description)
  // Hidden while selecting, so every click on a card toggles it
  const tickets = selectMode
    ? []
    : [
        ...new Map(
          task.urls.flatMap((u) => {
            const label = ticketLabel(u.url)
            return label ? [[u.url, label] as const] : []
          }),
        ).entries(),
      ]

  return (
    <div className="group/card relative h-full">
      <button
        ref={ref}
        tabIndex={tabIndex}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        className={`flex h-full w-full flex-col rounded-lg border text-left transition-colors ${
          compact ? 'px-3 py-2' : 'p-3'
        } ${onToggleComplete ? 'pr-8' : ''} ${tickets.length > 0 ? 'pb-8' : ''} ${
          dueStatus === 'overdue'
            ? 'border-l-2 border-l-red-500'
            : dueStatus === 'today'
              ? 'border-l-2 border-l-amber-500'
              : ''
        } ${
          isSelected
            ? 'border-surface-400 bg-surface-700'
            : 'border-surface-700 bg-surface-800 hover:border-surface-600 hover:bg-surface-700/50'
        }`}
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
                task.completed ? 'text-surface-300' : 'text-surface-100'
              } ${compact ? 'line-clamp-2' : ''}`}
            >
              {task.title}
            </span>
          </div>
        </div>

        {(task.tags.length > 0 ||
          checklist.total > 0 ||
          task.dueDate ||
          doneAt ||
          (showStatus && (task.archived || task.completed))) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {showStatus && (task.archived || task.completed) && (
              <span className="border-surface-600 bg-surface-700 text-surface-300 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium">
                {task.archived ? 'Archived' : 'Done'}
              </span>
            )}
            {task.tags.map((tagId) => {
              const tag = tags.find((t) => t.id === tagId)
              return tag ? <TagBadge key={tagId} tag={tag} size="sm" /> : null
            })}
            {checklist.total > 0 && (
              <span
                title={`${checklist.done} of ${checklist.total} checklist items done`}
                className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium ${
                  checklist.done === checklist.total
                    ? 'border-emerald-600 bg-emerald-950 text-emerald-300'
                    : 'border-surface-600 bg-surface-700 text-surface-300'
                }`}
              >
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {checklist.done}/{checklist.total}
              </span>
            )}
            {doneAt ? (
              <span className="border-surface-600 bg-surface-700 text-surface-300 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium">
                Done {formatTimestamp(doneAt)}
              </span>
            ) : task.dueDate ? (
              <span
                className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium ${
                  dueStatus === 'overdue'
                    ? 'border-red-500 bg-red-950 text-red-300'
                    : dueStatus === 'today'
                      ? 'border-amber-500 bg-amber-950 text-amber-300'
                      : dueStatus === 'soon'
                        ? 'border-sky-500 bg-sky-950 text-sky-300'
                        : 'border-surface-600 bg-surface-700 text-surface-300'
                }`}
              >
                {formatDueDate(task.dueDate)}
              </span>
            ) : null}
          </div>
        )}

        {preview && !compact && (
          <p className="text-surface-400 mt-1.5 line-clamp-2 text-xs leading-relaxed">{preview}</p>
        )}
      </button>
      {tickets.length > 0 && (
        // Siblings of the card like the complete button: a link can't sit
        // inside a <button>, and clicking one mustn't open the task
        <div className="absolute right-3 bottom-2 left-3 flex gap-1 overflow-hidden">
          {tickets.map(([url, label]) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              tabIndex={tabIndex}
              draggable={false}
              title={url}
              aria-label={`Open ${label}`}
              className="border-surface-600 bg-surface-700 text-surface-200 hover:border-surface-400 hover:text-surface-100 inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium transition-colors"
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              {label}
            </a>
          ))}
        </div>
      )}
      {onToggleComplete && (
        // A sibling of the card, since a <button> can't contain another one
        <button
          onClick={onToggleComplete}
          tabIndex={tabIndex}
          aria-label={task.completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
          title={task.completed ? 'Reopen' : 'Mark complete'}
          className={`absolute top-2 right-2 flex h-4.5 w-4.5 items-center justify-center rounded-full border transition-colors group-hover/card:opacity-100 focus:opacity-100 pointer-coarse:opacity-100 ${
            task.completed
              ? 'border-emerald-600 bg-emerald-700 text-emerald-100'
              : 'border-surface-500 text-surface-400 opacity-0 hover:border-emerald-500 hover:text-emerald-400'
          }`}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      )}
    </div>
  )
})

export default TaskCard
