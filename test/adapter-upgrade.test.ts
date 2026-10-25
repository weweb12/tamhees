import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { adapterStatus, installAdapter, removeAdapter } from '../src/adapters/managed-files.js';
import { MANAGED_BLOCK_END, MANAGED_BLOCK_START } from '../src/core/identity.js';
import type { AdapterName } from '../src/adapters/types.js';

// Fixtures were produced by the real rc.2 installer (tag v1.0.0-rc.2) and are byte-exact.
const FIXTURES = resolve('test/fixtures/rc2-adapters');
const TARGETS: ReadonlyArray<readonly [AdapterName, string]> = [
  ['claude', 'CLAUDE.md'],
  ['codex', 'AGENTS.md'],
  ['mcp', 'TAMHEES_MCP.md'],
  ['antigravity', '.agents/rules/tamhees.md'],
  ['generic', 'TAMHEES_AGENT.md'],
];

const roots: string[] = [];
afterEach(async () => {
  while (roots.length > 0) await rm(roots.pop()!, { recursive: true, force: true });
});
async function copyOf(fixture: 'created' | 'existing'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tamhees-adapter-upgrade-'));
  roots.push(root);
  await cp(join(FIXTURES, fixture), root, { recursive: true });
  return root;
}

describe('Adapter instructions: upgrading rc.2 installs', () => {
  for (const [agent, file] of TARGETS) {
    it(`${agent}: an unmodified rc.2 block is recognized and upgraded in place`, async () => {
      const root = await copyOf('created');
      const path = join(root, file);
      const before = await readFile(path, 'utf8');
      assert.equal((await adapterStatus(root, agent)).state, 'INSTALLED');

      const upgraded = await installAdapter(root, agent);
      assert.equal(upgraded.success, true);
      assert.equal(upgraded.changed, true);
      const after = await readFile(path, 'utf8');
      assert.notEqual(after, before);
      assert.equal(after.split(MANAGED_BLOCK_START).length - 1, 1);
      assert.equal(after.split(MANAGED_BLOCK_END).length - 1, 1);
      assert.match(after, agent === 'mcp' ? /\.mcp\.json/ : /tamhees inspect/);

      // Idempotent afterwards, and removal still works.
      const again = await installAdapter(root, agent);
      assert.equal(again.success, true);
      assert.equal(again.changed, false);
      assert.equal((await removeAdapter(root, agent)).success, true);
    });
  }

  it('preserves the owner\'s own bytes (CRLF, text before the block) when upgrading', async () => {
    const root = await copyOf('existing');
    const path = join(root, 'CLAUDE.md');
    const original = await readFile(path);
    const prefix = Buffer.from('# My project notes\r\n\r\nKeep this line.\r\n', 'utf8');
    assert.ok(original.subarray(0, prefix.length).equals(prefix));
    assert.equal((await installAdapter(root, 'claude')).success, true);
    const after = await readFile(path);
    assert.ok(after.subarray(0, prefix.length).equals(prefix));
    assert.equal((await removeAdapter(root, 'claude')).success, true);
    assert.deepEqual(await readFile(path), prefix, 'removing restores exactly the owner\'s bytes');
  });

  it('a user-modified rc.2 block is still refused and never rewritten', async () => {
    const root = await copyOf('created');
    const path = join(root, 'CLAUDE.md');
    const edited = (await readFile(path, 'utf8')).replace('Before task work', 'Before ANY work');
    await writeFile(path, edited);
    for (const operation of [() => adapterStatus(root, 'claude'), () => installAdapter(root, 'claude'), () => removeAdapter(root, 'claude')]) {
      const result = await operation();
      assert.equal(result.success, false);
      assert.equal(result.state, 'CORRUPT');
    }
    assert.equal(await readFile(path, 'utf8'), edited);
  });

  it('--dry-run reports the upgrade without writing', async () => {
    const root = await copyOf('created');
    const path = join(root, 'AGENTS.md');
    const before = await readFile(path);
    const preview = await installAdapter(root, 'codex', true);
    assert.equal(preview.success, true);
    assert.equal(preview.changed, true);
    assert.deepEqual(await readFile(path), before);
  });
});
