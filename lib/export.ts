import type { Tag, Task } from './types'

export function exportToJSON(tasks: Task[], tags: Tag[]): string {
  const tagMap = new Map(tags.map((t) => [t.id, t.label]))
  const data = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    tags: task.tags.map((id) => tagMap.get(id) ?? id),
    dueDate: task.dueDate,
    completed: task.completed,
    archived: task.archived,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }))
  return JSON.stringify(data, null, 2)
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return '"' + value.replace(/"/g, '""') + '"'
  return value
}

export function exportToCSV(tasks: Task[], tags: Tag[]): string {
  const tagMap = new Map(tags.map((t) => [t.id, t.label]))
  const headers = ['Title', 'Tags', 'Due Date', 'Status', 'Description', 'Created At', 'Updated At']
  const rows = tasks.map((task) => {
    const status = task.archived ? 'Archived' : task.completed ? 'Completed' : 'Active'
    const tagLabels = task.tags.map((id) => tagMap.get(id) ?? id).join('; ')
    return [
      task.title,
      tagLabels,
      task.dueDate ?? '',
      status,
      task.description,
      task.createdAt,
      task.updatedAt,
    ]
      .map(csvCell)
      .join(',')
  })
  return [headers.join(','), ...rows].join('\n')
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
