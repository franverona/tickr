import type { Tag } from '@/lib/types'

interface TagBadgeProps {
  tag: Tag
  size?: 'sm' | 'md'
}

export default function TagBadge({ tag, size = 'md' }: TagBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${tag.color} ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
      }`}
    >
      {tag.label}
    </span>
  )
}
