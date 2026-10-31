import { randomUUID } from 'crypto'

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
  // A name with no letters or digits ("🔥") is still a valid tag
  return slug || (text.trim() ? randomUUID() : '')
}
