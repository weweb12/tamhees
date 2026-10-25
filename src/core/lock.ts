/**
 * Tamhees — project write lock.
 *
 * Several writers can target one store at the same time: an MCP session, a CLI hook,
 * a second agent. Every write path loads state, decides, then writes (next memory ID,
 * index rebuild, audit-log append), so unserialized writers collide, lose audit events
 * or overwrite each other. This lock serializes all writes to one project:
 *
 *   - In-process: a promise chain per project, so concurrent async callers queue.
 *   - Cross-process: an exclusive lock file `.tamhees/runtime/write.lock` created with
 *     O_CREAT|O_EXCL ('wx'). It records pid, host and a random token.
 *   - Re-entrant: nested calls within the same async operation (for example
 *     remember → apply → rebuild index → append audit) reuse the held lock.
 *   - Crash recovery: a lock whose process is gone (same host) or that is older than
 *     STALE_LOCK_MS (other host / unreadable) is removed and acquisition retries.
 *   - Bounded wait: acquisition gives up after the timeout with a clear error instead
 *     of hanging an agent forever.
 *
 * Reads (context, inspect, audit evaluation) do not take the lock; every write is a
 * temp-file-plus-rename, so readers always see complete files.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { lstat, mkdir, open, readFile, unlink } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { verifyPathSafety } from './atomic-write.js';
import { STORAGE_DIR } from './identity.js';

export const LOCK_RELATIVE_PATH = join(STORAGE_DIR, 'runtime', 'write.lock');
const DEFAULT_TIMEOUT_MS = 30_000;
const STALE_LOCK_MS = 10 * 60_000;

export class LockTimeoutError extends Error {
  constructor(lockPath: string, holder: string) {
    super(`Another Tamhees write is still running (${holder}). Waited and gave up. `
      + `If no other Tamhees process is running, remove ${lockPath} and retry.`);
    this.name = 'LockTimeoutError';
  }
}

interface LockHolderInfo {
  readonly pid: number;
  readonly host: string;
  readonly token: string;
  readonly acquiredAt: string;
}

const heldLocks = new AsyncLocalStorage<ReadonlySet<string>>();
const inProcessQueues = new Map<string, Promise<void>>();

function lockTimeoutMs(): number {
  const raw = process.env['TAMHEES_LOCK_TIMEOUT_MS'];
  const value = raw === undefined ? Number.NaN : Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : DEFAULT_TIMEOUT_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function processAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    // EPERM: the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function readHolder(lockPath: string): Promise<LockHolderInfo | null> {
  try {
    const parsed = JSON.parse(await readFile(lockPath, 'utf8')) as Partial<LockHolderInfo>;
    if (typeof parsed.pid === 'number' && typeof parsed.host === 'string' && typeof parsed.token === 'string'
      && typeof parsed.acquiredAt === 'string') {
      return parsed as LockHolderInfo;
    }
  } catch {
    // Missing, partially written or unreadable: treated below by age.
  }
  return null;
}

async function isStale(lockPath: string, holder: LockHolderInfo | null): Promise<boolean> {
  if (holder !== null && holder.host === hostname()) {
    if (holder.pid === process.pid) return false;
    return !processAlive(holder.pid);
  }
  try {
    const stats = await lstat(lockPath);
    return Date.now() - stats.mtimeMs > STALE_LOCK_MS;
  } catch {
    return true;
  }
}

async function acquireFileLock(projectDir: string): Promise<() => Promise<void>> {
  const storagePath = join(projectDir, STORAGE_DIR);
  const runtimeDir = join(storagePath, 'runtime');
  const lockPath = join(projectDir, LOCK_RELATIVE_PATH);

  try {
    await lstat(storagePath);
  } catch {
    // Not initialized: nothing to protect yet. The caller reports the real error.
    return async () => undefined;
  }
  const runtimeSafety = await verifyPathSafety(runtimeDir, projectDir);
  if (!runtimeSafety.safe) throw new Error(`Path safety check failed: ${runtimeSafety.reason}`);
  await mkdir(runtimeDir, { recursive: true });
  const lockSafety = await verifyPathSafety(lockPath, projectDir);
  if (!lockSafety.safe) throw new Error(`Path safety check failed: ${lockSafety.reason}`);

  const info: LockHolderInfo = {
    pid: process.pid,
    host: hostname(),
    token: randomBytes(12).toString('hex'),
    acquiredAt: new Date().toISOString(),
  };
  const deadline = Date.now() + lockTimeoutMs();
  let delay = 5;
  for (;;) {
    try {
      const handle = await open(lockPath, 'wx');
      try {
        await handle.writeFile(`${JSON.stringify(info)}\n`, 'utf8');
      } finally {
        await handle.close();
      }
      return async () => {
        const current = await readHolder(lockPath);
        if (current?.token === info.token) {
          try {
            await unlink(lockPath);
          } catch {
            // Already removed; nothing to release.
          }
        }
      };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const holder = await readHolder(lockPath);
    if (await isStale(lockPath, holder)) {
      try {
        await unlink(lockPath);
      } catch {
        // Another waiter removed it first.
      }
      continue;
    }
    if (Date.now() >= deadline) {
      throw new LockTimeoutError(lockPath, holder ? `pid ${holder.pid} on ${holder.host} since ${holder.acquiredAt}` : 'unknown holder');
    }
    await sleep(delay + Math.floor(Math.random() * delay));
    delay = Math.min(delay * 2, 100);
  }
}

/** Run `operation` while holding the project write lock (re-entrant within one async flow). */
export async function withWriteLock<T>(projectDir: string, operation: () => Promise<T>): Promise<T> {
  const key = resolve(projectDir);
  const held = heldLocks.getStore();
  if (held?.has(key)) return operation();

  const previous = inProcessQueues.get(key) ?? Promise.resolve();
  let releaseQueue!: () => void;
  const mine = new Promise<void>((resolveQueue) => { releaseQueue = resolveQueue; });
  const tail = previous.then(() => mine);
  inProcessQueues.set(key, tail);

  await previous;
  try {
    const releaseFile = await acquireFileLock(key);
    try {
      return await heldLocks.run(new Set([...(held ?? []), key]), operation);
    } finally {
      await releaseFile();
    }
  } finally {
    releaseQueue();
    if (inProcessQueues.get(key) === tail) inProcessQueues.delete(key);
  }
}
