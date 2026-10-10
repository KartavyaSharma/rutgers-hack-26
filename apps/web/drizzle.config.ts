import { defineConfig } from 'drizzle-kit'

// Only used to generate SQL migrations (`pnpm --filter @bell/web db:generate`).
// The app applies them itself on first DB use, for both Postgres and PGlite.
export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/server/schema.ts',
  out: './drizzle',
})
