export interface Task {
  id: string
  title: string
  description: string
  tags: string[]
  dueDate: string | null
  completed: boolean
  archived: boolean
  createdAt: string
  updatedAt: string
  linkedTaskIds: string[]
}

export interface Tag {
  id: string
  label: string
  color: string // Tailwind class string
}
