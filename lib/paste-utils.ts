interface TextSelection {
  value: string
  selectionStart: number
  selectionEnd: number
}

export function insertAtCursor(sel: TextSelection, text: string): string {
  return sel.value.slice(0, sel.selectionStart) + text + sel.value.slice(sel.selectionEnd)
}

export function wrapSelectionAsLink(sel: TextSelection, url: string): string {
  const selected = sel.value.slice(sel.selectionStart, sel.selectionEnd)
  return (
    sel.value.slice(0, sel.selectionStart) +
    `[${selected}](${url})` +
    sel.value.slice(sel.selectionEnd)
  )
}

// Quote-aware delimited text parser (handles embedded delimiters/newlines in "quoted" fields).
export function parseDelimitedRows(text: string, delimiter: string): string[][] {
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

export function detectTableDelimiter(text: string): '\t' | ',' | null {
  if (text.includes('\t')) return '\t'
  if (!text.includes(',')) return null
  // Only treat commas as delimiter when lines have a consistent column count —
  // prevents prose/code with commas from being mangled into a table.
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return null
  const c0 = lines[0].split(',').length
  if (c0 < 2) return null
  if (lines.some((l) => l.split(',').length !== c0)) return null
  return ','
}

export function toMarkdownTable(text: string, delimiter: '\t' | ','): string | null {
  const rows = parseDelimitedRows(text, delimiter).map((cells) =>
    cells.map((cell) => cell.trim().replace(/\|/g, '\\|')),
  )
  if (rows.length < 2 || rows[0].length < 2) return null

  const formatRow = (cells: string[]) => `| ${cells.join(' | ')} |`
  const separator = rows[0].map(() => '---')
  return [formatRow(rows[0]), formatRow(separator), ...rows.slice(1).map(formatRow)].join('\n')
}
