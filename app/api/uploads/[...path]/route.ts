import { open } from 'fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
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
    const { size } = await file.stat()
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const contentType = UPLOAD_EXT_TO_MIME[ext] ?? 'application/octet-stream'

    // Video players fetch in byte ranges to seek, and Safari won't play a video
    // without them. Only a single `bytes=start-end` range; anything else gets the whole file.
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
    const data = Buffer.alloc(end - start + 1)
    await file.read(data, 0, data.length, start)

    return new NextResponse(data, {
      status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Accept-Ranges': 'bytes',
        ...(status === 206 && { 'Content-Range': `bytes ${start}-${end}/${size}` }),
        // Served from the app's origin: never let a browser sniff a file into
        // HTML, and sandbox it so nothing in it can run as this app. PDFs are
        // exempt because Chrome won't render a PDF under a sandbox CSP.
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
    // e.g. a directory: open() succeeds but reading it fails
    return new NextResponse(null, { status: 404 })
  } finally {
    await file.close()
  }
}
