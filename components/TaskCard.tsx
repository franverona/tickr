'use client'

import type { Tag, Task } from '@/lib/types'
import TagBadge from './TagBadge'

interface TaskCardProps {
  task: Task
  tags: Tag[]
  isSelected: boolean
  onClick: () => void
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export default function TaskCard({ task, tags, isSelected, onClick }: TaskCardProps) {
  const today = new Date().toISOString().split('T')[0]
  const isOverdue = task.dueDate && task.dueDate < today && !task.completed

  const preview = task.description
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#*`_~[\]>]/g, '')
    .replace(/\n+/g, ' ')
    .trim()

  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border p-3 text-left transition-colors ${
        isSelected
          ? 'border-zinc-400 bg-zinc-700'
          : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600 hover:bg-zinc-700/50'
      } ${task.completed ? 'opacity-55' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`text-sm leading-snug font-medium ${
            task.completed ? 'text-zinc-400 line-through' : 'text-zinc-100'
          }`}
        >
          {task.title}
        </span>
        {task.dueDate && (
          <span
            className={`shrink-0 text-xs tabular-nums ${
              isOverdue ? 'font-semibold text-red-400' : 'text-zinc-400'
            }`}
          >
            {isOverdue && '⚠ '}
            {formatDate(task.dueDate)}
          </span>
        )}
      </div>

      {task.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {task.tags.map((tagId) => {
            const tag = tags.find((t) => t.id === tagId)
            return tag ? <TagBadge key={tagId} tag={tag} size="sm" /> : null
          })}
        </div>
      )}

      {preview && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-400">{preview}</p>
      )}
    </button>
  )
}
