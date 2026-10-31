import type { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { proxy } from '../proxy'

const statusFor = (host: string | null) =>
  proxy({ headers: new Headers(host ? { host } : {}) } as unknown as NextRequest).status

describe('proxy', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(['localhost:9876', '127.0.0.1:3000', '[::1]:9876', 'LOCALHOST'])('allows %s', (host) => {
    expect(statusFor(host)).toBe(200)
  })

  it.each(['evil.test:9876', 'localhost.evil.test', '192.168.1.5:9876'])('rejects %s', (host) => {
    expect(statusFor(host)).toBe(403)
  })

  it('rejects a request with no Host', () => {
    expect(statusFor(null)).toBe(403)
  })

  it('allows hosts listed in ALLOWED_HOSTS', () => {
    vi.stubEnv('ALLOWED_HOSTS', 'tickr.lan, 192.168.1.5')
    expect(statusFor('tickr.lan:9876')).toBe(200)
    expect(statusFor('192.168.1.5:9876')).toBe(200)
    expect(statusFor('evil.test:9876')).toBe(403)
  })
})
