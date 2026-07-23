import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { adapterStatus, installAdapter, removeAdapter } from '../src/adapters/managed-files.js';
import { isAdapterName } from '../src/adapters/registry.js';

const roots: string[] = [];
afterEach(async () => {
  while (roots.length > 0) await rm(roots.pop()!, { recursive: true, force: true });
});
async function project(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dm-managed-owner-'));
  roots.push(path);
  return path;
}

describe('Owner verification: managed instruction files', () => {
  it('preserves LF, CRLF, missing final newline, BOM, and empty pre-existing files exactly', async () => {
    const fixtures = [
      Buffer.from('LF file\nsecond line\n', 'utf8'),
      Buffer.from('CRLF file\r\nsecond line\r\n', 'utf8'),
      Buffer.from('No final newline', 'utf8'),
      Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from('BOM content\r\n', 'utf8')]),
      Buffer.alloc(0),
    ];
    for (const original of fixtures) {
      const root = await project();
      const path = join(root, 'AGENTS.md');
      await writeFile(path, original);
      assert.equal((await installAdapter(root, 'codex')).success, true);
      assert.ok((await readFile(path)).subarray(0, original.length).equals(original));
      assert.equal((await removeAdapter(root, 'codex')).success, true);
      assert.deepEqual(await readFile(path), original);
    }
  });

  it('refuses user-modified managed content and never deletes it', async () => {
    const root = await project();
    const path = join(root, 'CLAUDE.md');
    await installAdapter(root, 'claude');
    const installed = await readFile(path, 'utf8');
    await writeFile(path, installed.replace('Generated context is ephemeral.', 'User changed this managed line.'), 'utf8');
    const before = await readFile(path);
    for (const operation of [
      () => adapterStatus(root, 'claude'),
      () => installAdapter(root, 'claude'),
      () => removeAdapter(root, 'claude'),
    ]) {
      const result = await operation();
      assert.equal(result.success, false);
      assert.equal(result.state, 'CORRUPT');
    }
    assert.deepEqual(await readFile(path), before);
  });

  it('refuses a directory target and a symbolic-link target without touching external data', async () => {
    const directoryRoot = await project();
    await mkdir(join(directoryRoot, 'CLAUDE.md'));
    assert.equal((await installAdapter(directoryRoot, 'claude')).success, false);
    assert.equal((await lstat(join(directoryRoot, 'CLAUDE.md'))).isDirectory(), true);

    const linkRoot = await project();
    const externalRoot = await project();
    const external = join(externalRoot, 'outside.md');
    await writeFile(external, 'outside bytes\n', 'utf8');
    await symlink(external, join(linkRoot, 'AGENTS.md'), 'file');
    const before = await readFile(external);
    assert.equal((await installAdapter(linkRoot, 'codex')).success, false);
    assert.deepEqual(await readFile(external), before);
  });

  it('rejects unknown and case-variant adapter identifiers', () => {
    assert.equal(isAdapterName('codex'), true);
    for (const value of ['Codex', 'CODEX', 'unknown', '']) assert.equal(isAdapterName(value), false);
  });

  it('managed blocks contain no memory content, secret, developer path, or automatic-interception claim', async () => {
    const root = await project();
    for (const adapter of ['codex', 'antigravity', 'claude', 'generic', 'mcp'] as const) {
      await installAdapter(root, adapter);
      const status = await adapterStatus(root, adapter);
      const content = await readFile(join(root, status.path), 'utf8');
      assert.doesNotMatch(content, /C:\\Projects|C:\\Users|api[_-]?key|password|token\s*[:=]/i);
      assert.doesNotMatch(content, /automatically intercept|guarantees? (?:agent )?obedience/i);
      assert.doesNotMatch(content, /DM-MEM-\d|memory statement/i);
      await removeAdapter(root, adapter);
    }
  });
});
