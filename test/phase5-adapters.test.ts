import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { adapterStatus, installAdapter, removeAdapter } from '../src/adapters/managed-files.js';
import { getAdapter, listAdapterDefinitions } from '../src/adapters/registry.js';
import { ADAPTER_NAMES, type AdapterName } from '../src/adapters/types.js';
import { fixedClock } from '../src/core/types.js';
import { initGptbrain } from '../src/core/store.js';

const NOW = '2026-07-22T12:00:00.000Z';
const roots: string[] = [];
afterEach(async () => { while (roots.length) await rm(roots.pop()!, { recursive: true, force: true }); });
async function root(): Promise<string> { const value = await mkdtemp(join(tmpdir(), 'dm-adapter-')); roots.push(value); return value; }

describe('Phase 5-6 shared adapter registry and lifecycle', () => {
  it('exposes exactly the five canonical adapter names in stable order', () => {
    assert.deepEqual(listAdapterDefinitions().map((item) => item.name), ADAPTER_NAMES);
    assert.deepEqual(ADAPTER_NAMES, ['codex', 'antigravity', 'claude', 'generic', 'mcp']);
  });

  it('produces equivalent canonical begin results for every adapter', async () => {
    const normalized: string[] = [];
    for (const name of ADAPTER_NAMES) {
      const project = await root();
      assert.equal((await initGptbrain(project, fixedClock(NOW))).success, true);
      const result = await getAdapter(name).begin(project, 'adapter retrieval', { maxTokens: 64 }, { clock: fixedClock(NOW), idGenerator: () => 'lc-equivalent' });
      normalized.push(JSON.stringify(result));
    }
    assert.equal(new Set(normalized).size, 1);
  });

  it('produces equivalent validation failures for every adapter finalize call', async () => {
    const results = await Promise.all(ADAPTER_NAMES.map(async (name) => {
      const project = await root();
      await initGptbrain(project, fixedClock(NOW));
      return getAdapter(name).finalize(project, { invalid: true }, { clock: fixedClock(NOW) });
    }));
    assert.equal(new Set(results.map((item) => JSON.stringify(item))).size, 1);
    assert.ok(results.every((item) => item.success === false));
  });
});

describe('Phase 5-6 managed adapter instructions', () => {
  for (const name of ADAPTER_NAMES) {
    it(`installs, reports, repeats, and removes ${name} idempotently`, async () => {
      const project = await root();
      const definition = getAdapter(name).definition;
      const path = join(project, definition.instructionPath);
      const first = await installAdapter(project, name);
      assert.equal(first.success, true); assert.equal(first.changed, true);
      assert.equal((await adapterStatus(project, name)).state, 'INSTALLED');
      const installed = await readFile(path);
      const second = await installAdapter(project, name);
      assert.equal(second.changed, false); assert.deepEqual(await readFile(path), installed);
      const removed = await removeAdapter(project, name);
      assert.equal(removed.success, true); assert.equal(removed.changed, true);
      assert.equal((await adapterStatus(project, name)).state, 'ABSENT');
      await assert.rejects(readFile(path), (error: unknown) => error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT');
    });
  }

  it('preserves every pre-existing byte outside the managed block', async () => {
    const project = await root(); const path = join(project, 'AGENTS.md');
    const original = Buffer.from('# Existing\r\n\r\nKeep π exactly.\r\n', 'utf8');
    await writeFile(path, original);
    await installAdapter(project, 'codex');
    const installed = await readFile(path);
    assert.ok(installed.subarray(0, original.length).equals(original));
    await removeAdapter(project, 'codex');
    assert.deepEqual(await readFile(path), original);
  });

  it('makes dry-run changes without writing a target', async () => {
    const project = await root();
    const result = await installAdapter(project, 'claude', true);
    assert.equal(result.changed, true); assert.equal(result.dryRun, true);
    assert.equal((await adapterStatus(project, 'claude')).state, 'ABSENT');
  });

  for (const [label, content] of [
    ['duplicate', '<!-- DOUBTFUL-MEMORY:START -->\n<!-- DOUBTFUL-MEMORY:END -->\n<!-- DOUBTFUL-MEMORY:START -->\n<!-- DOUBTFUL-MEMORY:END -->\n'],
    ['missing end', '<!-- DOUBTFUL-MEMORY:START -->\n'],
    ['end first', '<!-- DOUBTFUL-MEMORY:END -->\n<!-- DOUBTFUL-MEMORY:START -->\n'],
    ['nested', '<!-- DOUBTFUL-MEMORY:START -->\n<!-- DOUBTFUL-MEMORY:START -->\n<!-- DOUBTFUL-MEMORY:END -->\n'],
  ] as const) {
    it(`rejects ${label} managed markers without changing bytes`, async () => {
      const project = await root(); const path = join(project, 'DOUBTFUL_MEMORY_AGENT.md');
      await writeFile(path, content); const before = await readFile(path);
      const result = await installAdapter(project, 'generic');
      assert.equal(result.success, false); assert.equal(result.state, 'CORRUPT');
      assert.deepEqual(await readFile(path), before);
    });
  }

  it('uses only project-local documented targets', () => {
    const paths = Object.fromEntries(ADAPTER_NAMES.map((name: AdapterName) => [name, getAdapter(name).definition.instructionPath]));
    assert.deepEqual(paths, { codex: 'AGENTS.md', antigravity: '.agents/rules/doubtful-memory.md', claude: 'CLAUDE.md', generic: 'DOUBTFUL_MEMORY_AGENT.md', mcp: 'DOUBTFUL_MEMORY_MCP.md' });
  });
});
