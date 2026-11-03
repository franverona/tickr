import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  // Don't let `next dev` generate AGENTS.md; CLAUDE.md carries the Next.js guidance
  agentRules: false,
  experimental: {
    serverActions: {
      // Default is 1mb: too small for a whole-backup importTasks call or a long
      // description. Images go through /api/upload, so this is only text.
      bodySizeLimit: '20mb',
    },
    // proxy.ts makes Next buffer every request body, cut at 10 MB by default,
    // which would truncate 10 MB uploads and 20 MB actions before they arrive
    proxyClientMaxBodySize: '25mb',
  },
  // No login, so a framed copy of the app is fully working: block clickjacking.
  // X-Frame-Options for browsers without CSP frame-ancestors support. Uploads
  // are left out because a header here replaces the route's own CSP (sandbox);
  // /api/uploads sets these itself.
  async headers() {
    return [
      {
        source: '/:path((?!uploads/|api/uploads/).*)',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/uploads/:path*',
          destination: '/api/uploads/:path*',
        },
      ],
    }
  },
}

export default nextConfig
