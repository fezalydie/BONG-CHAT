import http from 'node:http';
import { config } from './config.js';
import { createApp } from './app.js';
import { runMigrations } from './db.js';
import { createSocketServer } from './sockets/index.js';

async function main(): Promise<void> {
  await runMigrations();

  const app = createApp();
  const server = http.createServer(app);
  createSocketServer(server);

  server.listen(config.port, () => {
    console.log('');
    console.log('  🔵 BONG CHAT server is running');
    console.log(`     API      http://localhost:${config.port}/api/health`);
    console.log(`     Realtime http://localhost:${config.port} (Socket.IO)`);
    console.log(`     Database ${config.db.usePg ? 'PostgreSQL' : `SQLite (${config.db.sqliteFile})`}`);
    if (!config.ai.enabled) {
      console.log('     AI       built-in assistant (set AI_PROVIDER + AI_API_KEY to upgrade)');
    }
    console.log('');
  });
}

main().catch((error) => {
  console.error('[server] failed to start:', error);
  process.exit(1);
});
