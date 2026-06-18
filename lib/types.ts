export interface TaskUrl {
  id: string
  url: string
  label: string
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
