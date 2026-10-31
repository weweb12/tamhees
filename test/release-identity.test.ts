import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';
import { ENGINE_VERSION, PRODUCT_NAME, STORAGE_DIR, TAMHEES_MCP_TOOL_NAMES } from '../src/core/identity.js';
import { listAdapterDefinitions } from '../src/adapters/registry.js';

const root = resolve(process.cwd());
const text = async (path: string): Promise<string> => readFile(resolve(root, path), 'utf8');

describe('Release identity and documentation', () => {
  it('uses one release-candidate identity across package and engine', async () => {
    const packageJson = JSON.parse(await text('package.json')) as {
      name: string;
      version: string;
      license: string;
      dependencies?: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    assert.equal(PRODUCT_NAME, 'Tamhees');
    assert.equal(STORAGE_DIR, '.tamhees');
    assert.equal(packageJson.name, 'tamhees');
    assert.equal(packageJson.version, '1.0.0-rc.2');
    assert.equal(ENGINE_VERSION, packageJson.version);
    assert.equal(packageJson.license, 'UNLICENSED');
    assert.deepEqual(packageJson.dependencies ?? {}, {});
    assert.deepEqual(packageJson.devDependencies, {
      '@types/node': '22.20.1',
      typescript: '6.0.3',
    });
  });

  it('keeps exactly five adapters and four MCP tools', () => {
    assert.deepEqual(listAdapterDefinitions().map((item) => item.name), [
      'codex', 'antigravity', 'claude', 'generic', 'mcp',
    ]);
    assert.deepEqual(TAMHEES_MCP_TOOL_NAMES, [
      'tamhees_initialize_project',
      'tamhees_begin_task',
      'tamhees_finalize_task',
      'tamhees_status',
    ]);
  });

  it('contains the core documentation', async () => {
    for (const path of [
      'README.md',
      'SUBMISSION.md',
      'CHANGELOG.md',
      'THIRD_PARTY_NOTICES.md',
      'docs/ARCHITECTURE.md',
      'docs/PROTOCOL_SPECIFICATION.md',
      'docs/THREAT_MODEL.md',
      'docs/DECISIONS.md',
      'docs/FAQ.md',
    ]) {
      assert.ok((await text(path)).length > 200, `${path} should be substantive`);
    }
  });

  it('keeps the dashboard accessible: reduced motion, forced colors and visible focus', async () => {
    const css = await text('src/dashboard/public/dashboard.css');
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /@media \(forced-colors: active\)/);
    assert.match(css, /:focus-visible/);
  });

  it('keeps public claims bounded to deterministic fixture evidence', async () => {
    const combined = [await text('README.md'), await text('SUBMISSION.md'), await text('docs/FAQ.md')].join('\n');
    assert.match(combined, /22 fixed/i);
    assert.match(combined, /not universal/i);
    assert.doesNotMatch(combined, /\b(officially approved)\b/i);
    assert.doesNotMatch(combined, /formal external security audit (passed|complete)/i);
  });

  it('documents no public license and no runtime dependency', async () => {
    const notices = await text('THIRD_PARTY_NOTICES.md');
    assert.match(notices, /zero runtime dependencies/i);
    assert.match(notices, /All rights are reserved/i);
    assert.match(notices, /TypeScript \| 6\.0\.3/);
    assert.match(notices, /@types\/node \| 22\.20\.1/);
    assert.match(notices, /undici-types \| 6\.21\.0/);
  });
});
