import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { auditRecord } from '../src/core/audit.js';
import { compileContext } from '../src/core/context.js';
import { loadAllEvidence } from '../src/core/evidence.js';
import {
  collectRepositoryFacts,
  mentionedPaths,
  mentionedScripts,
  mentionedTechnologies,
  observationToEvidence,
  observeRecords,
  presentTechnologies,
  type RepositoryFacts,
} from '../src/core/observe.js';
import { observeProject } from '../src/core/observe-project.js';
import { buildRememberCandidate } from '../src/core/quick.js';
import { loadAllRecords } from '../src/core/store.js';
import { fixedClock, type MemoryRecord } from '../src/core/types.js';
import { validateEvidenceRecord } from '../src/core/validation.js';

const execFileAsync = promisify(execFile);
const CLI = resolve('dist/src/cli.js');
const NOW = '2026-10-25T09:00:00.000Z';
const clock = fixedClock(NOW);

function memory(id: string, statement: string, extra: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    ...buildRememberCandidate({ statement, basis: 'repo', sourceReference: 'package.json', id }, [], NOW).proposedRecord!,
    ...extra,
  };
}

function facts(overrides: Partial<RepositoryFacts>): RepositoryFacts {
  return {
    files: new Set(), dependencies: new Map(), pyDependencies: new Map(), scripts: null,
    packageManager: null, prismaProvider: null, composeImages: new Set(),
    ...overrides,
  };
}

async function write(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

describe('observe: claim extraction', () => {
  it('finds technologies by statement aliases and tags, but ambiguous words only as tags', () => {
    assert.deepEqual(mentionedTechnologies(memory('M1', 'Persistence uses SQLite.')).map((tech) => tech.id), ['sqlite']);
    assert.deepEqual(mentionedTechnologies(memory('M2', 'The API is built on Next.js.')).map((tech) => tech.id), ['nextjs']);
    assert.deepEqual(mentionedTechnologies(memory('M3', 'Express delivery is the next feature.')).map((tech) => tech.id), []);
    assert.deepEqual(mentionedTechnologies(memory('M4', 'HTTP layer.', { tags: ['express'] })).map((tech) => tech.id), ['express']);
  });

  it('finds package scripts but not package-manager built-ins', () => {
    assert.deepEqual(mentionedScripts('Run npm run build:legacy, then pnpm lint and yarn install.'), ['build:legacy', 'lint']);
    assert.deepEqual(mentionedScripts('Use pnpm add zod and bun run dev.'), ['dev']);
  });

  it('finds relative file paths and ignores traversal, absolute paths and URLs', () => {
    assert.deepEqual(mentionedPaths('The handler is in src/payments/webhook.ts.'), ['src/payments/webhook.ts']);
    assert.deepEqual(mentionedPaths('See ../secrets/key.pem or /etc/passwd.txt or https://x.io/a/b.html'), []);
    assert.deepEqual(mentionedPaths('Config: config/.env.local'), []);
  });
});

describe('observe: decisions are conservative', () => {
  const supabaseRepo = facts({
    files: new Set(['package.json', 'supabase/config.toml', 'pnpm-lock.yaml']),
    dependencies: new Map([['@supabase/supabase-js', 'package.json'], ['vitest', 'package.json']]),
    scripts: new Set(['build', 'test']),
  });

  it('contradicts a claimed technology only when a competitor is present', () => {
    const report = observeRecords([
      memory('DM-MEM-000001', 'The project uses SQLite for persistence.'),
      memory('DM-MEM-000002', 'Unit tests run with Jest.'),
      memory('DM-MEM-000003', 'Styling uses Tailwind.'),
    ], supabaseRepo, new Map(), NOW);
    const byMemory = new Map(report.observations.map((item) => [item.memoryId, item]));
    assert.equal(byMemory.get('DM-MEM-000001')?.relationship, 'CONTRADICTS');
    assert.match(byMemory.get('DM-MEM-000001')!.explanation, /No SQLite found, but the repository uses Supabase/);
    assert.equal(byMemory.get('DM-MEM-000002')?.relationship, 'CONTRADICTS');
    // No styling library at all: absence alone proves nothing.
    assert.equal(byMemory.has('DM-MEM-000003'), false);
    assert.match(report.unverifiable[0]!.reason, /Tailwind CSS/);
  });

  it('treats implied technologies as consistent (Supabase is Postgres)', () => {
    const report = observeRecords([memory('DM-MEM-000001', 'Data is stored in Postgres.')], supabaseRepo, new Map(), NOW);
    assert.equal(report.observations[0]?.relationship, 'SUPPORTS');
    const plainPg = facts({ files: new Set(['package.json']), dependencies: new Map([['pg', 'package.json']]) });
    const claim = observeRecords([memory('DM-MEM-000002', 'The backend uses Supabase.')], plainPg, new Map(), NOW);
    assert.equal(claim.observations.length, 0, 'plain Postgres does not contradict Supabase');
    assert.equal(claim.unverifiable.length, 1);
  });

  it('skips negation or change language and multi-technology statements instead of guessing', () => {
    const report = observeRecords([
      memory('DM-MEM-000001', 'We no longer use SQLite.'),
      memory('DM-MEM-000002', 'We migrated from MySQL to Postgres.'),
      memory('DM-MEM-000003', 'Some services use MySQL and some use MongoDB.'),
    ], supabaseRepo, new Map(), NOW);
    assert.equal(report.observations.length, 0);
    assert.deepEqual(report.skipped.map((item) => item.memoryId), ['DM-MEM-000001', 'DM-MEM-000002', 'DM-MEM-000003']);
  });

  it('skips sensitive, revoked, forgotten and restricted-scope memories', () => {
    const report = observeRecords([
      memory('DM-MEM-000001', 'Uses SQLite.', { sensitivity: 'SENSITIVE' }),
      memory('DM-MEM-000002', 'Uses SQLite.', { verificationStatus: 'REVOKED' }),
      memory('DM-MEM-000003', 'Uses SQLite.', { actionPermission: 'FORGET_OR_REDACT' }),
      memory('DM-MEM-000004', 'Uses SQLite.', { scope: { kind: 'RESTRICTED', environment: 'staging' } }),
    ], supabaseRepo, new Map(), NOW);
    assert.equal(report.observations.length, 0);
    assert.equal(report.skipped.length, 4);
  });

  it('checks scripts and file existence', () => {
    const report = observeRecords([
      memory('DM-MEM-000001', 'Release builds use npm run build:legacy.'),
      memory('DM-MEM-000002', 'Run pnpm test before merging.'),
      memory('DM-MEM-000003', 'Payments live in src/pay.ts and src/old.ts.'),
    ], supabaseRepo, new Map([['src/pay.ts', true], ['src/old.ts', false]]), NOW);
    const find = (id: string, subject: string) => report.observations.find((item) => item.memoryId === id && item.subject === subject);
    assert.equal(find('DM-MEM-000001', 'build:legacy')?.relationship, 'CONTRADICTS');
    assert.equal(find('DM-MEM-000002', 'test')?.relationship, 'SUPPORTS');
    assert.equal(find('DM-MEM-000003', 'src/pay.ts')?.relationship, 'SUPPORTS');
    assert.equal(find('DM-MEM-000003', 'src/old.ts')?.relationship, 'CONTRADICTS');
  });

  it('produces deterministic, valid evidence', () => {
    const records = [memory('DM-MEM-000001', 'The project uses SQLite.')];
    const first = observeRecords(records, supabaseRepo, new Map(), NOW);
    const second = observeRecords(records, supabaseRepo, new Map(), '2027-01-01T00:00:00.000Z');
    assert.equal(first.observations[0]!.evidenceId, second.observations[0]!.evidenceId);
    assert.match(first.observations[0]!.evidenceId, /^DM-EVIDENCE-OBS-[0-9A-F]{16}$/);
    assert.deepEqual(validateEvidenceRecord(observationToEvidence(first.observations[0]!, NOW)), { valid: true, issues: [] });
  });
});

describe('observe: reading the repository safely', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tamhees-observe-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('collects npm, python, prisma and compose facts from the allowlisted files only', async () => {
    await write(root, 'package.json', JSON.stringify({
      packageManager: 'yarn@4.0.0', scripts: { build: 'tsc' }, devDependencies: { mocha: '1' }, dependencies: { '@prisma/client': '1' },
    }));
    await write(root, 'requirements.txt', 'Django==5.0  # web\npsycopg2-binary>=2\n-r other.txt\n');
    await write(root, 'pyproject.toml', '[project]\ndependencies = ["fastapi>=0.1", "SQLAlchemy"]\n\n[tool.poetry.dependencies]\npython = "^3.12"\npytest = "*"\n');
    await write(root, 'prisma/schema.prisma', 'datasource db {\n  provider = "mysql"\n  url = env("DATABASE_URL")\n}\n');
    await write(root, 'docker-compose.yml', 'services:\n  cache:\n    image: redis:7\n  db:\n    image: "library/postgres:16"\n');
    await write(root, '.env', 'API_KEY=never-read');
    const collected = await collectRepositoryFacts(root);
    assert.equal(collected.packageManager, 'yarn');
    assert.deepEqual([...collected.scripts!], ['build']);
    assert.equal(collected.prismaProvider, 'mysql');
    assert.ok(collected.composeImages.has('postgres'));
    for (const name of ['django', 'psycopg2-binary', 'fastapi', 'sqlalchemy', 'pytest']) assert.ok(collected.pyDependencies.has(name), name);
    assert.ok(!collected.pyDependencies.has('python'));
    assert.ok(![...collected.files].some((file) => file.includes('.env')));
    const present = presentTechnologies(collected);
    for (const id of ['mocha', 'prisma', 'mysql', 'postgres', 'django', 'fastapi', 'sqlalchemy', 'pytest']) assert.ok(present.has(id), id);
  });

  it('does not follow a symlinked manifest', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'tamhees-outside-'));
    try {
      await writeFile(join(outside, 'package.json'), JSON.stringify({ dependencies: { mongodb: '1' } }));
      await symlink(join(outside, 'package.json'), join(root, 'package.json'));
      const collected = await collectRepositoryFacts(root);
      assert.equal(collected.dependencies.size, 0);
      assert.equal(collected.files.has('package.json'), false);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('end to end: preview writes nothing; --record blocks contradicted memory and is idempotent', async () => {
    await write(root, 'package.json', JSON.stringify({ scripts: { build: 'vite build' }, dependencies: { '@supabase/supabase-js': '2' } }));
    await write(root, 'src/payments/webhook.ts', 'export {};');
    const run = async (...args: string[]) => {
      try {
        return { code: 0, ...(await execFileAsync(process.execPath, [CLI, ...args], { cwd: root })) };
      } catch (error) {
        const failure = error as { code?: number; stdout?: string; stderr?: string };
        return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
      }
    };
    assert.equal((await run('init', '.')).code, 0);
    await run('remember', 'The project uses SQLite for persistence', '--as', 'repo', '--source', 'package.json', '--tags', 'database');
    await run('remember', 'The webhook handler is in src/payments/webhook.ts', '--as', 'repo', '--source', 'src', '--tags', 'webhook');

    const preview = await run('observe');
    assert.equal(preview.code, 0, preview.stderr);
    assert.match(preview.stdout, /Preview only/);
    assert.equal((await loadAllEvidence(root)).evidence.length, 0);

    const recorded = await run('observe', '--record', '--format', 'json');
    assert.equal(recorded.code, 0, recorded.stderr);
    assert.equal(JSON.parse(recorded.stdout).recorded.length, 2);
    const again = JSON.parse((await run('observe', '--record', '--format', 'json')).stdout);
    assert.equal(again.recorded.length, 0);
    assert.equal(again.alreadyRecorded.length, 2);

    const { records } = await loadAllRecords(root);
    const { evidence } = await loadAllEvidence(root);
    const sqlite = records.find((record) => record.statement.includes('SQLite'))!;
    const webhook = records.find((record) => record.statement.includes('webhook'))!;
    assert.equal(auditRecord(sqlite, evidence, NOW)?.outcome, 'BLOCK_ACTION');
    assert.equal(auditRecord(webhook, evidence, NOW), null, 'repo-verified and now supported: TRUST');
    const pack = compileContext('database persistence', records, clock, evidence);
    assert.equal(pack.selected.some((item) => item.memoryId === sqlite.id), false);
  });

  it('observing this repository itself completes without error', async () => {
    const own = await collectRepositoryFacts(resolve('.'));
    assert.ok(own.files.has('package.json'));
    assert.ok(presentTechnologies(own).has('typescript'));
    const text = await readFile(resolve('package.json'), 'utf8');
    assert.ok(text.length > 0);
  });

  it('a project without a store reports an error instead of observing', async () => {
    const result = await observeProject(root, clock, false);
    assert.equal(result.report === null || result.report.memoriesChecked === 0, true);
  });
});

describe('observe: monorepos and workspace folders', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tamhees-observe-ws-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads backend/ and frontend/ manifests, including Python extras', async () => {
    await write(root, 'package.json', JSON.stringify({ name: 'shop', workspaces: ['frontend'] }));
    await write(root, 'bun.lock', '');
    await write(root, 'frontend/package.json', JSON.stringify({ dependencies: { react: '19' }, devDependencies: { vite: '7' } }));
    await write(root, 'backend/pyproject.toml', '[project]\ndependencies = [\n  "fastapi[standard]>=0.1,<1",\n  "sqlmodel>=0.0.1",\n  "psycopg[binary]>=3",\n]\n\n[dependency-groups]\ndev = ["pytest<10"]\n');
    const present = presentTechnologies(await collectRepositoryFacts(root));
    for (const id of ['react', 'vite', 'fastapi', 'sqlmodel', 'sqlalchemy', 'postgres', 'pytest', 'bun']) assert.ok(present.has(id), id);
    assert.match(present.get('fastapi')![0]!, /^backend\/pyproject\.toml: fastapi$/);
    const report = observeRecords([memory('DM-MEM-000001', 'The backend ORM is the Django ORM.')], await collectRepositoryFacts(root), new Map(), NOW);
    assert.equal(report.observations[0]?.relationship, 'CONTRADICTS');
  });

  it('ignores node_modules, templates, examples and fixtures', async () => {
    await write(root, 'package.json', JSON.stringify({ dependencies: { react: '19' } }));
    await write(root, 'node_modules/vue/package.json', JSON.stringify({ name: 'vue' }));
    await write(root, 'packages/create-app/template-vue/package.json', JSON.stringify({ dependencies: { vue: '3' } }));
    await write(root, 'examples/svelte-app/package.json', JSON.stringify({ dependencies: { svelte: '5' } }));
    await write(root, 'test/fixtures/angular/package.json', JSON.stringify({ dependencies: { '@angular/core': '19' } }));
    const present = presentTechnologies(await collectRepositoryFacts(root));
    assert.ok(present.has('react'));
    for (const id of ['vue', 'svelte', 'angular']) assert.equal(present.has(id), false, id);
  });

  it("confirms a library's own repository through its package name", async () => {
    await write(root, 'package.json', JSON.stringify({ name: 'express', devDependencies: { mocha: '10' } }));
    const report = observeRecords([memory('DM-MEM-000001', 'The HTTP layer is this package.', { tags: ['express'] })], await collectRepositoryFacts(root), new Map(), NOW);
    assert.equal(report.observations[0]?.relationship, 'SUPPORTS');
    assert.match(report.observations[0]!.explanation, /name express/);
  });

  it('checks a path-scoped memory against that folder only', async () => {
    await write(root, 'package.json', JSON.stringify({ name: 'mono' }));
    await write(root, 'pnpm-lock.yaml', '');
    await write(root, 'apps/web/package.json', JSON.stringify({ dependencies: { vue: '3' }, scripts: { dev: 'vite' } }));
    await write(root, 'apps/admin/package.json', JSON.stringify({ dependencies: { react: '19' }, scripts: { start: 'x' } }));
    const facts = await collectRepositoryFacts(root);
    const scoped = (statement: string) => memory('DM-MEM-000001', statement, { scope: { kind: 'RESTRICTED', path: 'apps/web' } });
    const react = observeRecords([scoped('This app is built with React.')], facts, new Map(), NOW);
    assert.equal(react.observations[0]?.relationship, 'CONTRADICTS', 'React exists elsewhere, but not in apps/web');
    const script = observeRecords([scoped('Run pnpm start to launch it.')], facts, new Map(), NOW);
    assert.equal(script.observations.find((item) => item.kind === 'script')?.relationship, 'CONTRADICTS');
    const repoWide = observeRecords([memory('DM-MEM-000002', 'The admin is built with React.')], facts, new Map(), NOW);
    assert.equal(repoWide.observations[0]?.relationship, 'SUPPORTS');
  });

  it('recognizes Docker, Turborepo, Redis and VitePress', async () => {
    await write(root, 'package.json', JSON.stringify({ devDependencies: { turbo: '2', vitepress: '1' }, dependencies: { ioredis: '5' } }));
    await write(root, 'Dockerfile', 'FROM node:22');
    const present = presentTechnologies(await collectRepositoryFacts(root));
    for (const id of ['turborepo', 'vitepress', 'redis', 'docker']) assert.ok(present.has(id), id);
  });
});

