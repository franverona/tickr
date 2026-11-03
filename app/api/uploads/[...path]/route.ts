import { readFile } from 'fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { UPLOAD_EXT_TO_MIME } from '@/lib/upload-types'

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')

export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const segments = (await ctx.params).path
  const filePath = path.join(UPLOADS_DIR, ...segments)

  if (!filePath.startsWith(UPLOADS_DIR + path.sep) && filePath !== UPLOADS_DIR) {
    return new NextResponse(null, { status: 403 })
  }

  try {
    const data = await readFile(filePath)
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const contentType = UPLOAD_EXT_TO_MIME[ext] ?? 'application/octet-stream'

    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
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
    return new NextResponse(null, { status: 404 })
  }
}
