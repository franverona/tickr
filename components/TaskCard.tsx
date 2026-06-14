'use client'

import type { Tag, Task } from '@/lib/types'
import TagBadge from './TagBadge'

interface TaskCardProps {
  task: Task
  tags: Tag[]
  isSelected: boolean
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export default function TaskCard({
  task,
  tags,
  isSelected,
  onClick,
  onContextMenu,
}: TaskCardProps) {
  const preview = task.description
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#*`_~[\]>]/g, '')
    .replace(/\n+/g, ' ')
    .trim()

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
        <span
          className={`text-sm leading-snug font-medium ${
            task.completed ? 'text-surface-400 line-through' : 'text-surface-100'
          }`}
        >
          {task.title}
        </span>
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
        <p className="text-surface-400 mt-1.5 line-clamp-2 text-xs leading-relaxed">{preview}</p>
      )}
    </button>
  )
}
