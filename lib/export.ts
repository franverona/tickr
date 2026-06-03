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

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function extractImagePaths(tasks: Task[]): string[] {
  const paths = new Set<string>()
  const regex = /\/uploads\/[\w.-]+/g
  for (const task of tasks) {
    const matches = task.description.match(regex)
    if (matches) matches.forEach((p) => paths.add(p))
  }
  return [...paths]
}

export async function exportToZip(
  tasks: Task[],
  tags: Tag[],
  format: 'json' | 'csv',
): Promise<void> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  // Rewrite absolute /uploads/ paths to relative uploads/ so the ZIP is self-contained
  const rawContent = format === 'json' ? exportToJSON(tasks, tags) : exportToCSV(tasks, tags)
  zip.file(`tasks.${format}`, rawContent.replace(/\/uploads\//g, 'uploads/'))

  const imagePaths = extractImagePaths(tasks)
  if (imagePaths.length > 0) {
    const uploadsFolder = zip.folder('uploads')!
    await Promise.all(
      imagePaths.map(async (imagePath) => {
        try {
          const res = await fetch(imagePath)
          if (res.ok) {
            uploadsFolder.file(imagePath.split('/').pop()!, await res.arrayBuffer())
          }
        } catch {
          // skip images that can't be fetched
        }
      }),
    )
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const date = new Date().toISOString().split('T')[0]
  downloadBlob(blob, `tickr-tasks-${date}.zip`)
}
