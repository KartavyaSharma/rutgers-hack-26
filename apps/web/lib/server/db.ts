import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { databaseUrl } from './env'
import * as schema from './schema'

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>
/** The database or an open transaction: anything that can run queries. */
export type Executor = Pick<Db, 'select' | 'insert' | 'update'>

// One connection (or one PGlite instance) per process. PGlite locks its data
// directory, so dev HMR and every route module must share the same instance.
const globalForDb = globalThis as typeof globalThis & { __bellDb?: Promise<Db> }

/** apps/web, whether the server was started from there (pnpm scripts) or the repo root. */
const appDir = (): string => {
  const cwd = process.cwd()
  return existsSync(path.join(cwd, 'drizzle')) ? cwd : path.join(cwd, 'apps', 'web')
}

const createDb = async (): Promise<Db> => {
  const migrationsFolder = path.join(appDir(), 'drizzle')
  const url = databaseUrl()

  if (url) {
    const { default: postgres } = await import('postgres')
    const { drizzle } = await import('drizzle-orm/postgres-js')
    const { migrate } = await import('drizzle-orm/postgres-js/migrator')
    const client = postgres(url, { max: 5, onnotice: () => {} })
    const db = drizzle(client, { schema })
    await migrate(db, { migrationsFolder })
    return db
  }

  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  const dataDir = path.join(appDir(), '.data', 'pglite')
  mkdirSync(dataDir, { recursive: true })
  const client = new PGlite(dataDir)
  await client.waitReady
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  return db
}

/** Opens the database on first use and applies pending migrations. */
export const getDb = (): Promise<Db> => {
  if (!globalForDb.__bellDb) {
    globalForDb.__bellDb = createDb().catch((error: unknown) => {
      // Let the next request retry instead of caching the failure forever.
      globalForDb.__bellDb = undefined
      throw error
    })
  }
  return globalForDb.__bellDb
}
