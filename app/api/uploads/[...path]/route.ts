import { createReadStream } from 'fs'
import { open } from 'fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { Readable } from 'stream'
import { UPLOAD_EXT_TO_MIME } from '@/lib/upload-types'

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')

const RANGE_CHUNK_BYTES = 4 * 1024 * 1024

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const segments = (await ctx.params).path
  const filePath = path.join(UPLOADS_DIR, ...segments)

  if (!filePath.startsWith(UPLOADS_DIR + path.sep) && filePath !== UPLOADS_DIR) {
    return new NextResponse(null, { status: 403 })
  }

  let file
  try {
    file = await open(filePath)
  } catch {
    return new NextResponse(null, { status: 404 })
  }
  try {
    const info = await file.stat()
    // A directory opens fine but can't be streamed
    if (!info.isFile()) return new NextResponse(null, { status: 404 })
    const { size } = info
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const contentType = UPLOAD_EXT_TO_MIME[ext] ?? 'application/octet-stream'

    // Video seeking needs ranges, and Safari won't play without them. Single range only.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '')
    let status = 200
    let start = 0
    let end = size - 1
    if (range && (range[1] || range[2])) {
      if (range[1]) {
        start = Number(range[1])
        // Open-ended ranges get a chunk at a time, so seeking doesn't read the whole file
        end = Math.min(range[2] ? Number(range[2]) : start + RANGE_CHUNK_BYTES - 1, size - 1)
      } else {
        start = Math.max(size - Number(range[2]), 0) // suffix: the last N bytes
      }
      if (start > end || start >= size) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${size}` },
        })
      }
      status = 206
    }
    // Streamed, so a 100 MB video isn't buffered in memory per request
    const body =
      size === 0
        ? null
        : (Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream)

    return new NextResponse(body, {
      status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        ...(status === 206 && { 'Content-Range': `bytes ${start}-${end}/${size}` }),
        // Served from the app's origin, so no sniffing and sandboxed. Not PDFs:
        // Chrome won't render one under a sandbox CSP.
        'X-Content-Type-Options': 'nosniff',
        // next.config.ts's anti-framing headers skip uploads, so they're set here
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy':
          contentType === 'application/pdf'
            ? "frame-ancestors 'none'"
            : "sandbox; frame-ancestors 'none'",
      },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  } finally {
    await file.close()
  }
}
