import { describe, expect, it } from 'vitest'
import { slugify, uniqueSlug } from '../lib/db/slug'

describe('slugify', () => {
  it('fits a MySQL varchar(255) id, even after uniqueSlug, for a very long label', () => {
    const slug = slugify(`${'very long tag '.repeat(40)}😀`)
    expect([...slug].length).toBeLessThanOrEqual(200)
    expect(slug).toMatch(/^very-long-tag-.*[^-]$/)
    expect([...uniqueSlug(slug, new Set([slug]))].length).toBeLessThanOrEqual(255)
  })

  it('cuts by code point, not UTF-16 unit', () => {
    expect(slugify('é'.repeat(300))).toBe('é'.repeat(200))
  })
})
