import { rm } from 'fs/promises'
import { NextRequest } from 'next/server'
import path from 'path'
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
    const res = await upload({ origin: 'http://localhost:9876', 'content-length': '500000000' })
    expect(res.status).toBe(413)
  })

  it('accepts a same-origin request within the limit', async () => {
    const res = await upload({ origin: 'http://localhost:9876', 'content-length': '7' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'No file provided' })
  })

  it('answers 400, not 500, to a malformed multipart body', async () => {
    const res = await POST(
      new NextRequest('http://localhost:9876/api/upload', {
        method: 'POST',
        headers: {
          host: 'localhost:9876',
          origin: 'http://localhost:9876',
          'content-type': 'multipart/form-data; boundary=x',
          'content-length': '7',
        },
        body: 'garbage',
      }),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Malformed upload' })
  })

  describe('file types', () => {
    async function uploadFile(file: File) {
      const body = new FormData()
      body.append('file', file)
      const res = await POST(
        new NextRequest('http://localhost:9876/api/upload', {
          method: 'POST',
          headers: { host: 'localhost:9876', 'content-length': '1000' },
          body,
        }),
      )
      const json = await res.json()
      if (json.url) await rm(path.join(process.cwd(), 'public', json.url))
      return { status: res.status, json }
    }

    it('falls back to the extension when the browser sends no type', async () => {
      const { status, json } = await uploadFile(new File(['# hi'], 'notes.md', { type: '' }))
      expect(status).toBe(200)
      expect(json.url).toMatch(/^\/uploads\/[\w-]+\.md$/)
    })

    it('names a file by its declared type first', async () => {
      const { json } = await uploadFile(new File(['x'], 'photo.jpeg', { type: 'image/jpeg' }))
      expect(json.url).toMatch(/\.jpg$/)
    })

    it.each([
      ['clip.mov', 'video/quicktime'],
      ['clip.mp4', 'video/mp4'],
      ['clip.webm', 'video/webm'],
    ])('accepts the video %s', async (name, type) => {
      const { status, json } = await uploadFile(new File(['x'], name, { type }))
      expect(status).toBe(200)
      expect(json.url).toMatch(new RegExp(`\\.${name.split('.')[1]}$`))
    })

    it.each([
      ['run.exe', 'application/x-msdownload'],
      ['x.constructor', ''],
    ])('rejects %s', async (name, type) => {
      const { status, json } = await uploadFile(new File(['x'], name, { type }))
      expect(status).toBe(400)
      expect(json).toEqual({ error: 'Unsupported file type' })
    })
  })
})
