import { randomUUID } from 'crypto'

// MySQL ids are varchar(255); this leaves room for uniqueSlug's "-N"
const MAX_SLUG_LENGTH = 200

export function slugify(text: string): string {
  const slug = [
    ...text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/[\s_]+/g, '-'),
  ]
    .slice(0, MAX_SLUG_LENGTH)
    .join('')
    .replace(/^-+|-+$/g, '')
  // A name with no letters or digits ("🔥") is still a valid tag
  return slug || (text.trim() ? randomUUID() : '')
}

// Tags keep their id when renamed, so a free label can still have a taken slug
export function uniqueSlug(slug: string, taken: Set<string>): string {
  if (!taken.has(slug)) return slug
  let n = 2
  while (taken.has(`${slug}-${n}`)) n++
  return `${slug}-${n}`
}
