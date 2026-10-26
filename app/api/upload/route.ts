import { randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const EXT_MAP: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/zip': 'zip',
}

// Room for multipart boundaries and part headers on top of the file itself
const MAX_BODY_BYTES = MAX_SIZE_BYTES + 64 * 1024

export async function POST(req: NextRequest) {
  // Unlike Server Actions, route handlers get no CSRF check: any site could
  // auto-submit a multipart form here. Browsers always send Origin on POST.
  const origin = req.headers.get('origin')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (origin) {
    let originHost: string | null = null
    try {
      originHost = new URL(origin).host
    } catch {}
    if (originHost !== host) {
      return NextResponse.json({ error: 'Cross-origin upload rejected' }, { status: 403 })
    }
  }

  // Reject on the declared size before formData() buffers the whole body
  const contentLength = Number(req.headers.get('content-length'))
  if (!contentLength) {
    return NextResponse.json({ error: 'Content-Length required' }, { status: 411 })
  }
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 413 })
  }

  const formData = await req.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!(file.type in EXT_MAP)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 400 })
  }

  const ext = EXT_MAP[file.type]
  const filename = `${randomUUID()}.${ext}`
  const dest = path.join(UPLOADS_DIR, filename)

  await mkdir(UPLOADS_DIR, { recursive: true })
  await writeFile(dest, Buffer.from(await file.arrayBuffer()))

  return NextResponse.json({ url: `/uploads/${filename}` })
}
