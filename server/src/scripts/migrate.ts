import { db, runMigrations } from '../db.js';

async function main(): Promise<void> {
  await runMigrations();
  console.log('[db] migrations are up to date.');
  await db.destroy();
}

main().catch((error) => {
  console.error('[db] migration failed:', error);
  process.exit(1);
});
