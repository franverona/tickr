import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('fs/promises', () => ({ readFile: vi.fn(async () => Buffer.from('data')) }))

import { GET } from '../app/api/uploads/[...path]/route'

function get(file: string) {
  return GET(new NextRequest(`http://localhost/uploads/${file}`), {
    params: Promise.resolve({ path: [file] }),
  })
}

describe('GET /uploads/*', () => {
  it('sends nosniff and a sandbox CSP for non-PDF files', async () => {
    const res = await get('notes.txt')
    expect(res.headers.get('content-type')).toBe('text/plain')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBe('sandbox')
  })

  it('leaves PDFs unsandboxed so the browser can render them', async () => {
    const res = await get('spec.pdf')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBeNull()
  })
})
