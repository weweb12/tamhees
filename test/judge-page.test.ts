import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { startDashboardServer, type RunningDashboard } from '../src/dashboard/server.js';

const read = (name: string) => readFile(`src/dashboard/public/${name}`, 'utf8');

describe('Judge overview page', () => {
  let dashboard: RunningDashboard;
  before(async () => {
    dashboard = await startDashboardServer({ port: 0, rootDir: resolve('.') });
  });
  after(async () => {
    await dashboard.close();
  });
  const call = (path: string) => fetch(new URL(path, dashboard.url));

  it('serves the overview at / and the full dashboard at /details', async () => {
    const overview = await call('/');
    assert.equal(overview.status, 200);
    const text = await overview.text();
    assert.match(text, /Memory that knows it might/);
    assert.match(text, /href="details"/);
    const details = await call('/details');
    assert.equal(details.status, 200);
    assert.match(await details.text(), /See the safety check before an AI acts\./);
    for (const asset of ['/assets/start.css', '/assets/start.js']) assert.equal((await call(asset)).status, 200, asset);
    assert.match((await call('/')).headers.get('content-security-policy') ?? '', /default-src 'none'/);
  });

  it('stays short: one demo with three steps, at most six sections', async () => {
    const html = await read('start.html');
    assert.equal([...html.matchAll(/<section\b/g)].length <= 6, true);
    assert.equal([...html.matchAll(/<article class="step"/g)].length, 3);
    for (const id of ['step1-run', 'step2-run', 'step3-run', 'demo-reset']) assert.match(html, new RegExp(`id="${id}"[^>]*type="button"`));
  });

  it('has valid structure: unique IDs, resolvable references, no skipped heading levels', async () => {
    const html = await read('start.html');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!);
    assert.equal(new Set(ids).size, ids.length);
    for (const match of html.matchAll(/(?:aria-labelledby|for)="([^"]+)"/g)) assert.ok(ids.includes(match[1]!), match[1]);
    const levels = [...html.matchAll(/<h([1-6])\b/g)].map((match) => Number(match[1]));
    for (let index = 1; index < levels.length; index += 1) assert.ok(levels[index]! <= levels[index - 1]! + 1);
    assert.match(html, /aria-live="polite"/);
    assert.match(await read('start.css'), /prefers-reduced-motion: reduce/);
    assert.match(await read('start.css'), /:focus-visible/);
  });

  it('uses only the engine route and no unsafe or external resources', async () => {
    const [html, css, script] = await Promise.all([read('start.html'), read('start.css'), read('start.js')]);
    assert.match(script, /\/api\/inspector-state/);
    assert.doesNotMatch(html + css + script, /innerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function/);
    assert.doesNotMatch(html + css + script, /localStorage|sessionStorage|indexedDB|document\.cookie/);
    assert.doesNotMatch(html, /\sstyle=/);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
    assert.doesNotMatch(css, /@import|url\(\s*["']?https?:/);
    // The only external link is the source repository.
    const external = [...html.matchAll(/href="(https?:[^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(external, ['https://github.com/terar1kfn/tamhees']);
  });
});
