// Applies server/schema.sql, then every file in server/migrations/ that has not run yet.
// usage: npm run db:migrate   (reads DATABASE_URL from the environment or .env)
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url))
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const client = new pg.Client({ connectionString: databaseUrl })
await client.connect()
try {
  await client.query(await fs.readFile(path.join(here, 'schema.sql'), 'utf8'))
  console.log('schema.sql applied')
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name))
  const files = (await fs.readdir(path.join(here, 'migrations'))).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    if (applied.has(file)) continue
    await client.query('BEGIN')
    try {
      await client.query(await fs.readFile(path.join(here, 'migrations', file), 'utf8'))
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`applied ${file}`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw new Error(`${file} failed: ${error.message}`)
    }
  }
  console.log('database is up to date')
} finally {
  await client.end()
}
