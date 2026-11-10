import { visit } from 'unist-util-visit'

// GFM only renders a checkbox when the box is followed by whitespace and text
const CHECKLIST_LINE_RE = /^([\s>]*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](?=[ \t]+\S)/

// Remark plugin: each checkbox's source line in render order, so clicks map to
// lines despite `- [ ]` in code fences or blockquotes.
// shortcut: raw HTML checkboxes aren't recorded and shift later boxes; read the
// line from the rendered node if that shows up.
export function remarkChecklistLines(lines: number[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return () => (tree: any) => {
    lines.length = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, 'listItem', (node: any) => {
      if (typeof node.checked === 'boolean' && node.position) lines.push(node.position.start.line)
    })
  }
}

export function toggleChecklistLine(source: string, line: number): string {
  const lines = source.split('\n')
  lines[line - 1] = lines[line - 1].replace(
    CHECKLIST_LINE_RE,
    (_, prefix, mark) => `${prefix}[${mark === ' ' ? 'x' : ' '}]`,
  )
  return lines.join('\n')
}

const FENCE_RE = /^\s*(`{3,}|~{3,})(.*)$/

// A line scan, not a Markdown parse, since every card runs it
export function checklistProgress(source: string): { done: number; total: number } {
  let done = 0
  let total = 0
  let fence = ''
  for (const line of source.split('\n')) {
    const [, f, rest] = line.match(FENCE_RE) ?? []
    if (f) {
      if (!fence) fence = f
      // A closer can't carry an info string: ```js inside a fence is content
      else if (f[0] === fence[0] && f.length >= fence.length && !rest.trim()) fence = ''
      continue
    }
    if (fence) continue
    const m = line.match(CHECKLIST_LINE_RE)
    if (m) {
      total++
      if (m[2] !== ' ') done++
    }
  }
  return { done, total }
}
