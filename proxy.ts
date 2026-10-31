import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

// DNS rebinding: a malicious site can point its own domain at 127.0.0.1, which
// makes Origin and Host match, so same-origin checks can't catch it. The Host
// header still carries that domain. Runs on every request, not just /api.
export function proxy(request: NextRequest) {
  const host = request.headers.get('host')?.replace(/:\d+$/, '').toLowerCase() ?? ''
  const allowed = [...LOCAL_HOSTS, ...(process.env.ALLOWED_HOSTS?.split(',') ?? [])]
  if (allowed.some((h) => h.trim().toLowerCase() === host)) return NextResponse.next()
  return new NextResponse('Host not allowed. See ALLOWED_HOSTS in the README.', { status: 403 })
}
