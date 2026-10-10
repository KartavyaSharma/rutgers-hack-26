import { existsSync } from 'node:fs'
import path from 'node:path'
import * as nextEnvModule from '@next/env'
import type { NextConfig } from 'next'

// @next/env is bundled CommonJS: Next's default (SWC to CJS) config loader sees its named
// exports, Node's native ESM loader only sees `default`. Support both.
type NextEnv = typeof nextEnvModule
const { loadEnvConfig } =
  (nextEnvModule as NextEnv & { default?: NextEnv }).default ?? nextEnvModule

/** Walk up from the app directory to the pnpm workspace root (where the single `.env` lives). */
function findRepoRoot(start: string): string {
  let dir = start
  while (true) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return start
    dir = parent
  }
}

const repoRoot = findRepoRoot(process.cwd())

// Next has already loaded (and cached) env files from apps/web, which has none.
// Force a reload from the repo root so the shared `.env` is read. Only when a root
// env file exists, so a keyless checkout runs with Next's environment untouched.
const dev = process.env.NODE_ENV === 'development'
const mode = dev ? 'development' : 'production'
const rootEnvFiles = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]
if (rootEnvFiles.some((file) => existsSync(path.join(repoRoot, file)))) {
  loadEnvConfig(repoRoot, dev, undefined, true)
}

const nextConfig: NextConfig = {
  // Workspace packages export TypeScript source.
  transpilePackages: ['@bell/core', '@bell/ui'],
  // PGlite loads its WASM and data files relative to its own files at runtime.
  serverExternalPackages: ['@electric-sql/pglite'],
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
}

export default nextConfig
