import { visit } from 'unist-util-visit'

const CHECKLIST_LINE_RE = /^([\s>]*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/

// Remark plugin: records the source line of each checkbox, in render order, so
// a clicked box maps to its line even with `- [ ]` inside code fences (never
// rendered) or blockquotes. Fills `lines` in place because the parser only
// runs inside the preview.
// shortcut: raw HTML <input type="checkbox"> isn't recorded and shifts later
// boxes, upgrade by reading the line from the rendered node if that shows up.
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
