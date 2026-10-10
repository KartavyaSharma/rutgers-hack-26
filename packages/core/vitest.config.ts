import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The router logs a warning for every fallback; keep test output readable.
    silent: 'passed-only',
  },
})
