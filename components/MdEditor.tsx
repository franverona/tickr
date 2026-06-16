'use client'

import dynamic from 'next/dynamic'

export function replaceImageWidth(markdown: string, src: string, newWidth: number): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Replace markdown image syntax: ![alt](url) or ![alt](url "title")
  let result = markdown.replace(
    new RegExp(`!\\[([^\\]]*)\\]\\(${esc(src)}(\\s+"[^"]*")?\\)`, 'g'),
    (_, alt) => `<img src="${src}" alt="${alt}" width="${newWidth}">`,
  )

  // Update or add width on existing HTML img tags referencing this src
  result = result.replace(/<img\b([^>]*)>/gi, (match, attrs: string) => {
    if (!attrs.includes(src)) return match
    if (/\bwidth\s*=/i.test(attrs)) {
      return `<img${attrs.replace(/\bwidth\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/i, `width="${newWidth}"`)}>`
    }
    return `<img${attrs} width="${newWidth}">`
  })

  return result
}

export const MDEditor = dynamic(() => import('@uiw/react-md-editor'), {
  ssr: false,
})

export function MarkdownLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} target="_blank" rel="noopener noreferrer" />
}

export const MDPreview = dynamic(() => import('@uiw/react-markdown-preview'), {
  ssr: false,
})

async function uploadFile(file: File): Promise<string> {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/api/upload', { method: 'POST', body })
  if (!res.ok) {
    const { error } = await res.json()
    throw new Error(error ?? 'Upload failed')
  }
  const { url } = await res.json()
  return url as string
}

function pickFiles(list: FileList | null): File[] {
  if (!list) return []
  return Array.from(list)
}

function insertAtCursor(textarea: HTMLTextAreaElement, text: string): string {
  const { value, selectionStart, selectionEnd } = textarea
  return value.slice(0, selectionStart) + text + value.slice(selectionEnd)
}

const URL_RE = /^https?:\/\/\S+$/

function wrapSelectionAsLink(textarea: HTMLTextAreaElement, url: string): string {
  const { value, selectionStart, selectionEnd } = textarea
  const selected = value.slice(selectionStart, selectionEnd)
  return value.slice(0, selectionStart) + `[${selected}](${url})` + value.slice(selectionEnd)
}

// Quote-aware delimited text parser (handles embedded delimiters/newlines in "quoted" fields).
function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  row.push(field)
  rows.push(row)

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

function detectTableDelimiter(text: string): '\t' | ',' | null {
  if (text.includes('\t')) return '\t'
  if (!text.includes(',')) return null
  // Only treat commas as delimiter when lines have a consistent column count —
  // prevents prose/code with commas from being mangled into a table.
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return null
  const c0 = lines[0].split(',').length
  if (c0 < 2) return null
  if (lines.slice(0, 20).some((l) => l.split(',').length !== c0)) return null
  return ','
}

function toMarkdownTable(text: string, delimiter: '\t' | ','): string | null {
  const rows = parseDelimitedRows(text, delimiter).map((cells) =>
    cells.map((cell) => cell.trim().replace(/\|/g, '\\|')),
  )
  if (rows.length < 2 || rows[0].length < 2) return null

  const formatRow = (cells: string[]) => `| ${cells.join(' | ')} |`
  const separator = rows[0].map(() => '---')
  return [formatRow(rows[0]), formatRow(separator), ...rows.slice(1).map(formatRow)].join('\n')
}

export function makeImageHandlers(setValue: React.Dispatch<React.SetStateAction<string>>) {
  async function handleFiles(files: File[], textarea: HTMLTextAreaElement) {
    for (const file of files) {
      const placeholder = `\`Uploading ${file.name}…\``
      setValue(insertAtCursor(textarea, placeholder))
      try {
        const url = await uploadFile(file)
        const isImage = file.type.startsWith('image/')
        const markdown = isImage ? `![${file.name}](${url})` : `[${file.name}](${url})`
        setValue((v) => v.replace(placeholder, markdown))
      } catch (err) {
        setValue((v) => v.replace(placeholder, ''))
        console.error('File upload failed:', err)
      }
    }
  }

  function onDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const files = pickFiles(e.dataTransfer.files)
    if (!files.length) return
    e.preventDefault()
    handleFiles(files, e.currentTarget)
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = pickFiles(e.clipboardData.files)
    if (files.length) {
      e.preventDefault()
      handleFiles(files, e.currentTarget)
      return
    }

    const textarea = e.currentTarget
    const text = e.clipboardData.getData('text').trim()
    if (URL_RE.test(text) && textarea.selectionStart !== textarea.selectionEnd) {
      e.preventDefault()
      setValue(wrapSelectionAsLink(textarea, text))
      return
    }

    const delimiter = detectTableDelimiter(text)
    const table = delimiter ? toMarkdownTable(text, delimiter) : null
    if (table) {
      e.preventDefault()
      setValue(insertAtCursor(textarea, table))
    }
  }

  return { onDrop, onPaste }
}
