export interface ImportedTask {
  title: string
  description: string
  tagLabels: string[]
  completed: boolean
  archived: boolean
}

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

async function uploadImage(filename: string, data: ArrayBuffer): Promise<string | null> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const mimeType = EXT_TO_MIME[ext]
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
    .map((item: unknown, i: number) => {
      if (typeof item !== 'object' || item === null) throw new Error(`Item ${i} is not an object`)
      const t = item as Record<string, unknown>
      const title = typeof t.title === 'string' ? t.title.trim() : ''
      if (!title) return null

      return {
        title,
        description: typeof t.description === 'string' ? t.description : '',
        tagLabels: Array.isArray(t.tags)
          ? t.tags.filter((x): x is string => typeof x === 'string')
          : [],
        completed: t.completed === true,
        archived: t.archived === true,
      }
    })
    .filter((t): t is ImportedTask => t !== null)
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

  return rows
    .slice(1)
    .map((row) => {
      const title = row[titleIdx]?.trim() ?? ''
      if (!title) return null
      const status = statusIdx !== -1 ? (row[statusIdx] ?? '').toLowerCase() : 'active'

      return {
        title,
        description: descIdx !== -1 ? (row[descIdx] ?? '') : '',
        tagLabels:
          tagsIdx !== -1 && row[tagsIdx]
            ? row[tagsIdx]
                .split(';')
                .map((t) => t.trim())
                .filter(Boolean)
            : [],
        completed: status === 'completed',
        archived: status === 'archived',
      }
    })
    .filter((t): t is ImportedTask => t !== null)
}

export async function processImportZip(file: File): Promise<ImportedTask[]> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(file)

  // Upload images from uploads/ and build old-filename → new-url mapping
  const imageMapping = new Map<string, string>()
  const uploadsFolder = zip.folder('uploads')
  if (uploadsFolder) {
    const jobs: Promise<void>[] = []
    uploadsFolder.forEach((relativePath, entry) => {
      if (entry.dir) return
      jobs.push(
        entry.async('arraybuffer').then(async (data) => {
          const newUrl = await uploadImage(relativePath, data)
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
