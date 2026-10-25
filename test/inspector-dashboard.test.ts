import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { getInspectorView, INSPECTOR_RECORDS, inspectorState, parseInspectorStateRequest, runInspectorObservation } from '../src/dashboard/inspector.js';
import { startDashboardServer, type RunningDashboard } from '../src/dashboard/server.js';
import { validateMemoryRecord } from '../src/core/validation.js';

describe('Dashboard memory inspector fixture', () => {
  it('uses only valid memory records', () => {
    for (const record of INSPECTOR_RECORDS) assert.deepEqual(validateMemoryRecord(record), { valid: true, issues: [] }, record.id);
  });

  it('shows a confident wrong memory as trusted before the repository is checked', () => {
    const outcomes = Object.fromEntries(getInspectorView().report.memories.map((memory) => [memory.id, memory.outcome]));
    assert.equal(outcomes['DM-MEM-SHOP-001'], 'TRUST');
    assert.equal(outcomes['DM-MEM-SHOP-007'], 'ASK_OWNER');
  });

  it('observing the repository blocks contradicted memories and confirms correct ones', () => {
    const result = runInspectorObservation();
    const after = new Map(result.report.memories.map((memory) => [memory.id, memory]));
    for (const id of ['DM-MEM-SHOP-001', 'DM-MEM-SHOP-002', 'DM-MEM-SHOP-003', 'DM-MEM-SHOP-006']) {
      assert.equal(after.get(id)?.outcome, 'BLOCK_ACTION', id);
      assert.equal(after.get(id)?.servable, false, id);
    }
    for (const id of ['DM-MEM-SHOP-004', 'DM-MEM-SHOP-005']) assert.equal(after.get(id)?.outcome, 'TRUST', id);
    // The AI guess is not checkable and stays a question for the owner.
    assert.equal(after.get('DM-MEM-SHOP-007')?.outcome, 'ASK_OWNER');
    assert.deepEqual(result.skipped.map((item) => item.memoryId), ['DM-MEM-SHOP-008']);
    assert.deepEqual(JSON.stringify(runInspectorObservation()), JSON.stringify(result), 'deterministic');
  });
});

describe('Dashboard inspector API', () => {
  let dashboard: RunningDashboard;
  before(async () => {
    dashboard = await startDashboardServer({ port: 0, rootDir: resolve('.') });
  });
  after(async () => {
    await dashboard.close();
  });
  const call = (path: string, init?: RequestInit) => fetch(new URL(path, dashboard.url), init);

  it('serves the inspector view and runs the observation', async () => {
    const view = await call('/api/inspector');
    assert.equal(view.status, 200);
    assert.equal(((await view.json()) as { report: { total: number } }).report.total, INSPECTOR_RECORDS.length);
    const observed = await call('/api/observe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(observed.status, 200);
    const body = (await observed.json()) as { observations: { relationship: string }[] };
    assert.ok(body.observations.some((item) => item.relationship === 'CONTRADICTS'));
  });

  it('rejects wrong methods, bodies and content types', async () => {
    assert.equal((await call('/api/inspector', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 405);
    assert.equal((await call('/api/observe')).status, 405);
    assert.equal((await call('/api/observe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"path":"/etc"}' })).status, 400);
    assert.equal((await call('/api/observe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '[]' })).status, 400);
    assert.equal((await call('/api/observe', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
  });

  it('the page wires the inspector without unsafe DOM APIs', async () => {
    const html = await readFile('src/dashboard/public/index.html', 'utf8');
    const script = await readFile('src/dashboard/public/dashboard.js', 'utf8');
    assert.match(html, /id="inspector"/);
    assert.match(html, /<button class="button button-primary" id="inspector-observe" type="button">Let Tamhees check the repository<\/button>/);
    assert.match(script, /getJson\('\/api\/inspector'\)/);
    assert.match(script, /getJson\('\/api\/inspector-state'/);
    assert.match(script, /forgetInspectorMemory/);
    assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML/);
  });
});

describe('Dashboard inspector: live Forget uses the real tombstone', () => {
  it('forgetting the owner memory erases its text everywhere in the response and withholds it', () => {
    const state = inspectorState({ observed: false, forgotten: ['DM-MEM-SHOP-009'] });
    const memory = state.report.memories.find((item) => item.id === 'DM-MEM-SHOP-009')!;
    assert.equal(memory.forgotten, true);
    assert.equal(memory.servable, false);
    assert.equal(memory.outcome, 'FORGET_OR_REDACT');
    assert.doesNotMatch(JSON.stringify(state), /works from home|10:00/);
    assert.deepEqual(state.forgotten, ['DM-MEM-SHOP-009']);
  });

  it('matches what tamhees forget stores (same tombstone code path)', async () => {
    const { redactedTombstone } = await import('../src/core/redaction.js');
    const prior = INSPECTOR_RECORDS.find((record) => record.id === 'DM-MEM-SHOP-001')!;
    const tombstone = redactedTombstone(prior, 'x', 'y', '2026-10-25T09:00:00.000Z');
    assert.equal(tombstone.statement.startsWith('[REDACTED'), true);
    assert.equal(tombstone.actionPermission, 'FORGET_OR_REDACT');
    assert.equal(tombstone.verificationStatus, 'REVOKED');
  });

  it('combines with observation: a forgotten memory is never observed again', () => {
    const state = inspectorState({ observed: true, forgotten: ['DM-MEM-SHOP-001'] });
    assert.equal(state.observations.some((item) => item.memoryId === 'DM-MEM-SHOP-001'), false);
    assert.ok(state.observations.some((item) => item.memoryId === 'DM-MEM-SHOP-002' && item.relationship === 'CONTRADICTS'));
    assert.deepEqual(JSON.stringify(inspectorState({ observed: true, forgotten: [] }).report), JSON.stringify(runInspectorObservation().report));
  });

  it('rejects anything but known fixture IDs and the two fields', () => {
    for (const bad of [null, [], {}, { observed: true }, { observed: 'yes', forgotten: [] }, { observed: true, forgotten: ['../etc'] },
      { observed: true, forgotten: ['DM-MEM-SHOP-001', 'DM-MEM-SHOP-001'] }, { observed: true, forgotten: [], extra: 1 }]) {
      assert.equal(parseInspectorStateRequest(bad), null, JSON.stringify(bad));
    }
    assert.deepEqual(parseInspectorStateRequest({ observed: false, forgotten: ['DM-MEM-SHOP-009'] }), { observed: false, forgotten: ['DM-MEM-SHOP-009'] });
  });
});
