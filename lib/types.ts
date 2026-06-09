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
  createdAt: string
  updatedAt: string
  linkedTaskIds: string[]
  urls: TaskUrl[]
}

export interface Tag {
  id: string
  label: string
  color: string // Tailwind class string
}
