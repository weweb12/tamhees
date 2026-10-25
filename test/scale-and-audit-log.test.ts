import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { readAuditHistory } from '../src/core/audit-log.js';
import { compileContext } from '../src/core/context.js';
import { loadAllEvidence } from '../src/core/evidence.js';
import { STORAGE_DIR } from '../src/core/identity.js';
import { buildRememberCandidate, rememberMemory } from '../src/core/quick.js';
import { initTamhees, loadAllRecords, loadIndex, rebuildMemoryIndex } from '../src/core/store.js';
import { systemClock } from '../src/core/types.js';

const auditsDir = (project: string) => join(project, STORAGE_DIR, 'audits');

describe('Audit log stays cheap to append as history grows', () => {
  let project: string;
  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'tamhees-auditlog-'));
    await initTamhees(project, systemClock);
    process.env['TAMHEES_AUDIT_SEGMENT_BYTES'] = '4096';
  });
  afterEach(async () => {
    delete process.env['TAMHEES_AUDIT_SEGMENT_BYTES'];
    await rm(project, { recursive: true, force: true });
  });

  it('rolls the active log into sealed segments without losing or duplicating events', async () => {
    for (let i = 0; i < 40; i += 1) {
      const result = await rememberMemory(project, { statement: `Fact number ${i}`, basis: 'repo', sourceReference: 'x' }, systemClock);
      assert.equal(result.success, true);
    }
    const files = await readdir(auditsDir(project));
    const segments = files.filter((file) => /^history-.+\.jsonl$/.test(file));
    assert.ok(segments.length >= 3, `expected several segments, got ${files.join(', ')}`);
    const active = await readFile(join(auditsDir(project), 'history.jsonl'), 'utf8');
    assert.ok(Buffer.byteLength(active) <= 4096, 'active segment stays under the limit');

    const all = (await readAuditHistory(project)).split('\n').filter(Boolean).map((line) => JSON.parse(line) as { eventId: string; memoryId: string });
    assert.equal(all.length, 40, 'every event kept exactly once');
    assert.equal(new Set(all.map((event) => event.eventId)).size, 40);
    const records = (await loadAllRecords(project)).records.filter((record) => record.statement.startsWith('Fact number'));
    assert.deepEqual(new Set(all.map((event) => event.memoryId)), new Set(records.map((record) => record.id)));
  });

  it('a crash after sealing but before starting the new segment is recovered without duplicates', async () => {
    for (let i = 0; i < 6; i += 1) await rememberMemory(project, { statement: `Early fact ${i}`, basis: 'repo', sourceReference: 'x' }, systemClock);
    const activePath = join(auditsDir(project), 'history.jsonl');
    const active = await readFile(activePath, 'utf8');
    const firstId = (JSON.parse(active.split('\n')[0]!) as { eventId: string }).eventId;
    // Simulate: segment written, process died before the active log was replaced.
    await writeFile(join(auditsDir(project), `history-${firstId}.jsonl`), active);
    process.env['TAMHEES_AUDIT_SEGMENT_BYTES'] = String(Math.max(1024, Buffer.byteLength(active)));
    await rememberMemory(project, { statement: 'After the crash', basis: 'repo', sourceReference: 'x' }, systemClock);
    const all = (await readAuditHistory(project)).split('\n').filter(Boolean);
    assert.equal(all.length, 7);
    assert.equal(new Set(all.map((line) => (JSON.parse(line) as { eventId: string }).eventId)).size, 7);
  });
});

describe('Large stores stay usable', () => {
  let project: string;
  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'tamhees-scale-'));
    await initTamhees(project, systemClock);
  });
  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('handles 800 memories: loads, retrieves, writes and keeps the index consistent', async () => {
    const now = new Date().toISOString();
    const ids = ['DM-MEM-000001'];
    for (let i = 0; i < 800; i += 1) {
      const record = buildRememberCandidate({
        statement: `Rule ${i}: the ${i % 2 ? 'cache' : 'database'} layer keeps convention ${i}.`,
        basis: 'repo', sourceReference: 'src', tags: [i % 2 ? 'cache' : 'database'],
      }, ids, now).proposedRecord!;
      ids.push(record.id);
      await writeFile(join(project, STORAGE_DIR, 'memories', 'records', `${record.id}.json`), `${JSON.stringify(record, null, 2)}\n`);
    }
    assert.equal((await rebuildMemoryIndex(project, systemClock)).success, true);

    const started = Date.now();
    const loaded = await loadAllRecords(project);
    assert.deepEqual(loaded.errors, []);
    assert.equal(loaded.records.length, 801);
    const pack = compileContext('change the cache layer', loaded.records, systemClock, (await loadAllEvidence(project)).evidence, { maxTokens: 400 });
    assert.ok(pack.selected.length > 0 && pack.budget.compliant);
    const written = await rememberMemory(project, { statement: 'One more cache rule', basis: 'repo', sourceReference: 'x', tags: ['cache'] }, systemClock);
    assert.equal(written.memoryId, 'DM-MEM-000802');
    const index = await loadIndex(project);
    assert.equal(index?.entries.length, 802);
    // Generous bound: catches a return to per-file sequential path walking, not CI noise.
    assert.ok(Date.now() - started < 20_000, `took ${Date.now() - started} ms`);
  });
});
