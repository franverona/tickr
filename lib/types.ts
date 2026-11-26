// Review state of an MR/PR link; absent means still in review
export type LinkStatus = 'draft' | 'merged' | 'closed'

export function isLinkStatus(value: unknown): value is LinkStatus {
  return value === 'draft' || value === 'merged' || value === 'closed'
}

export interface TaskUrl {
  id: string
  url: string
  label: string
  status?: LinkStatus
}

export interface Task {
  id: string
  title: string
  description: string
  tags: string[]
  completed: boolean
  archived: boolean
  dueDate: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  archivedAt: string | null
  urls: TaskUrl[]
}

export interface Tag {
  id: string
  label: string
  color: string // Tailwind class string
}
