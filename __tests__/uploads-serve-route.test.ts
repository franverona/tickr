import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

const DATA = Buffer.from('0123456789')
vi.mock('fs/promises', () => ({
  open: vi.fn(async () => ({
    stat: async () => ({ size: DATA.length }),
    read: async (buf: Buffer, off: number, len: number, pos: number) => {
      DATA.copy(buf, off, pos, pos + len)
      return { bytesRead: len, buffer: buf }
    },
    close: async () => {},
  })),
}))

import { GET } from '../app/api/uploads/[...path]/route'

function get(file: string, headers: Record<string, string> = {}) {
  return GET(new NextRequest(`http://localhost/uploads/${file}`, { headers }), {
    params: Promise.resolve({ path: [file] }),
  })
}

describe('GET /uploads/*', () => {
  it('sends nosniff and a sandbox CSP for non-PDF files', async () => {
    const res = await get('notes.txt')
    expect(res.headers.get('content-type')).toBe('text/plain')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBe("sandbox; frame-ancestors 'none'")
    expect(res.headers.get('x-frame-options')).toBe('DENY')
  })

  it('leaves PDFs unsandboxed so the browser can render them', async () => {
    const res = await get('spec.pdf')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'none'")
    expect(res.headers.get('x-frame-options')).toBe('DENY')
  })

  it('sends the whole file without a Range header', async () => {
    const res = await get('clip.mp4')
    expect(res.status).toBe(200)
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(await res.text()).toBe('0123456789')
  })

  it.each([
    ['bytes=2-5', 'bytes 2-5/10', '2345'],
    ['bytes=7-', 'bytes 7-9/10', '789'],
    ['bytes=-3', 'bytes 7-9/10', '789'],
    ['bytes=8-100', 'bytes 8-9/10', '89'],
  ])('serves %s as a partial response', async (range, contentRange, body) => {
    const res = await get('clip.mp4', { range })
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe(contentRange)
    expect(await res.text()).toBe(body)
  })

  it.each(['bytes=10-', 'bytes=5-2'])('rejects the unsatisfiable range %s', async (range) => {
    const res = await get('clip.mp4', { range })
    expect(res.status).toBe(416)
    expect(res.headers.get('content-range')).toBe('bytes */10')
  })
})
