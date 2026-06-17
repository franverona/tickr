import { describe, expect, it } from 'vitest'
import {
  convertOutlineList,
  detectTableDelimiter,
  insertAtCursor,
  parseDelimitedRows,
  toMarkdownTable,
  wrapSelectionAsLink,
} from '../lib/paste-utils'

describe('convertOutlineList', () => {
  it('returns null when no X.X. sub-numbering is present', () => {
    expect(convertOutlineList('- Item 1\n  - Item 1.1\n- Item 2')).toBeNull()
    expect(convertOutlineList('1. Item 1\n2. Item 2')).toBeNull()
  })

  it('converts X.X. numbered list to indented markdown', () => {
    const input = '1. Item 1\n  1.1. Item 1.1\n  1.2. Item 1.2\n2. Item 2'
    expect(convertOutlineList(input)).toBe('1. Item 1\n   1. Item 1.1\n   2. Item 1.2\n2. Item 2')
  })

  it('handles three levels of nesting', () => {
    const input = '1. Item 1\n  1.1. Item 1.1\n    1.1.1. Item 1.1.1\n2. Item 2'
    expect(convertOutlineList(input)).toBe(
      '1. Item 1\n   1. Item 1.1\n      1. Item 1.1.1\n2. Item 2',
    )
  })

  it('passes through non-list lines unchanged', () => {
    const input = 'Header\n1. Item\n  1.1. Sub\nFooter'
    expect(convertOutlineList(input)).toBe('Header\n1. Item\n   1. Sub\nFooter')
  })
})

describe('detectTableDelimiter', () => {
  it('returns \\t for tab-delimited text', () => {
    expect(detectTableDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t')
  })

  it('returns null when there are no tabs or commas', () => {
    expect(detectTableDelimiter('just some prose')).toBeNull()
  })

  it('returns null for a single line with commas (no second row)', () => {
    expect(detectTableDelimiter('a,b,c')).toBeNull()
  })

  it('returns , for commas with consistent column count across all lines', () => {
    expect(detectTableDelimiter('a,b,c\n1,2,3\n4,5,6')).toBe(',')
  })

  it('returns null for inconsistent column counts — the regression case', () => {
    // "do X, then Y\nbecause, reasons, here" — prose, not a table
    expect(detectTableDelimiter('do X, then Y\nbecause, reasons, here')).toBeNull()
  })

  it('returns null when only one column would result', () => {
    // every line has the same count but it's 1
    expect(detectTableDelimiter('no delimiter here\nstill no delimiter')).toBeNull()
  })

  it('tabs take priority over commas', () => {
    expect(detectTableDelimiter('a\tb,c\n1\t2,3')).toBe('\t')
  })
})

describe('parseDelimitedRows', () => {
  it('parses a basic two-column TSV', () => {
    expect(parseDelimitedRows('a\tb\n1\t2', '\t')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('handles a quoted field containing the delimiter', () => {
    expect(parseDelimitedRows('"a,b",c\n1,2', ',')).toEqual([
      ['a,b', 'c'],
      ['1', '2'],
    ])
  })

  it('handles escaped double-quotes inside a quoted field', () => {
    expect(parseDelimitedRows('"say ""hi""",ok\n1,2', ',')).toEqual([
      ['say "hi"', 'ok'],
      ['1', '2'],
    ])
  })

  it('filters out trailing empty rows', () => {
    expect(parseDelimitedRows('a\tb\n', '\t')).toEqual([['a', 'b']])
  })

  it('handles CRLF line endings', () => {
    expect(parseDelimitedRows('a\tb\r\n1\t2', '\t')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('toMarkdownTable', () => {
  it('converts TSV to a markdown table', () => {
    const result = toMarkdownTable('Name\tAge\nAlice\t30', '\t')
    expect(result).toBe('| Name | Age |\n| --- | --- |\n| Alice | 30 |')
  })

  it('converts CSV to a markdown table', () => {
    const result = toMarkdownTable('A,B\n1,2', ',')
    expect(result).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |')
  })

  it('escapes pipe characters in cell values', () => {
    const result = toMarkdownTable('a|b\tc\n1\t2', '\t')
    expect(result).toContain('a\\|b')
  })

  it('returns null for a single row (no data rows)', () => {
    expect(toMarkdownTable('a\tb', '\t')).toBeNull()
  })

  it('returns null for a single column', () => {
    expect(toMarkdownTable('a\nb', '\t')).toBeNull()
  })
})

describe('wrapSelectionAsLink', () => {
  it('wraps the selected text as a markdown link', () => {
    const sel = { value: 'hello world', selectionStart: 6, selectionEnd: 11 }
    expect(wrapSelectionAsLink(sel, 'https://example.com')).toBe(
      'hello [world](https://example.com)',
    )
  })

  it('produces an empty-label link when nothing is selected', () => {
    const sel = { value: 'hello', selectionStart: 5, selectionEnd: 5 }
    expect(wrapSelectionAsLink(sel, 'https://x.com')).toBe('hello[](https://x.com)')
  })
})

describe('insertAtCursor', () => {
  it('inserts text at the caret position', () => {
    const sel = { value: 'helo', selectionStart: 3, selectionEnd: 3 }
    expect(insertAtCursor(sel, 'l')).toBe('hello')
  })

  it('replaces the selected range', () => {
    const sel = { value: 'hello world', selectionStart: 6, selectionEnd: 11 }
    expect(insertAtCursor(sel, 'there')).toBe('hello there')
  })
})
