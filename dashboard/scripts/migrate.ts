import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'fs'
import path from 'path'

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'dashboard.db')
const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle/migrations')

const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`)

const applied = new Set(
  sqlite.prepare('SELECT hash FROM __drizzle_migrations').all().map((r: any) => r.hash)
)

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort()

let count = 0
for (const file of migrationFiles) {
  if (applied.has(file)) continue
  const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8')
  sqlite.exec(sql)
  sqlite.prepare('INSERT INTO __drizzle_migrations (hash) VALUES (?)').run(file)
  console.log(`✓ Applied migration: ${file}`)
  count++
}

if (count === 0) console.log('✓ All migrations already applied')
else console.log(`✓ Applied ${count} migration(s)`)

sqlite.close()
