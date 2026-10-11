import { existsSync } from 'node:fs'
import path from 'node:path'
import type { NextConfig } from 'next'

// `pnpm --filter @bell/staff dev` runs from apps/staff.
const repoRoot = path.resolve(process.cwd(), '../..')
// Read the single repo-root `.env` like apps/web does (STAFF_SESSION_SECRET must match in both apps).
const rootEnv = path.join(repoRoot, '.env')
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

// apps/web owns the API. The staff app calls it through this proxy, so there is one backend
// and no cross-origin setup. Point BELL_API_URL at wherever apps/web runs.
const apiUrl = process.env.BELL_API_URL ?? 'http://localhost:3217'

const nextConfig: NextConfig = {
  // Workspace packages export TypeScript source.
  transpilePackages: ['@bell/core'],
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  rewrites: async () => [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }],
}

export default nextConfig
