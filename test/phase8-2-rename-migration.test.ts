import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, it } from 'node:test';
import {
  ANTIGRAVITY_RULE_PATH,
  CLI_NAME,
  ENGINE_VERSION,
  LEGACY_STORAGE_DIR,
  MANAGED_BLOCK_START,
  PRODUCT_EXPLANATION,
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
  STORAGE_DIR,
  TAMHEES_MCP_TOOL_NAMES,
} from '../src/core/identity.js';
import { installAdapter } from '../src/adapters/managed-files.js';
import { listAdapterDefinitions } from '../src/adapters/registry.js';
import { createMcpTools } from '../src/mcp/tools.js';
import { migrateLegacyStorage } from '../src/core/legacy-storage.js';
import { initTamhees } from '../src/core/store.js';
import { fixedClock } from '../src/core/types.js';

const execFileAsync = promisify(execFile);
const CLI_PATH = resolve('dist/src/cli.js');
const NOW = '2026-07-25T08:00:00.000Z';
const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    const path = resolve(roots.pop()!);
    assert.ok(path.startsWith(resolve(tmpdir())), 'Temporary cleanup must remain inside os.tmpdir().');
    await rm(path, { recursive: true, force: true });
  }
});

async function project(prefix = 'tamhees-legacy-'): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  roots.push(path);
  return path;
}

async function legacyProject(): Promise<string> {
  const root = await project();
  assert.equal((await initTamhees(root, fixedClock(NOW))).success, true);
  await rename(join(root, STORAGE_DIR), join(root, LEGACY_STORAGE_DIR));
  return root;
}

describe('Phase 8.2 legacy-storage state machine', () => {
  it('returns no-migration-needed when neither directory exists', async () => {
    const root = await project();
    const result = await migrateLegacyStorage(root);
    assert.equal(result.success, true);
    assert.equal(result.state, 'NO_MIGRATION_NEEDED');
    assert.equal(result.changed, false);
    assert.equal(await exists(join(root, LEGACY_STORAGE_DIR)), false);
    assert.equal(await exists(join(root, STORAGE_DIR)), false);
  });

  it('validates canonical storage and returns an idempotent already-current result', async () => {
    const root = await project();
    assert.equal((await initTamhees(root, fixedClock(NOW))).success, true);
    const before = await treeDigest(join(root, STORAGE_DIR));
    const first = await migrateLegacyStorage(root);
    const second = await migrateLegacyStorage(root);
    assert.equal(first.state, 'ALREADY_CURRENT');
    assert.equal(second.state, 'ALREADY_CURRENT');
    assert.equal(first.changed, false);
    assert.equal(await treeDigest(join(root, STORAGE_DIR)), before);
  });

  it('keeps dry-run pure, then migrates with one validated rename and stays idempotent', async () => {
    const root = await legacyProject();
    const legacyBefore = await treeDigest(join(root, LEGACY_STORAGE_DIR));
    const dryRun = await migrateLegacyStorage(root, true);
    assert.equal(dryRun.success, true);
    assert.equal(dryRun.state, 'READY');
    assert.equal(dryRun.dryRun, true);
    assert.equal(dryRun.changed, false);
    assert.equal(await treeDigest(join(root, LEGACY_STORAGE_DIR)), legacyBefore);
    assert.equal(await exists(join(root, STORAGE_DIR)), false);

    const migrated = await migrateLegacyStorage(root);
    assert.equal(migrated.success, true);
    assert.equal(migrated.state, 'MIGRATED');
    assert.equal(migrated.changed, true);
    assert.match(migrated.atomicity, /same-parent directory rename.*local filesystem/i);
    assert.equal(await exists(join(root, LEGACY_STORAGE_DIR)), false);
    assert.equal(await treeDigest(join(root, STORAGE_DIR)), legacyBefore);

    const replay = await migrateLegacyStorage(root);
    assert.equal(replay.success, true);
    assert.equal(replay.state, 'ALREADY_CURRENT');
    assert.equal(replay.changed, false);
  });

  it('fails closed when both storage directories exist and preserves both byte-for-byte', async () => {
    const root = await legacyProject();
    assert.equal((await initTamhees(root, fixedClock(NOW))).success, true);
    const beforeLegacy = await treeDigest(join(root, LEGACY_STORAGE_DIR));
    const beforeCurrent = await treeDigest(join(root, STORAGE_DIR));
    const result = await migrateLegacyStorage(root);
    assert.equal(result.success, false);
    assert.equal(result.state, 'CONFLICT');
    assert.equal(result.diagnostics[0]?.code, 'BOTH_DIRECTORIES_EXIST');
    assert.equal(await treeDigest(join(root, LEGACY_STORAGE_DIR)), beforeLegacy);
    assert.equal(await treeDigest(join(root, STORAGE_DIR)), beforeCurrent);
  });

  it('rejects corrupted controlled artifacts without changing a byte', async () => {
    const root = await legacyProject();
    const configPath = join(root, LEGACY_STORAGE_DIR, 'config.json');
    await writeFile(configPath, '{"schemaVersion":"9.9.9"}\n', 'utf8');
    const before = await treeDigest(join(root, LEGACY_STORAGE_DIR));
    const result = await migrateLegacyStorage(root);
    assert.equal(result.success, false);
    assert.equal(result.state, 'INVALID_LEGACY');
    assert.equal(result.diagnostics[0]?.code, 'LEGACY_STORE_INVALID');
    assert.equal(await treeDigest(join(root, LEGACY_STORAGE_DIR)), before);
    assert.equal(await exists(join(root, STORAGE_DIR)), false);
    assert.doesNotMatch(JSON.stringify(result), /9\.9\.9|config\.json/);
  });

  it('rolls back an injected post-rename failure and preserves the complete legacy tree', async () => {
    const root = await legacyProject();
    const before = await treeDigest(join(root, LEGACY_STORAGE_DIR));
    const result = await migrateLegacyStorage(root, false, {
      afterRename: () => { throw new Error('injected private failure'); },
    });
    assert.equal(result.success, false);
    assert.equal(result.state, 'MIGRATION_FAILED');
    assert.equal(result.diagnostics[0]?.code, 'POST_VALIDATION_FAILED');
    assert.equal(await exists(join(root, STORAGE_DIR)), false);
    assert.equal(await treeDigest(join(root, LEGACY_STORAGE_DIR)), before);
    assert.doesNotMatch(JSON.stringify(result), /injected private failure/);
  });

  it('rejects a legacy storage link or nested junction and never touches the external target', async (t) => {
    const root = await project();
    const external = await legacyProject();
    const externalStore = join(external, LEGACY_STORAGE_DIR);
    const externalBefore = await treeDigest(externalStore);
    try {
      await symlink(externalStore, join(root, LEGACY_STORAGE_DIR), 'junction');
    } catch (error: unknown) {
      if (isLinkPrivilegeError(error)) {
        t.skip('Junction creation is unavailable in this Windows environment.');
        return;
      }
      throw error;
    }
    const result = await migrateLegacyStorage(root);
    assert.equal(result.success, false);
    assert.equal(result.state, 'PATH_UNSAFE');
    assert.equal(await treeDigest(externalStore), externalBefore);
    assert.equal(await exists(join(root, STORAGE_DIR)), false);
  });

  it('rejects traversal-like extra controlled paths and leaves them unchanged', async () => {
    const root = await legacyProject();
    const unexpected = join(root, LEGACY_STORAGE_DIR, 'memories', 'unexpected');
    await mkdir(unexpected);
    await writeFile(join(unexpected, 'artifact.json'), '{}\n', 'utf8');
    const before = await treeDigest(join(root, LEGACY_STORAGE_DIR));
    const result = await migrateLegacyStorage(root);
    assert.equal(result.state, 'INVALID_LEGACY');
    assert.equal(await treeDigest(join(root, LEGACY_STORAGE_DIR)), before);
  });
});

describe('Phase 8.2 legacy-storage CLI', () => {
  it('exposes the exact dry-run and real command with structured deterministic output', async () => {
    const root = await legacyProject();
    const before = await treeDigest(join(root, LEGACY_STORAGE_DIR));
    const dry = await execFileAsync('node', [CLI_PATH, 'migrate', 'legacy-storage', '--dry-run'], { cwd: root });
    const dryResult = JSON.parse(dry.stdout) as { state: string; dryRun: boolean; changed: boolean };
    assert.deepEqual(dryResult, { ...dryResult, state: 'READY', dryRun: true, changed: false });
    assert.equal(await treeDigest(join(root, LEGACY_STORAGE_DIR)), before);

    const migrated = await execFileAsync('node', [CLI_PATH, 'migrate', 'legacy-storage'], { cwd: root });
    const migratedResult = JSON.parse(migrated.stdout) as { state: string; changed: boolean };
    assert.equal(migratedResult.state, 'MIGRATED');
    assert.equal(migratedResult.changed, true);
    assert.equal(await treeDigest(join(root, STORAGE_DIR)), before);
  });

  it('rejects unknown and duplicate migration options with usage exit code 2', async () => {
    const root = await project();
    for (const args of [
      ['migrate', 'legacy-storage', '--unknown'],
      ['migrate', 'legacy-storage', '--dry-run', '--dry-run'],
    ]) {
      await assert.rejects(
        execFileAsync('node', [CLI_PATH, ...args], { cwd: root }),
        (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 2,
      );
    }
  });
});

describe('Phase 8.2 active-identity regression boundary', () => {
  it('exposes only the centralized Tamhees package, CLI, storage, and MCP identities', async () => {
    assert.equal(PRODUCT_NAME, 'Tamhees');
    assert.equal(PRODUCT_TAGLINE, 'Memory under scrutiny.');
    assert.equal(PRODUCT_EXPLANATION, 'Tamhees checks what an AI remembers before that memory is allowed to guide an action.');
    assert.equal(CLI_NAME, 'tamhees');
    assert.equal(STORAGE_DIR, '.tamhees');
    assert.equal(LEGACY_STORAGE_DIR, '.gptbrain');
    assert.equal(ENGINE_VERSION, '0.8.2');
    assert.equal(ANTIGRAVITY_RULE_PATH, '.agents/rules/tamhees.md');
    assert.equal(MANAGED_BLOCK_START, '<!-- TAMHEES:START -->');
    assert.deepEqual(TAMHEES_MCP_TOOL_NAMES, [
      'tamhees_initialize_project',
      'tamhees_begin_task',
      'tamhees_finalize_task',
      'tamhees_status',
    ]);

    const packageMetadata = JSON.parse(await readFile('package.json', 'utf8')) as {
      name: string;
      version: string;
      bin: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    assert.equal(packageMetadata.name, 'tamhees');
    assert.equal(packageMetadata.version, '0.8.2');
    assert.deepEqual(packageMetadata.bin, { tamhees: 'dist/src/cli.js' });
    assert.deepEqual(packageMetadata.dependencies, undefined);
    assert.deepEqual(packageMetadata.devDependencies, {
      '@types/node': '22.20.1',
      typescript: '6.0.3',
    });

    const help = await execFileAsync('node', [CLI_PATH, '--help']);
    const version = await execFileAsync('node', [CLI_PATH, '--version']);
    const migrationHelp = await execFileAsync('node', [CLI_PATH, 'migrate', '--help']);
    assert.match(help.stdout, /^tamhees v0\.8\.2 — Tamhees\nMemory under scrutiny\./);
    assert.match(migrationHelp.stdout, /tamhees migrate legacy-storage \[--dry-run\]/);
    assert.equal(version.stdout, 'tamhees v0.8.2\n');
    assert.doesNotMatch(`${help.stdout}${version.stdout}`, /Doubtful Memory|\bgptbrain\b|doubtful_memory_/);
  });

  it('keeps old active identity out of runtime and UI except two exact legacy-migration locations', async () => {
    const oldIdentity = /Doubtful Memory|doubtful_memory_|DOUBTFUL_MEMORY|\.gptbrain|\bgptbrain\b/g;
    const findings: { path: string; count: number; values: string[] }[] = [];
    for (const path of await walk(resolve('src'))) {
      if (!/\.(?:ts|js|html|css)$/u.test(path)) continue;
      const matches = [...(await readFile(path, 'utf8')).matchAll(oldIdentity)].map((match) => match[0]);
      if (matches.length > 0) findings.push({
        path: relative(resolve('.'), path).replaceAll('\\', '/'),
        count: matches.length,
        values: matches,
      });
    }
    assert.deepEqual(findings, [
      { path: 'src/core/identity.ts', count: 1, values: ['.gptbrain'] },
      { path: 'src/core/legacy-storage.ts', count: 1, values: ['.gptbrain'] },
    ]);
  });

  it('uses a precise legacy-name allowlist in current documentation and ignore safety rules', async () => {
    const expectedLegacyCounts = new Map<string, number>([
      ['.gitignore', 3],
      ['AGENTS.md', 0],
      ['PROJECT_BRAIN.md', 1],
      ['PROJECT_STATE.md', 3],
      ['README.md', 2],
      ['REQUIREMENTS_AND_ASSUMPTIONS.md', 1],
      ['RISK_REGISTER.md', 1],
      ['docs/ARCHITECTURE.md', 2],
      ['docs/PROTOCOL_SPECIFICATION.md', 3],
      ['docs/IMPLEMENTATION_ROADMAP.md', 0],
      ['docs/WEBSITE.md', 0],
    ]);
    const oldIdentity = /Doubtful Memory|doubtful_memory_|DOUBTFUL_MEMORY|\.gptbrain|\bgptbrain\b/g;
    for (const [path, expectedCount] of expectedLegacyCounts) {
      const matches = [...(await readFile(path, 'utf8')).matchAll(oldIdentity)].map((match) => match[0]);
      assert.equal(matches.length, expectedCount, `${path} legacy-name allowlist changed.`);
      assert.ok(matches.every((match) => match === '.gptbrain'), `${path} contains a non-migration legacy identity.`);
    }
    const decisions = await readFile('DECISIONS.md', 'utf8');
    const claims = await readFile('memory/MEMORY_CLAIMS.md', 'utf8');
    const audits = await readFile('memory/MEMORY_AUDIT.md', 'utf8');
    assert.match(decisions, /DM-DEC-014 - Product name and gptbrain engine\/CLI identity/);
    assert.match(decisions, /DM-DEC-035 - Approved Tamhees identity/);
    assert.match(claims, /DM-CLAIM-018[\s\S]*status: REVOKED[\s\S]*superseded_by: DM-CLAIM-028/);
    assert.match(claims, /DM-CLAIM-028[\s\S]*status: OWNER_CONFIRMED/);
    assert.match(audits, /DM-AUDIT-2026-07-25-008/);
  });

  it('generates Tamhees instructions for all five adapters and exactly four renamed MCP tools', async () => {
    const root = await project('tamhees-rename-adapters-');
    const definitions = listAdapterDefinitions();
    assert.deepEqual(definitions.map((item) => item.name), ['codex', 'antigravity', 'claude', 'generic', 'mcp']);
    for (const definition of definitions) {
      const result = await installAdapter(root, definition.name);
      assert.equal(result.success, true);
      const generated = await readFile(join(root, definition.instructionPath), 'utf8');
      assert.match(generated, /TAMHEES:START/);
      assert.match(generated, /# Tamhees/);
      assert.match(generated, /tamhees (?:adapter|mcp)/);
      assert.doesNotMatch(generated, /Doubtful Memory|\bgptbrain\b|doubtful_memory_/);
    }
    const tools = createMcpTools(root).list();
    assert.deepEqual(tools.map((tool) => tool.name), [...TAMHEES_MCP_TOOL_NAMES]);
    assert.equal(new Set(tools.map((tool) => tool.name)).size, 4);
  });
});
async function treeDigest(directory: string): Promise<string> {
  const hash = createHash('sha256');
  const files = await walk(directory);
  for (const path of files.sort()) {
    hash.update(relative(directory, path).replaceAll('\\', '/'));
    hash.update(await readFile(path));
  }
  return hash.digest('hex');
}

async function walk(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'EISDIR') return true;
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    try {
      await readdir(path);
      return true;
    } catch (nested: unknown) {
      if (nested instanceof Error && 'code' in nested && (nested as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw nested;
    }
  }
}

function isLinkPrivilegeError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && ['EPERM', 'EACCES'].includes(String((error as NodeJS.ErrnoException).code));
}