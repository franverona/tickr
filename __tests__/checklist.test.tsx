import MarkdownPreview from '@uiw/react-markdown-preview'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { checklistProgress, remarkChecklistLines, toggleChecklistLine } from '../lib/checklist'

function linesOf(source: string) {
  const lines: number[] = []
  renderToStaticMarkup(
    <MarkdownPreview source={source} remarkPlugins={[remarkChecklistLines(lines)]} />,
  )
  return lines
}

describe('checklist lines', () => {
  it('skips code fences and includes blockquotes', () => {
    const source = '```\n- [ ] sample\n```\n\n- [ ] real\n\n> - [ ] quoted\n\n1. [x] numbered'
    expect(linesOf(source)).toEqual([5, 7, 9])
  })

  it('does not record plain list items', () => {
    expect(linesOf('- plain\n- [ ] box')).toEqual([2])
  })

  it('toggles only the given line', () => {
    const source = '```\n- [ ] sample\n```\n> - [ ] quoted\n- [x] done'
    expect(toggleChecklistLine(source, 4)).toBe(
      '```\n- [ ] sample\n```\n> - [x] quoted\n- [x] done',
    )
    expect(toggleChecklistLine(source, 5)).toBe(
      '```\n- [ ] sample\n```\n> - [ ] quoted\n- [ ] done',
    )
  })
})

describe('checklistProgress', () => {
  it('counts done and total boxes, skipping code fences', () => {
    const source = [
      '- [x] one',
      '* [X] two',
      '1. [ ] three',
      '> - [ ] quoted',
      '```md',
      '- [x] in a fence',
      '````',
      '~~~',
      '- [ ] in a tilde fence',
      '~~~',
      '- plain item',
    ].join('\n')
    expect(checklistProgress(source)).toEqual({ done: 2, total: 4 })
  })

  it('reports no checklist for plain text', () => {
    expect(checklistProgress('just notes')).toEqual({ done: 0, total: 0 })
  })
})
