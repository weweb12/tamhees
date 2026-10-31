import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { compileContext } from '../src/core/context.js';
import {
  buildForgetCandidate,
  buildRememberCandidate,
  buildRevokeCandidate,
  inspectRecords,
  nextMemoryId,
} from '../src/core/quick.js';
import { STORAGE_DIR } from '../src/core/identity.js';
import { CURRENT_SCHEMA_VERSION, fixedClock, type MemoryRecord } from '../src/core/types.js';
import { validateMemoryRecord } from '../src/core/validation.js';

const execFileAsync = promisify(execFile);
const CLI = resolve('dist/src/cli.js');
const NOW = '2026-10-25T09:00:00.000Z';

async function cli(cwd: string, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], { cwd });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

async function storageText(projectDir: string): Promise<string> {
  const parts: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else parts.push(`${path}\n${await readFile(path, 'utf8')}`);
    }
  }
  await walk(join(projectDir, STORAGE_DIR));
  return parts.join('\n');
}

describe('Remember: candidate builder', () => {
  it('maps each basis to an aligned source, authority, permission and review window', () => {
    const expectations = [
      ['inferred', 'INFERRED', 'AGENT_INFERENCE', 'ASK_BEFORE_CHANGE', 30],
      ['observed', 'OBSERVED', 'AGENT_OBSERVATION', 'ACT_WITH_CAUTION', 90],
      ['repo', 'REPO_VERIFIED', 'REPOSITORY_STATE', 'MAY_ACT', 180],
      ['test', 'TEST_VERIFIED', 'TEST_RESULT', 'MAY_ACT', 180],
      ['unknown', 'UNKNOWN', 'CONVERSATION_RECORD', 'ASK_BEFORE_CHANGE', 30],
    ] as const;
    for (const [basis, status, source, permission, days] of expectations) {
      const candidate = buildRememberCandidate({ statement: 'Builds use npm.', basis }, [], NOW);
      const record = candidate.proposedRecord!;
      assert.equal(candidate.authorityLevel, status, basis);
      assert.equal(record.verificationStatus, status, basis);
      assert.equal(record.source.type, source, basis);
      assert.equal(record.actionPermission, permission, basis);
      assert.equal(record.freshness.reviewAfter, new Date(Date.parse(NOW) + days * 86_400_000).toISOString(), basis);
      assert.deepEqual(validateMemoryRecord(record), { valid: true, issues: [] }, basis);
    }
  });

  it('defaults to an AI inference that must be confirmed before it guides change', () => {
    const record = buildRememberCandidate({ statement: 'The owner prefers purple.' }, [], NOW).proposedRecord!;
    assert.equal(record.verificationStatus, 'INFERRED');
    assert.equal(record.actionPermission, 'ASK_BEFORE_CHANGE');
  });

  it('builds restricted scope, expiry, normalized unique tags and the next free ID', () => {
    const record = buildRememberCandidate({
      statement: 'Staging uses the sandbox payment provider.',
      basis: 'observed',
      tags: ['Payments', 'payments', ' sandbox '],
      expiresInDays: 7,
      reviewInDays: 0,
      scope: { environment: 'staging' },
    }, ['DM-MEM-000001', 'DM-MEM-000009', 'OTHER-ID'], NOW).proposedRecord!;
    assert.equal(record.id, 'DM-MEM-000010');
    assert.deepEqual(record.tags, ['payments', 'sandbox']);
    assert.deepEqual(record.scope, { kind: 'RESTRICTED', environment: 'staging' });
    assert.equal(record.freshness.reviewAfter, undefined);
    assert.equal(record.freshness.expiresAfter, '2026-11-01T09:00:00.000Z');
    assert.equal(validateMemoryRecord(record).valid, true);
  });

  it('numbers memory IDs after the highest existing one', () => {
    assert.equal(nextMemoryId([]), 'DM-MEM-000001');
    assert.equal(nextMemoryId(['DM-MEM-000002', 'DM-MEM-000041', 'DM-MEM-EXAMPLE-001']), 'DM-MEM-000042');
  });

  it('forget and revoke builders never escalate authority without --as-owner', () => {
    const target = buildRememberCandidate({ statement: 'x y z', basis: 'repo' }, [], NOW).proposedRecord!;
    assert.equal(buildForgetCandidate('DM-MEM-000001', {}, NOW).authorityLevel, 'OBSERVED');
    assert.equal(buildForgetCandidate('DM-MEM-000001', { asOwner: true }, NOW).authorityLevel, 'OWNER_CONFIRMED');
    assert.equal(buildRevokeCandidate(target, {}, NOW).authorityLevel, 'REPO_VERIFIED');
    assert.equal(buildRevokeCandidate(target, { asOwner: true }, NOW).requiresOwnerApproval, true);
  });
});

describe('Inspect: what is remembered and how sure', () => {
  const base = (id: string, overrides: Partial<MemoryRecord>): MemoryRecord => ({
    ...buildRememberCandidate({ statement: 'Release builds use the legacy script.', basis: 'observed', id }, [], '2026-04-01T09:00:00.000Z').proposedRecord!,
    ...overrides,
  });

  it('reports freshness state, plain outcome, evidence and whether agents may see it', () => {
    const expired = base('DM-MEM-000001', { freshness: { lastVerified: '2026-04-01T09:00:00.000Z', expiresAfter: '2026-10-01T09:00:00.000Z' } });
    const current = base('DM-MEM-000002', { freshness: { lastVerified: '2026-10-24T09:00:00.000Z' }, actionPermission: 'MAY_ACT' });
    const report = inspectRecords([current, expired], [{
      schemaVersion: CURRENT_SCHEMA_VERSION, id: 'DM-EVIDENCE-1', type: 'REPOSITORY_STATE', source: 'package.json',
      content: 'Supports it.', relationship: 'SUPPORTS', memoryIds: ['DM-MEM-000002'],
      collectedAt: NOW, collectedBy: 'test',
    }], NOW);
    assert.deepEqual(report.memories.map((memory) => memory.id), ['DM-MEM-000001', 'DM-MEM-000002']);
    const [first, second] = report.memories;
    assert.equal(first!.freshness.state, 'EXPIRED');
    assert.equal(first!.servable, false);
    // The caution rule fires first in audit precedence; inspection still says it expired.
    assert.equal(first!.ruleId, 'DM-RULE-AUTH-005');
    assert.match(first!.explanation, /also expired/);
    assert.equal(second!.freshness.state, 'CURRENT');
    assert.equal(second!.servable, true);
    assert.deepEqual(second!.evidence.map((item) => item.relationship), ['SUPPORTS']);
  });

  it('agrees with retrieval about which memories may be served', () => {
    const records = [
      base('DM-MEM-000001', {}),
      base('DM-MEM-000002', { freshness: { lastVerified: '2026-04-01T09:00:00.000Z', expiresAfter: '2026-10-01T09:00:00.000Z' } }),
      base('DM-MEM-000003', { actionPermission: 'MUST_NOT_ACT' }),
      base('DM-MEM-000004', { verificationStatus: 'INFERRED', source: { type: 'AGENT_INFERENCE', reference: 'x' }, actionPermission: 'ASK_BEFORE_CHANGE' }),
    ];
    const report = inspectRecords(records, [], NOW);
    const pack = compileContext('release builds legacy script', records, fixedClock(NOW), []);
    for (const memory of report.memories) {
      assert.equal(pack.selected.some((item) => item.memoryId === memory.id), memory.servable, memory.id);
    }
  });
});

describe('Everyday commands through the real CLI', () => {
  let project: string;
  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'tamhees-quick-'));
    assert.equal((await cli(project, 'init', '.')).code, 0);
  });
  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  it('remembers a claim without any JSON and shows it in inspect', async () => {
    const stored = await cli(project, 'remember', 'The owner prefers purple interfaces', '--tags', 'design,color', '--confidence', 'high');
    assert.equal(stored.code, 0, stored.stderr);
    assert.match(stored.stdout, /Remembered DM-MEM-000002/);
    const inspected = JSON.parse((await cli(project, 'inspect', 'DM-MEM-000002', '--format', 'json')).stdout);
    assert.equal(inspected.memories[0].outcome, 'ASK_OWNER');
    assert.equal(inspected.memories[0].verificationStatus, 'INFERRED');
    assert.equal(inspected.memories[0].confidence, 'HIGH');
  });

  it('--dry-run validates without storing anything', async () => {
    const before = await storageText(project);
    const preview = await cli(project, 'remember', 'Builds use npm', '--as', 'repo', '--source', 'package.json', '--dry-run');
    assert.equal(preview.code, 0, preview.stderr);
    assert.match(preview.stdout, /Valid \(not stored\)/);
    assert.equal(await storageText(project), before);
  });

  it('refuses secret-like content and stores nothing', async () => {
    const fake = ['api', 'key=sk', 'live', 'FAKE0000000000000000000000'].join('_');
    const refused = await cli(project, 'remember', `Use ${fake} for payments`);
    assert.equal(refused.code, 1);
    assert.match(refused.stderr, /SECRET_LIKE_CONTENT/);
    assert.ok(!(await storageText(project)).includes('FAKE0000'));
  });

  it('forget erases the text everywhere and leaves a tombstone agents never see', async () => {
    await cli(project, 'remember', 'The owner works from the Al Barsha office on Sundays', '--as', 'observed', '--source', 'chat', '--tags', 'office');
    const forgot = await cli(project, 'forget', 'DM-MEM-000002', '--reason', 'Owner withdrew consent');
    assert.equal(forgot.code, 0, forgot.stderr);
    const text = await storageText(project);
    assert.ok(!text.includes('Al Barsha'));
    assert.ok(text.includes('DM-MEM-000002'));
    const inspected = JSON.parse((await cli(project, 'inspect', 'DM-MEM-000002', '--format', 'json')).stdout);
    assert.equal(inspected.memories[0].forgotten, true);
    assert.equal(inspected.memories[0].servable, false);
    const pack = JSON.parse((await cli(project, 'context', '--task', 'office schedule')).stdout);
    assert.equal(pack.selected.some((item: { memoryId: string }) => item.memoryId === 'DM-MEM-000002'), false);
  });

  it('revoke archives the prior state and blocks the memory', async () => {
    await cli(project, 'remember', 'The project uses Supabase', '--as', 'repo', '--source', 'package.json', '--tags', 'database');
    const revoked = await cli(project, 'revoke', 'DM-MEM-000002', '--reason', 'Migrated to Postgres');
    assert.equal(revoked.code, 0, revoked.stderr);
    const archived = await readdir(join(project, STORAGE_DIR, 'archive', 'memories', 'DM-MEM-000002'));
    assert.equal(archived.length, 1);
    const inspected = JSON.parse((await cli(project, 'inspect', 'DM-MEM-000002', '--format', 'json')).stdout);
    assert.equal(inspected.memories[0].verificationStatus, 'REVOKED');
    assert.equal(inspected.memories[0].outcome, 'BLOCK_ACTION');
  });

  it('inspect is read-only and never appends audit events', async () => {
    await cli(project, 'remember', 'Builds use npm', '--as', 'repo', '--source', 'package.json');
    const history = join(project, STORAGE_DIR, 'audits', 'history.jsonl');
    const before = await readFile(history, 'utf8');
    assert.equal((await cli(project, 'inspect')).code, 0);
    assert.equal(await readFile(history, 'utf8'), before);
  });

  it('rejects invalid usage with exit code 2', async () => {
    assert.equal((await cli(project, 'remember', 'x', '--as', 'owner')).code, 2);
    assert.equal((await cli(project, 'remember', 'x', '--expires-in', '0')).code, 2);
    assert.equal((await cli(project, 'remember')).code, 2);
    assert.equal((await cli(project, 'forget')).code, 2);
    assert.equal((await cli(project, 'inspect', '--format', 'xml')).code, 2);
  });
});
