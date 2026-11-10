// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportToZip } from '../lib/export'
import type { Task } from '../lib/types'

afterEach(() => vi.unstubAllGlobals())

describe('exportToZip', () => {
  it('fetches attachments a few at a time', async () => {
    let inFlight = 0
    let peak = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        peak = Math.max(peak, ++inFlight)
        await new Promise((r) => setTimeout(r, 5))
        inFlight--
        return new Response('x')
      }),
    )
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()

    const description = Array.from({ length: 12 }, (_, i) => `![](/uploads/f${i}.png)`).join('\n')
    const task = { id: '1', title: 'T', description, tags: [], urls: [] } as unknown as Task
    const skipped = await exportToZip([task], [], 'json')

    expect(skipped).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(12)
    expect(peak).toBe(4)
  })
})
