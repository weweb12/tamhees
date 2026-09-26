import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';
import { ENGINE_VERSION, PRODUCT_NAME, STORAGE_DIR, TAMHEES_MCP_TOOL_NAMES } from '../src/core/identity.js';
import { listAdapterDefinitions } from '../src/adapters/registry.js';

const execFileAsync = promisify(execFile);
const root = resolve(process.cwd());
const text = async (path: string): Promise<string> => readFile(resolve(root, path), 'utf8');

describe('Phase 9 release identity and documentation', () => {
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

  it('contains every required release-hardening document', async () => {
    for (const path of [
      'CHANGELOG.md',
      'THIRD_PARTY_NOTICES.md',
      'docs/THREAT_MODEL.md',
      'docs/DEMO_GUIDE.md',
      'docs/LOOM_SCRIPT.md',
      'docs/JUDGE_FAQ.md',
      'docs/RELEASE_CHECKLIST.md',
      'docs/RELEASE_NOTES_V1_RC1.md',
      'docs/RELEASE_NOTES_V1_RC2.md',
    ]) {
      assert.ok((await text(path)).length > 200, `${path} should be substantive`);
    }
  });

  it('states the owner-only and publication gates without false verification', async () => {
    const css = await text('src/dashboard/public/dashboard.css');
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /@media \(forced-colors: active\)/);
    assert.match(css, /:focus-visible/);
    const combined = [
      await text('docs/RELEASE_CHECKLIST.md'),
      await text('docs/RELEASE_NOTES_V1_RC2.md'),
    ].join('\n');
    assert.match(combined, /assistive-technology/i);
    assert.match(combined, /physical/i);
    assert.match(combined, /judge-comprehension/i);
    assert.match(combined, /Node 22/i);
    assert.match(combined, /UNLICENSED/);
    assert.match(combined, /publication/i);
    assert.doesNotMatch(combined, /formal external security audit (passed|complete)/i);
  });

  it('keeps judge claims bounded to deterministic fixture evidence', async () => {
    const combined = [
      await text('docs/DEMO_GUIDE.md'),
      await text('docs/LOOM_SCRIPT.md'),
      await text('docs/JUDGE_FAQ.md'),
    ].join('\n');
    assert.match(combined, /22 fixed/i);
    assert.match(combined, /not universal/i);
    assert.doesNotMatch(combined, /\b(first|unique|officially approved)\b/i);
  });
});

describe('Phase 9 local distribution safety', () => {
  it('is dry-run-first, outside-repository, overwrite refusing, and owner-launchable', async () => {
    const script = await text('scripts/prepare-release.ps1');
    const launcher = await text('scripts/portable/Start-Tamhees.ps1');
    const command = await text('scripts/portable/Open Tamhees Website.cmd');
    assert.match(script, /OutputDirectory/);
    assert.match(script, /Test-IsInside \$outputRoot \$repoRoot/);
    assert.match(script, /Refusing to overwrite/);
    assert.match(script, /DRY_RUN_OK/);
    assert.match(script, /NodeRuntimeDirectory/);
    assert.match(script, /Tamhees-Portable-Website-v1\.0\.0-rc\.2-Windows-x64\.zip/);
    assert.doesNotMatch(script, /source\.zip/i);
    assert.match(command, /PowerShell\.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Tamhees\.ps1"/);
    assert.match(launcher, /runtime\\node\.exe/);
    assert.match(launcher, /Keep this window open while viewing Tamhees/);
    assert.match(launcher, /TAMHEES_SMOKE_READY/);
    assert.match(launcher, /System\.Diagnostics\.ProcessStartInfo/);
    assert.match(launcher, /StandardOutput\.ReadLineAsync\(\)/);
    assert.doesNotMatch(launcher, /server\.(?:stdout|stderr)\.log/);
    assert.match(launcher, /Stop-Process -Id \$child\.Id/);
    assert.doesNotMatch(launcher, /Stop-Process\s+-Name|taskkill|killall/i);
  });

  it('excludes generated, storage, archive, log, and environment paths', async () => {
    const script = await text('scripts/prepare-release.ps1');
    for (const token of [
      String.raw`\.git`,
      'node_modules',
      'dist',
      'coverage',
      String.raw`\.gptbrain`,
      String.raw`\.tamhees`,
      String.raw`\.env`,
      String.raw`\.zip`,
      'log',
    ]) assert.match(script, new RegExp(token));
  });

  it('uses deterministic zip metadata, sorted integrity entries, and archive validation', async () => {
    const script = await text('scripts/prepare-release.ps1');
    assert.match(script, /2000, 1, 1/);
    assert.match(script, /Sort-Object ArchivePath/);
    assert.match(script, /LastWriteTime = \$fixedZipTime/);
    assert.match(script, /SHA256SUMS\.txt/);
    assert.match(script, /Assert-SafeArchive/);
    assert.match(script, /only the intended runtime\/node\.exe executable/);
    assert.match(script, /THIRD-PARTY-NOTICES\.txt/);
    assert.match(script, /dashboard\\public\\index\.html/);
    assert.match(script, /dashboard\\public\\dashboard\.css/);
  });

  it('performs a pure dry run outside the repository', async () => {
    const output = resolve(root, '..', 'tamhees-release-dry-run-test');
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', resolve(root, 'scripts/prepare-release.ps1'),
      '-OutputDirectory', output,
      '-DryRun',
    ], { cwd: root, windowsHide: true });
    assert.match(stdout, /DRY_RUN_OK/);
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
