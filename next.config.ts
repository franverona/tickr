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
