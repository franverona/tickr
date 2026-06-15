import { describe, expect, it } from 'vitest'
import { parseCSVContent, parseCSVRows, parseJSONContent } from '../lib/import'

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
  it('parses a valid task array', () => {
    const json = JSON.stringify([{ title: 'Task A', description: 'desc', tags: ['WIP'] }])
    const result = parseJSONContent(json)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Task A')
    expect(result[0].tagLabels).toEqual(['WIP'])
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

  it('throws when the input is not an array', () => {
    expect(() => parseJSONContent(JSON.stringify({ title: 'oops' }))).toThrow()
  })
})

describe('parseCSVContent', () => {
  const HEADER = 'Title,Tags,Status,Description,Created At,Updated At'

  it('parses basic rows correctly', () => {
    const csv = [HEADER, 'Task one,WIP,Active,desc,2024-01-01,2024-01-01'].join('\n')
    const result = parseCSVContent(csv)
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Task one')
    expect(result[0].tagLabels).toEqual(['WIP'])
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
    expect(result[0].tagLabels).toEqual(['WIP', 'Blocked'])
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
    const header = 'Title,Tags,Status,Due Date,Description,Created At,Updated At'
    const csv = [header, 'Task one,,Active,2024-02-15,,,'].join('\n')
    const result = parseCSVContent(csv)
    expect(result[0].dueDate).toBe('2024-02-15')
  })

  it('treats a missing Due Date column as no due date', () => {
    const result = parseCSVContent([HEADER, 'Task one,,Active,,,'].join('\n'))
    expect(result[0].dueDate).toBeNull()
  })
})
