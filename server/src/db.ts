import knexFactory, { type Knex } from 'knex';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const MIGRATION_EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs'];

function migrationFilename(file: string): boolean {
  return MIGRATION_EXTENSIONS.some((ext) => file.endsWith(ext)) && !file.endsWith('.d.ts');
}

/**
 * Knex normally names a migration after its file, which means a single schema
 * would be recorded as `001_init.ts` when running the TypeScript sources (dev)
 * and `001_init.js` after `tsc` (production). The two would then disagree about
 * what has already been applied and refuse to share a database.
 *
 * This source drops the extension from the recorded name so dev and production
 * agree, while `getMigration` still loads whichever file is actually present.
 */
function createMigrationSource(directory: string): Knex.MigrationSource<string> {
  return {
    async getMigrations(): Promise<string[]> {
      return fs
        .readdirSync(directory)
        .filter(migrationFilename)
        .sort();
    },
    getMigrationName(migration: string): string {
      return migration.replace(/\.(ts|js|mjs|cjs)$/, '');
    },
    getMigration(migration: string): Promise<Knex.Migration> {
      return import(pathToFileURL(path.join(directory, migration)).href) as Promise<Knex.Migration>;
    },
  };
}

/** Rewrite legacy `name.ts` / `name.js` records to the extension-less form. */
async function normalizeMigrationNames(): Promise<void> {
  if (!(await db.schema.hasTable('knex_migrations'))) return;
  const rows = await db('knex_migrations').select('id', 'name');
  for (const row of rows) {
    const normalized = String(row.name).replace(/\.(ts|js|mjs|cjs)$/, '');
    if (normalized === row.name) continue;
    const clash = await db('knex_migrations').where({ name: normalized }).first();
    if (clash) await db('knex_migrations').where({ id: row.id }).del();
    else await db('knex_migrations').where({ id: row.id }).update({ name: normalized });
  }
}

/**
 * One database layer for two engines:
 *  - SQLite (default): zero configuration, perfect for local development.
 *  - PostgreSQL: set DB_CLIENT=pg and DATABASE_URL for production.
 * Both are supported through Knex, so the same migrations run on either.
 */
export const db: Knex = config.db.usePg
  ? knexFactory({
      client: 'pg',
      connection: config.db.url,
      pool: { min: 0, max: 10 },
    })
  : knexFactory({
      client: 'better-sqlite3',
      connection: { filename: config.db.sqliteFile },
      useNullAsDefault: true,
      pool: {
        afterCreate: (conn: { pragma: (value: string) => void }, done: (err?: Error) => void) => {
          conn.pragma('journal_mode = WAL');
          done();
        },
      },
    });

export async function runMigrations(): Promise<void> {
  if (!config.db.usePg) {
    fs.mkdirSync(path.dirname(config.db.sqliteFile), { recursive: true });
  }
  const directory = path.resolve(here, 'migrations');
  await normalizeMigrationNames();
  const [, logs] = await db.migrate.latest({
    // In dev db.ts runs from src/, after a build from dist/ — the migrations
    // folder sits next to it in both cases.
    migrationSource: createMigrationSource(directory),
  });
  if (logs.length > 0) {
    console.log(`[db] migrations applied: ${logs.length}`);
  }
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function isoInHours(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}
