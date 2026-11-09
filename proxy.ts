import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

// DNS rebinding makes Origin and Host match, but Host still carries the attacker's domain
export function proxy(request: NextRequest) {
  const host = request.headers.get('host')?.replace(/:\d+$/, '').toLowerCase() ?? ''
  const allowed = [...LOCAL_HOSTS, ...(process.env.ALLOWED_HOSTS?.split(',') ?? [])]
  if (allowed.some((h) => h.trim().toLowerCase() === host)) return NextResponse.next()
  return new NextResponse('Host not allowed. See ALLOWED_HOSTS in the README.', { status: 403 })
}
