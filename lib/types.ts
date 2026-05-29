export interface Task {
  id: string
  title: string
  description: string
  tags: string[]
  dueDate: string | null
  completed: boolean
  createdAt: string
  updatedAt: string
}

export interface Tag {
  id: string
  label: string
  color: string // Tailwind class string
}
