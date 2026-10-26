import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { POST } from '../app/api/upload/route'

function upload(headers: Record<string, string>) {
  // An empty form: requests that pass the checks stop at "No file provided",
  // so nothing is written to public/uploads
  return POST(
    new NextRequest('http://localhost:9876/api/upload', {
      method: 'POST',
      headers: {
        host: 'localhost:9876',
        'content-type': 'multipart/form-data; boundary=x',
        ...headers,
      },
      body: '--x--\r\n',
    }),
  )
}

describe('POST /api/upload', () => {
  it('rejects a cross-origin request', async () => {
    const res = await upload({ origin: 'https://evil.example', 'content-length': '7' })
    expect(res.status).toBe(403)
  })

  it('rejects a declared body over the limit before parsing it', async () => {
    const res = await upload({ origin: 'http://localhost:9876', 'content-length': '50000000' })
    expect(res.status).toBe(413)
  })

  it('accepts a same-origin request within the limit', async () => {
    const res = await upload({ origin: 'http://localhost:9876', 'content-length': '7' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'No file provided' })
  })
})
