import pg from 'pg'
import { Database } from '@hocuspocus/extension-database'
import type { AppEnv } from '../env.js'
import { log } from '../log.js'

const { Pool } = pg

function quoteIdentifier(identifier: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid PostgreSQL identifier: ${identifier}`)
  }

  return `"${identifier.replaceAll('"', '""')}"`
}

export function createPostgresDatabaseExtension(env: AppEnv): Database {
  const pool = new Pool({
    connectionString: env.postgresUrl,
    max: Number(process.env.POSTGRES_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.POSTGRES_IDLE_TIMEOUT_MS || 30_000),
  })

  const table = quoteIdentifier(env.postgresTable)

  async function ensureTable(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        name TEXT PRIMARY KEY,
        state BYTEA NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)
  }

  let ensured: Promise<void> | null = null
  const ensureOnce = () => {
    ensured ??= ensureTable().then(() => log.info('PostgreSQL storage table ready', { table: env.postgresTable }))
    return ensured
  }

  return new Database({
    fetch: async ({ documentName }) => {
      await ensureOnce()
      const result = await pool.query<{ state: Buffer }>(
        `SELECT state FROM ${table} WHERE name = $1 LIMIT 1`,
        [documentName],
      )

      return result.rows[0]?.state ?? null
    },
    store: async ({ documentName, state }) => {
      await ensureOnce()
      await pool.query(
        `
          INSERT INTO ${table} (name, state, updated_at)
          VALUES ($1, $2, now())
          ON CONFLICT (name)
          DO UPDATE SET state = EXCLUDED.state, updated_at = now()
        `,
        [documentName, Buffer.from(state)],
      )
    },
  })
}
