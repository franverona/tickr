import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCSVContent, parseCSVRows, parseJSONContent, processImportZip } from '../lib/import'

const HEADER_WITH_DUE = 'Title,Tags,Status,Due Date,Description,Created At,Updated At'

describe('parseCSVRows', () => {
  it('parses a simple two-column row', () => {
    expect(parseCSVRows('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('handles a quoted field containing a comma', () => {
    expect(parseCSVRows('"hello, world",b')).toEqual([['hello, world', 'b']])
  })

  it('handles escaped double-quotes inside a quoted field', () => {
    expect(parseCSVRows('"say ""hi""",b')).toEqual([['say "hi"', 'b']])
  })

  it('handles a quoted field spanning multiple lines', () => {
    expect(parseCSVRows('"line one\nline two",b')).toEqual([['line one\nline two', 'b']])
  })

  it('ignores trailing empty rows', () => {
    const rows = parseCSVRows('a,b\n')
    expect(rows).toHaveLength(1)
  })
})

describe('parseJSONContent', () => {
  it('keeps valid timestamps and drops unparseable ones', () => {
    const json = JSON.stringify([
      {
        title: 'A',
        createdAt: '2024-01-01T10:00:00.000Z',
        updatedAt: 'not a date',
        archivedAt: null,
      },
    ])
    const [task] = parseJSONContent(json)
    expect(task.createdAt).toBe('2024-01-01T10:00:00.000Z')
    expect(task.updatedAt).toBeUndefined()
    expect(task.archivedAt).toBeUndefined()
  })

  it('parses a valid task array', () => {
    const json = JSON.stringify([{ title: 'Task A', description: 'desc', tags: ['WIP'] }])
    const result = parseJSONContent(json)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Task A')
    expect(result[0].tags).toEqual([{ label: 'WIP', color: '' }])
  })

  it('parses tags with colors from the current export format', () => {
    const json = JSON.stringify([
      { title: 'Task A', tags: [{ label: 'WIP', color: 'bg-blue-600' }] },
    ])
    const result = parseJSONContent(json)
    expect(result[0].tags).toEqual([{ label: 'WIP', color: 'bg-blue-600' }])
  })

  it('keeps the exported id so mentions can be re-linked, and omits it when absent', () => {
    const json = JSON.stringify([{ id: 'abc', title: 'Task A' }, { title: 'Task B' }])
    const result = parseJSONContent(json)
    expect(result[0].id).toBe('abc')
    expect(result[1]).not.toHaveProperty('id')
  })

  it('parses links', () => {
    const json = JSON.stringify([
      { title: 'Task A', links: [{ url: 'https://example.com', label: 'Example' }] },
    ])
    const result = parseJSONContent(json)
    expect(result[0].links).toEqual([{ url: 'https://example.com', label: 'Example' }])
  })

  it('defaults links to an empty array when absent', () => {
    const result = parseJSONContent(JSON.stringify([{ title: 'Task A' }]))
    expect(result[0].links).toEqual([])
  })

  it('filters out items with an empty or missing title', () => {
    const json = JSON.stringify([{ title: '' }, { title: 'Keep' }, { description: 'no title' }])
    const result = parseJSONContent(json)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Keep')
  })

  it('defaults completed and archived to false when absent', () => {
    const json = JSON.stringify([{ title: 'T' }])
    const result = parseJSONContent(json)
    expect(result[0].completed).toBe(false)
    expect(result[0].archived).toBe(false)
    expect(result[0].dueDate).toBeNull()
  })

  it('parses a valid ISO due date', () => {
    const json = JSON.stringify([{ title: 'T', dueDate: '2024-02-15' }])
    const result = parseJSONContent(json)
    expect(result[0].dueDate).toBe('2024-02-15')
  })

  it('discards an invalid due date', () => {
    const json = JSON.stringify([{ title: 'T', dueDate: 'not-a-date' }])
    const result = parseJSONContent(json)
    expect(result[0].dueDate).toBeNull()
  })

  it.each(['2025-13-45', '2025-02-30', '2025-00-10'])(
    'discards %s, which has the right shape but is not a real date',
    (dueDate) => {
      expect(parseJSONContent(JSON.stringify([{ title: 'T', dueDate }]))[0].dueDate).toBeNull()
      const csv = [HEADER_WITH_DUE, `Task one,,Active,${dueDate},,,`].join('\n')
      expect(parseCSVContent(csv)[0].dueDate).toBeNull()
    },
  )

  it('throws when the input is not an array', () => {
    expect(() => parseJSONContent(JSON.stringify({ title: 'oops' }))).toThrow()
  })
})

describe('parseCSVContent', () => {
  const HEADER = 'Title,Tags,Status,Description,Created At,Updated At'

  it('keeps timestamps, normalized to ISO strings', () => {
    const csv = [
      'Title,Status,Created At,Updated At,Completed At,Archived At',
      'Done,Completed,2024-01-01T10:00:00.000Z,2024-01-02,2024-01-03T00:00:00Z,',
    ].join('\n')
    const [task] = parseCSVContent(csv)
    expect(task.createdAt).toBe('2024-01-01T10:00:00.000Z')
    expect(task.updatedAt).toBe('2024-01-02T00:00:00.000Z')
    expect(task.completedAt).toBe('2024-01-03T00:00:00.000Z')
    expect(task.archivedAt).toBeUndefined()
  })

  it('parses basic rows correctly', () => {
    const csv = [HEADER, 'Task one,WIP,Active,desc,2024-01-01,2024-01-01'].join('\n')
    const result = parseCSVContent(csv)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Task one')
    expect(result[0].tags).toEqual([{ label: 'WIP', color: '' }])
    expect(result[0].completed).toBe(false)
    expect(result[0].archived).toBe(false)
  })

  it('maps "Completed" status to completed=true', () => {
    const csv = [HEADER, 'T,,Completed,,,'].join('\n')
    const result = parseCSVContent(csv)
    expect(result[0].completed).toBe(true)
    expect(result[0].archived).toBe(false)
  })

  it('maps "Archived" status to archived=true', () => {
    const csv = [HEADER, 'T,,Archived,,,'].join('\n')
    const result = parseCSVContent(csv)
    expect(result[0].archived).toBe(true)
    expect(result[0].completed).toBe(false)
  })

  it('splits semicolon-separated tags', () => {
    const csv = [HEADER, 'T,WIP; Blocked,Active,,,'].join('\n')
    const result = parseCSVContent(csv)
    expect(result[0].tags).toEqual([
      { label: 'WIP', color: '' },
      { label: 'Blocked', color: '' },
    ])
  })

  it('parses tag colors encoded as "label::color"', () => {
    const csv = [HEADER, 'T,WIP::bg-blue-600,Active,,,'].join('\n')
    const result = parseCSVContent(csv)
    expect(result[0].tags).toEqual([{ label: 'WIP', color: 'bg-blue-600' }])
  })

  it('parses a Links column encoded as "label::url"', () => {
    const header = 'Title,Tags,Status,Description,Created At,Updated At,Links'
    const csv = [header, 'T,,Active,,,,Example::https://example.com'].join('\n')
    const result = parseCSVContent(csv)
    expect(result[0].links).toEqual([{ url: 'https://example.com', label: 'Example' }])
  })

  it('defaults links to an empty array when the Links column is missing', () => {
    const result = parseCSVContent([HEADER, 'T,,Active,,,'].join('\n'))
    expect(result[0].links).toEqual([])
  })

  it('skips rows with an empty title', () => {
    const csv = [HEADER, ',tag,Active,,', 'Real task,,,Active,,'].join('\n')
    const result = parseCSVContent(csv)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Real task')
  })

  it('throws when the Title column is missing', () => {
    expect(() => parseCSVContent('Name,Tags\nfoo,bar')).toThrow(/Title/)
  })

  it('returns empty array for CSV with only a header', () => {
    expect(parseCSVContent(HEADER)).toEqual([])
  })

  it('parses a due date column when present', () => {
    const csv = [HEADER_WITH_DUE, 'Task one,,Active,2024-02-15,,,'].join('\n')
    const result = parseCSVContent(csv)
    expect(result[0].dueDate).toBe('2024-02-15')
  })

  it('treats a missing Due Date column as no due date', () => {
    const result = parseCSVContent([HEADER, 'Task one,,Active,,,'].join('\n'))
    expect(result[0].dueDate).toBeNull()
  })
})

describe('processImportZip', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects when an attachment fails to upload', async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('tasks.json', JSON.stringify([{ title: 'T' }]))
    zip.file('uploads/a.png', 'png bytes')
    const zipFile = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'backup.zip')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    )

    await expect(processImportZip(zipFile)).rejects.toThrow("Couldn't upload 1 attachment (a.png)")
  })

  async function zipOf(files: Record<string, string>) {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    for (const [name, content] of Object.entries(files)) zip.file(name, content)
    return new File([await zip.generateAsync({ type: 'arraybuffer' })], 'backup.zip')
  }

  it('uploads nothing when the task file is invalid', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const file = await zipOf({ 'tasks.json': 'not json', 'uploads/a.png': 'png' })

    await expect(processImportZip(file)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a ZIP with too many attachments before uploading', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const files: Record<string, string> = { 'tasks.json': '[]' }
    for (let i = 0; i <= 5000; i++) files[`uploads/${i}.png`] = ''

    await expect(processImportZip(await zipOf(files))).rejects.toThrow('too many attachments')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // Rewrites the uncompressed size in the local and central headers of entries
  // declaring `from` bytes, as a crafted ZIP would
  function redeclareSize(buf: ArrayBuffer, from: number, to: number): ArrayBuffer {
    const view = new DataView(buf)
    for (let i = 0; i + 28 <= buf.byteLength; i++) {
      const sig = view.getUint32(i, true)
      const at = sig === 0x04034b50 ? i + 22 : sig === 0x02014b50 ? i + 24 : -1
      if (at !== -1 && view.getUint32(at, true) === from) view.setUint32(at, to, true)
    }
    return buf
  }

  it('stops inflating an attachment that is larger than it declares', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('tasks.json', '[]')
    // 30 MB of zeros compresses to ~30 KB, and declares 1 byte
    zip.file('uploads/a.png', new Uint8Array(30 * 1024 * 1024))
    const buf = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
    const file = new File([redeclareSize(buf, 30 * 1024 * 1024, 1)], 'backup.zip')

    await expect(processImportZip(file)).rejects.toThrow('too large')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a task file over the size cap', async () => {
    const big = JSON.stringify([{ title: 'T', description: 'x'.repeat(21 * 1024 * 1024) }])
    await expect(processImportZip(await zipOf({ 'tasks.json': big }))).rejects.toThrow('too large')
  })

  it('skips entries of unsupported types', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const file = await zipOf({ 'tasks.json': '[]', 'uploads/evil.exe': 'x' })

    await expect(processImportZip(file)).resolves.toEqual({ tasks: [], tags: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('re-uploads non-image attachments and rewrites their links', async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file(
      'tasks.json',
      JSON.stringify([{ title: 'T', description: '[spec](uploads/old.pdf) ![a](uploads/a.png)' }]),
    )
    zip.file('uploads/old.pdf', 'pdf bytes')
    zip.file('uploads/a.png', 'png bytes')
    const zipFile = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'backup.zip')

    const uploadedTypes: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: FormData }) => {
        const file = init.body.get('file') as File
        uploadedTypes.push(file.type)
        return Response.json({ url: `/uploads/new-${file.name}` })
      }),
    )

    const {
      tasks: [task],
      tags,
    } = await processImportZip(zipFile)
    expect(tags).toEqual([])

    expect(uploadedTypes.sort()).toEqual(['application/pdf', 'image/png'])
    expect(task.description).toBe('[spec](/uploads/new-old.pdf) ![a](/uploads/new-a.png)')
  })
})
