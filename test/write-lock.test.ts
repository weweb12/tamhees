import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { atomicWriteJson } from '../src/core/atomic-write.js';
import { STORAGE_DIR } from '../src/core/identity.js';
import { LOCK_RELATIVE_PATH, LockTimeoutError, withWriteLock } from '../src/core/lock.js';
import { rememberMemory } from '../src/core/quick.js';
import { initTamhees, loadAllRecords } from '../src/core/store.js';
import { systemClock } from '../src/core/types.js';

const execFileAsync = promisify(execFile);
const CLI = resolve('dist/src/cli.js');

async function historyLines(project: string): Promise<string[]> {
  return (await readFile(join(project, STORAGE_DIR, 'audits', 'history.jsonl'), 'utf8')).split('\n').filter(Boolean);
}

describe('Write lock: concurrent writers never collide or lose data', () => {
  let project: string;
  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'tamhees-lock-'));
    assert.equal((await initTamhees(project, systemClock)).success, true);
  });
  afterEach(async () => {
    delete process.env['TAMHEES_LOCK_TIMEOUT_MS'];
    await rm(project, { recursive: true, force: true });
  });

  it('16 simultaneous CLI processes all succeed with unique IDs and complete audit history', async () => {
    const runs = await Promise.all(Array.from({ length: 16 }, (_, i) => execFileAsync(process.execPath,
      [CLI, 'remember', `Concurrent fact ${i}`, '--as', 'repo', '--source', 'x'], { cwd: project })
      .then(() => true, () => false)));
    assert.equal(runs.filter(Boolean).length, 16);
    const { records, errors } = await loadAllRecords(project);
    assert.deepEqual(errors, []);
    const statements = new Set(records.map((record) => record.statement));
    for (let i = 0; i < 16; i += 1) assert.ok(statements.has(`Concurrent fact ${i}`), `fact ${i} lost`);
    assert.equal(new Set(records.map((record) => record.id)).size, records.length);
    assert.equal((await historyLines(project)).length, 16);
    assert.deepEqual(await readdir(join(project, STORAGE_DIR, 'runtime')), [], 'lock released');
  });

  it('concurrent in-process calls are serialized too', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
      rememberMemory(project, { statement: `In-process fact ${i}`, basis: 'repo', sourceReference: 'x' }, systemClock)));
    assert.ok(results.every((result) => result.success));
    assert.equal(new Set(results.map((result) => result.memoryId)).size, 12);
    assert.equal((await historyLines(project)).length, 12);
  });

  it('is re-entrant within one operation', async () => {
    const value = await withWriteLock(project, () => withWriteLock(project, async () => 42));
    assert.equal(value, 42);
  });

  it('recovers from a lock left by a crashed process', async () => {
    const lockPath = join(project, LOCK_RELATIVE_PATH);
    await writeFile(lockPath, JSON.stringify({ pid: 2_147_483_000, host: hostname(), token: 'dead', acquiredAt: '2026-01-01T00:00:00.000Z' }));
    const result = await rememberMemory(project, { statement: 'After a crash', basis: 'repo', sourceReference: 'x' }, systemClock);
    assert.equal(result.success, true);
  });

  it('gives up with a clear error when a live process holds the lock', async () => {
    const lockPath = join(project, LOCK_RELATIVE_PATH);
    await writeFile(lockPath, JSON.stringify({ pid: process.ppid, host: hostname(), token: 'live', acquiredAt: new Date().toISOString() }));
    process.env['TAMHEES_LOCK_TIMEOUT_MS'] = '150';
    await assert.rejects(withWriteLock(project, async () => 'never'), LockTimeoutError);
    assert.match(await readFile(lockPath, 'utf8'), /"token":"live"/, 'a live lock is never stolen');
  });

  it('never lets two creators both write the same new file', async () => {
    const target = join(project, STORAGE_DIR, 'runtime', 'race.json');
    const outcomes = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => atomicWriteJson(target, { writer: i }, { allowOverwrite: false })));
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    const winner = outcomes.findIndex((outcome) => outcome.status === 'fulfilled');
    assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), { writer: winner });
    assert.deepEqual((await readdir(join(project, STORAGE_DIR, 'runtime'))).filter((file) => file.endsWith('.tmp')), [], 'temp files cleaned up');
  });
});
