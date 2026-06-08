// Markdown templates insertable via the `/` autocomplete in the description editor
export interface Snippet {
  key: string
  label: string
  insert: string
}

export const SNIPPETS: ReadonlyArray<Snippet> = [
  { key: 'note', label: 'Note callout', insert: '> [!NOTE]\n> ' },
  { key: 'tip', label: 'Tip callout', insert: '> [!TIP]\n> ' },
  { key: 'important', label: 'Important callout', insert: '> [!IMPORTANT]\n> ' },
  { key: 'warning', label: 'Warning callout', insert: '> [!WARNING]\n> ' },
  { key: 'caution', label: 'Caution callout', insert: '> [!CAUTION]\n> ' },
  {
    key: 'details',
    label: 'Collapsible section',
    insert: '<details>\n<summary>Summary</summary>\n\nContent\n\n</details>',
  },
  {
    key: 'table',
    label: 'Table',
    insert: '| Column 1 | Column 2 |\n| --- | --- |\n| Value | Value |',
  },
  { key: 'checklist', label: 'Checklist', insert: '- [ ] Item' },
  { key: 'code', label: 'Code block', insert: '```\n\n```' },
]

export function searchSnippets(query: string): ReadonlyArray<Snippet> {
  if (query.length === 0) return SNIPPETS.slice(0, 8)
  const q = query.toLowerCase()
  return SNIPPETS.filter((s) => s.key.includes(q) || s.label.toLowerCase().includes(q)).slice(0, 8)
}
