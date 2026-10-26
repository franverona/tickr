import { UPLOAD_EXT_TO_MIME } from './upload-types'

export interface ImportedTag {
  label: string
  color: string
}

export interface ImportedLink {
  url: string
  label: string
}

export interface ImportedTask {
  /** Id in the exported data, only used to re-link `#id` mentions on import */
  id?: string
  title: string
  description: string
  tags: ImportedTag[]
  completed: boolean
  archived: boolean
  dueDate: string | null
  links: ImportedLink[]
  // Missing or unparseable timestamps fall back to the import time
  createdAt?: string
  updatedAt?: string
  completedAt?: string
  archivedAt?: string
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Normalized with toISOString: the Done/Archived tabs sort these as strings
function parseTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString()
}

async function uploadFile(filename: string, data: ArrayBuffer): Promise<string | null> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const mimeType = UPLOAD_EXT_TO_MIME[ext]
  if (!mimeType) return null

  const file = new File([data], filename, { type: mimeType })
  const body = new FormData()
  body.append('file', file)

  try {
    const res = await fetch('/api/upload', { method: 'POST', body })
    if (!res.ok) return null
    const { url } = await res.json()
    return url as string
  } catch {
    return null
  }
}

// Minimal RFC 4180 CSV parser
export function parseCSVRows(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < content.length) {
    const ch = content[i]
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(field)
        field = ''
      } else if (ch === '\n') {
        row.push(field)
        rows.push(row)
        row = []
        field = ''
      } else if (ch !== '\r') {
        field += ch
      }
    }
    i++
  }

  if (field || row.length > 0) {
    row.push(field)
    if (row.some((c) => c.trim())) rows.push(row)
  }

  return rows
}

export function parseJSONContent(content: string): ImportedTask[] {
  const data = JSON.parse(content)
  if (!Array.isArray(data)) throw new Error('Expected a JSON array')

  return data
    .map((item: unknown, i: number): ImportedTask | null => {
      if (typeof item !== 'object' || item === null) throw new Error(`Item ${i} is not an object`)
      const t = item as Record<string, unknown>
      const title = typeof t.title === 'string' ? t.title.trim() : ''
      if (!title) return null

      return {
        ...(typeof t.id === 'string' && t.id ? { id: t.id } : {}),
        title,
        description: typeof t.description === 'string' ? t.description : '',
        tags: Array.isArray(t.tags)
          ? t.tags.map(parseTagEntry).filter((x): x is ImportedTag => x !== null)
          : [],
        completed: t.completed === true,
        archived: t.archived === true,
        dueDate: typeof t.dueDate === 'string' && ISO_DATE_RE.test(t.dueDate) ? t.dueDate : null,
        links: Array.isArray(t.links)
          ? t.links.map(parseLinkEntry).filter((x): x is ImportedLink => x !== null)
          : [],
        createdAt: parseTimestamp(t.createdAt),
        updatedAt: parseTimestamp(t.updatedAt),
        completedAt: parseTimestamp(t.completedAt),
        archivedAt: parseTimestamp(t.archivedAt),
      }
    })
    .filter((t): t is ImportedTask => t !== null)
}

// Accepts the legacy plain-string tag format and the current {label, color} object format
function parseTagEntry(entry: unknown): ImportedTag | null {
  if (typeof entry === 'string') {
    const label = entry.trim()
    return label ? { label, color: '' } : null
  }
  if (typeof entry === 'object' && entry !== null) {
    const e = entry as Record<string, unknown>
    const label = typeof e.label === 'string' ? e.label.trim() : ''
    if (!label) return null
    return { label, color: typeof e.color === 'string' ? e.color : '' }
  }
  return null
}

function parseLinkEntry(entry: unknown): ImportedLink | null {
  if (typeof entry !== 'object' || entry === null) return null
  const e = entry as Record<string, unknown>
  const url = typeof e.url === 'string' ? e.url.trim() : ''
  if (!url) return null
  return { url, label: typeof e.label === 'string' ? e.label.trim() : '' }
}

export function parseCSVContent(content: string): ImportedTask[] {
  const rows = parseCSVRows(content)
  if (rows.length < 2) return []

  const headers = rows[0].map((h) => h.toLowerCase().trim())
  const col = (name: string) => headers.indexOf(name)

  const titleIdx = col('title')
  if (titleIdx === -1) throw new Error('CSV is missing a "Title" column')

  const tagsIdx = col('tags')
  const statusIdx = col('status')
  const descIdx = col('description')
  const dueDateIdx = col('due date')
  const linksIdx = col('links')
  const cell = (row: string[], idx: number) => (idx !== -1 ? row[idx] : undefined)
  const createdIdx = col('created at')
  const updatedIdx = col('updated at')
  const completedAtIdx = col('completed at')
  const archivedAtIdx = col('archived at')
  // Older exports only have Status, which can't say "completed and archived"
  const completedIdx = col('completed')
  const archivedIdx = col('archived')

  return rows
    .slice(1)
    .map((row): ImportedTask | null => {
      const title = row[titleIdx]?.trim() ?? ''
      if (!title) return null
      const status = statusIdx !== -1 ? (row[statusIdx] ?? '').toLowerCase() : 'active'
      const dueDate = dueDateIdx !== -1 ? (row[dueDateIdx] ?? '').trim() : ''

      return {
        title,
        description: descIdx !== -1 ? (row[descIdx] ?? '') : '',
        tags: tagsIdx !== -1 ? parseCSVList(row[tagsIdx]).map(parseCSVTagCell) : [],
        completed:
          completedIdx !== -1
            ? row[completedIdx]?.trim().toLowerCase() === 'true'
            : status === 'completed',
        archived:
          archivedIdx !== -1
            ? row[archivedIdx]?.trim().toLowerCase() === 'true'
            : status === 'archived',
        dueDate: ISO_DATE_RE.test(dueDate) ? dueDate : null,
        links: linksIdx !== -1 ? parseCSVList(row[linksIdx]).map(parseCSVLinkCell) : [],
        createdAt: parseTimestamp(cell(row, createdIdx)),
        updatedAt: parseTimestamp(cell(row, updatedIdx)),
        completedAt: parseTimestamp(cell(row, completedAtIdx)),
        archivedAt: parseTimestamp(cell(row, archivedAtIdx)),
      }
    })
    .filter((t): t is ImportedTask => t !== null)
}

// Splits on `sep` wherever it isn't backslash-escaped (see exportToCSV);
// escapes are kept for unescapeCSV to remove afterwards
function splitUnescaped(s: string, sep: string): string[] {
  const parts: string[] = []
  let start = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') {
      i++
    } else if (s.startsWith(sep, i)) {
      parts.push(s.slice(start, i))
      start = i + sep.length
      i = start - 1
    }
  }
  parts.push(s.slice(start))
  return parts
}

const unescapeCSV = (s: string) => s.replace(/\\(.)/g, '$1')

function parseCSVList(cell: string | undefined): string[] {
  return cell
    ? splitUnescaped(cell, ';')
        .map((t) => t.trim())
        .filter(Boolean)
    : []
}

// Splits "label::value" on the first unescaped "::" (a URL may contain more)
function splitLabelValue(cell: string): [string, string] | null {
  const [label, ...rest] = splitUnescaped(cell, '::')
  return rest.length === 0 ? null : [unescapeCSV(label), unescapeCSV(rest.join('::'))]
}

// Cell format: "Label::color-classes" — legacy exports have no "::" and carry no color
function parseCSVTagCell(cell: string): ImportedTag {
  const parts = splitLabelValue(cell)
  return parts ? { label: parts[0], color: parts[1] } : { label: unescapeCSV(cell), color: '' }
}

// Cell format: "Label::url"
function parseCSVLinkCell(cell: string): ImportedLink {
  const parts = splitLabelValue(cell)
  return parts ? { url: parts[1], label: parts[0] } : { url: unescapeCSV(cell), label: '' }
}

export async function processImportZip(file: File): Promise<ImportedTask[]> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(file)

  // Upload attachments from uploads/ and build old-filename → new-url mapping
  const imageMapping = new Map<string, string>()
  const uploadsFolder = zip.folder('uploads')
  if (uploadsFolder) {
    const jobs: Promise<void>[] = []
    uploadsFolder.forEach((relativePath, entry) => {
      if (entry.dir) return
      jobs.push(
        entry.async('arraybuffer').then(async (data) => {
          const newUrl = await uploadFile(relativePath, data)
          if (newUrl) imageMapping.set(relativePath, newUrl)
        }),
      )
    })
    await Promise.all(jobs)
  }

  // Parse the data file
  const jsonFile = zip.file('tasks.json')
  const csvFile = zip.file('tasks.csv')
  if (!jsonFile && !csvFile) throw new Error('ZIP does not contain tasks.json or tasks.csv')

  let tasks: ImportedTask[]
  if (jsonFile) {
    tasks = parseJSONContent(await jsonFile.async('string'))
  } else {
    tasks = parseCSVContent(await csvFile!.async('string'))
  }

  // Rewrite image paths: uploads/filename.ext → /uploads/new-uuid.ext
  if (imageMapping.size > 0) {
    tasks = tasks.map((task) => ({
      ...task,
      description: task.description.replace(/uploads\/([\w.-]+)/g, (_, filename) => {
        return imageMapping.get(filename) ?? `uploads/${filename}`
      }),
    }))
  }

  return tasks
}
