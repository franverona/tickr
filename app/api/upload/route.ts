import { randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { UPLOAD_EXT_TO_MIME } from '@/lib/upload-types'

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')
const MAX_SIZE_BYTES = 100 * 1024 * 1024 // 100 MB, room for short videos

// Reversed so the first extension listed for a type wins (jpg over jpeg)
const MIME_TO_EXT = Object.fromEntries(
  Object.entries(UPLOAD_EXT_TO_MIME)
    .reverse()
    .map(([ext, mime]) => [mime, ext]),
)

// Browsers often send an empty or vendor type for .md, .csv and .zip, so fall
// back to the name's extension. Both are client-declared; the files are served
// with nosniff and a sandbox CSP either way.
function uploadExtension(file: File): string | null {
  if (Object.hasOwn(MIME_TO_EXT, file.type)) return MIME_TO_EXT[file.type]
  const ext = path.extname(file.name).slice(1).toLowerCase()
  return Object.hasOwn(UPLOAD_EXT_TO_MIME, ext) ? ext : null
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
    return NextResponse.json({ error: 'File exceeds 100 MB limit' }, { status: 413 })
  }

  const formData = await req.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  const ext = uploadExtension(file)
  if (!ext) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds 100 MB limit' }, { status: 400 })
  }

  const filename = `${randomUUID()}.${ext}`
  const dest = path.join(UPLOADS_DIR, filename)

  await mkdir(UPLOADS_DIR, { recursive: true })
  await writeFile(dest, Buffer.from(await file.arrayBuffer()))

  return NextResponse.json({ url: `/uploads/${filename}` })
}
