import type { Tag, Task } from './types'

export function exportToJSON(tasks: Task[], tags: Tag[]): string {
  const tagMap = new Map(tags.map((t) => [t.id, t]))
  const data = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    tags: task.tags.map((id) => {
      const tag = tagMap.get(id)
      return tag ? { label: tag.label, color: tag.color } : { label: id, color: '' }
    }),
    completed: task.completed,
    archived: task.archived,
    dueDate: task.dueDate,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
    archivedAt: task.archivedAt,
    links: task.urls.map((u) => ({ url: u.url, label: u.label })),
  }))
  return JSON.stringify(data, null, 2)
}

// Written next to the task file because tasks only carry the tags they use:
// without this a restore loses every unused tag, in either format.
export function exportTagsToJSON(tags: Tag[]): string {
  return JSON.stringify(
    tags.map(({ label, color }) => ({ label, color })),
    null,
    2,
  )
}

function csvCell(raw: string): string {
  // Spreadsheets run cells starting with these as formulas; parseCSVContent
  // removes the guard. A leading ' is guarded too, so that round trip is exact.
  const value = /^[=+\-@\t\r']/.test(raw) ? `'${raw}` : raw
  if (/[",\n\r]/.test(value)) return '"' + value.replace(/"/g, '""') + '"'
  return value
}

// List cells join entries with "; " and split each "label::value" on the
// first "::", so backslash-escape those delimiters inside labels and values
const escapeLabel = (s: string) => s.replace(/[\\;:]/g, '\\$&')
const escapeValue = (s: string) => s.replace(/[\\;]/g, '\\$&')

export function exportToCSV(tasks: Task[], tags: Tag[]): string {
  const tagMap = new Map(tags.map((t) => [t.id, t]))
  const headers = [
    'Title',
    'Tags',
    'Status',
    'Completed',
    'Archived',
    'Due Date',
    'Description',
    'Created At',
    'Updated At',
    'Completed At',
    'Archived At',
    'Links',
  ]
  const rows = tasks.map((task) => {
    const status = task.archived ? 'Archived' : task.completed ? 'Completed' : 'Active'
    const tagCells = task.tags
      .map((id) => {
        const tag = tagMap.get(id)
        return tag ? `${escapeLabel(tag.label)}::${escapeValue(tag.color)}` : escapeLabel(id)
      })
      .join('; ')
    const linkCells = task.urls
      .map((u) => `${escapeLabel(u.label)}::${escapeValue(u.url)}`)
      .join('; ')
    return [
      task.title,
      tagCells,
      status,
      String(task.completed),
      String(task.archived),
      task.dueDate ?? '',
      task.description,
      task.createdAt,
      task.updatedAt,
      task.completedAt ?? '',
      task.archivedAt ?? '',
      linkCells,
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

// Only local paths: /uploads/ at the start of a line or after whitespace, (, a
// quote, [ or <. Leaves other hosts' URLs (e.g. GitLab's /proj/uploads/…) alone.
const LOCAL_UPLOAD_RE = /(?<=^|[\s("'[<])\/uploads\/([\w.-]+)/gm

/** Rewrites local /uploads/ paths to relative uploads/ so the ZIP is self-contained */
export function relativizeUploads(description: string): string {
  return description.replace(LOCAL_UPLOAD_RE, 'uploads/$1')
}

/** `/uploads/<file>` paths the task descriptions link to (what the ZIP bundles) */
export function referencedUploads(tasks: Task[]): string[] {
  const paths = new Set<string>()
  for (const task of tasks) {
    for (const [, filename] of task.description.matchAll(LOCAL_UPLOAD_RE)) {
      paths.add(`/uploads/${filename}`)
    }
  }
  return [...paths]
}

// Returns the attachments that couldn't be included
export async function exportToZip(
  tasks: Task[],
  tags: Tag[],
  format: 'json' | 'csv',
): Promise<string[]> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  // Rewritten before serializing: in JSON a newline becomes a literal \n, which
  // would hide the start-of-line boundary from LOCAL_UPLOAD_RE
  const archived = tasks.map((t) => ({ ...t, description: relativizeUploads(t.description) }))
  const content = format === 'json' ? exportToJSON(archived, tags) : exportToCSV(archived, tags)
  zip.file(`tasks.${format}`, content)
  zip.file('tags.json', exportTagsToJSON(tags))

  const skipped: string[] = []
  const imagePaths = referencedUploads(tasks)
  if (imagePaths.length > 0) {
    const uploadsFolder = zip.folder('uploads')!
    await Promise.all(
      imagePaths.map(async (imagePath) => {
        const name = imagePath.split('/').pop()!
        try {
          const res = await fetch(imagePath)
          if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`)
          uploadsFolder.file(name, await res.arrayBuffer())
        } catch {
          skipped.push(name)
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
  return skipped
}
