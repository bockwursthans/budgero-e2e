// Throwaway Budgero self-host instance: fresh SQLite file in a temp folder,
// two pre-created local users, served by a self-host binary built from a Budgero checkout.
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const BINARY_NAME = process.platform === 'win32' ? 'budgero.exe' : 'budgero';
export const BINARY = process.env.BUDGERO_E2E_BINARY ?? join(ROOT, 'bin', BINARY_NAME);
export const PORT = Number(process.env.BUDGERO_E2E_PORT ?? 3101);
export const BASE_URL = `http://localhost:${PORT}`;
const LOG_DIR = join(ROOT, 'logs');

/** Neutral test personas – never real people. */
export const USERS = {
  alex: { username: 'alex', name: 'Alex', password: 'alex-e2e-password' },
  sam: { username: 'sam', name: 'Sam', password: 'sam-e2e-password' },
  /** Has the quick-entry test to themselves, so both tests can share one instance. */
  robin: { username: 'robin', name: 'Robin', password: 'robin-e2e-password' },
};

/** Client-side encryption password used in onboarding for both personas. */
export const MASTER_PASSWORD = 'e2e-master-password';

const READY_PATH = '/auth/local/config';
const READY_TIMEOUT_MS = 30_000;
const READY_POLL_MS = 250;

function adminEnv(dbPath) {
  return {
    ...process.env,
    DB_PATH: dbPath,
    UPDATE_CHECK_DISABLED: 'true',
    // The sync socket only accepts the default dev ports unless told otherwise.
    WEBSOCKET_ALLOWED_ORIGINS: BASE_URL,
  };
}

function createUser(dbPath, user, isAdmin) {
  execFileSync(
    BINARY,
    [
      'admin',
      'create-user',
      '--username',
      user.username,
      '--name',
      user.name,
      '--password',
      user.password,
      `--admin=${isAdmin}`,
    ],
    { env: adminEnv(dbPath), stdio: 'ignore' },
  );
}

async function waitUntilReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL + READY_PATH);
      if (response.ok) return;
    } catch {
      // server not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }
  throw new Error(`Budgero did not answer on ${BASE_URL} within ${READY_TIMEOUT_MS} ms`);
}

/** Starts a fresh instance and returns a stop() that kills it and deletes its data. */
export async function startInstance(users = Object.values(USERS)) {
  const dataDir = mkdtempSync(join(tmpdir(), 'budgero-e2e-'));
  const dbPath = join(dataDir, 'budgero.db');
  users.forEach((user, index) => createUser(dbPath, user, index === 0));

  const server = spawn(
    BINARY,
    ['serve', '--port', String(PORT), '--jwt-secret', 'e2e-only-jwt-secret'],
    { env: adminEnv(dbPath), cwd: dataDir, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  mkdirSync(LOG_DIR, { recursive: true });
  const log = createWriteStream(join(LOG_DIR, 'server.log'));
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  await waitUntilReady();

  return {
    dataDir,
    stop() {
      server.kill();
      rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    },
  };
}
