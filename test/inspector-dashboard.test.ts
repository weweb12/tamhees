import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { getInspectorView, INSPECTOR_RECORDS, runInspectorObservation } from '../src/dashboard/inspector.js';
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
    assert.match(script, /getJson\('\/api\/observe'/);
    assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML/);
  });
});
