import { describe, expect, it } from 'vitest'
import { chunk } from '../lib/db/firestore/chunk'

describe('chunk', () => {
  it('splits by count', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('also splits by bytes, keeping an oversized item on its own', () => {
    const sizes = [4, 4, 4, 20, 1]
    expect(chunk(sizes, 500, (n) => n, 10)).toEqual([[4, 4], [4], [20], [1]])
  })
})
