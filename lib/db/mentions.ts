import { randomUUID } from 'crypto'

// Imports regenerate task ids, so `[title](#old-id)` mentions must be pointed
// at the new ids. Returns one fresh id per item plus a rewrite function.
export function planImportIds(items: { id?: string }[]): {
  newIds: string[]
  remap: (description: string) => string
} {
  const newIds = items.map(() => randomUUID())
  const idMap = new Map<string, string>()
  items.forEach((item, i) => {
    if (item.id && !idMap.has(item.id)) idMap.set(item.id, newIds[i])
  })
  const remap = (description: string) =>
    idMap.size === 0
      ? description
      : description.replace(/\]\(#([^)\s]+)\)/g, (match, id: string) => {
          const next = idMap.get(id)
          return next ? `](#${next})` : match
        })
  return { newIds, remap }
}
