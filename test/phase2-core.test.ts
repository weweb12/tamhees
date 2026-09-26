import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { auditRecord, runAudit } from '../src/core/audit.js';
import { compileContext } from '../src/core/context.js';
import { loadAllEvidence, storeEvidenceRecord } from '../src/core/evidence.js';
import { applyUpdateCandidate } from '../src/core/mutations.js';
import { loadAllRecords, loadIndex, rebuildMemoryIndex, initTamhees } from '../src/core/store.js';
import {
  CURRENT_SCHEMA_VERSION,
  type EvidenceRecord,
  type MemoryRecord,
  type UpdateCandidate,
} from '../src/core/types.js';
import { validateEvidenceRecord, validateUpdateCandidate } from '../src/core/validation.js';
import { STORAGE_DIR } from '../src/core/identity.js';

const execFileAsync = promisify(execFile);
const TIME_1 = '2026-07-20T08:00:00.000Z';
const TIME_2 = '2026-07-20T09:00:00.000Z';
const clock1 = () => TIME_1;
const clock2 = () => TIME_2;
const CLI_PATH = resolve('dist/src/cli.js');

function memory(
  id: string,
  overrides: Partial<MemoryRecord> = {},
): MemoryRecord {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    scope: { kind: 'PROJECT' },
    kind: 'DECISION',
    statement: `Memory statement for ${id}`,
    source: { type: 'AGENT_INFERENCE', reference: 'agent task summary', agent: 'test-agent' },
    verificationStatus: 'INFERRED',
    confidence: 'MEDIUM',
    freshness: { lastVerified: TIME_1 },
    sensitivity: 'INTERNAL',
    actionPermission: 'MAY_ACT',
    relationships: {},
    tags: ['phase2', 'memory'],
    recheckMethod: 'Inspect current repository state.',
    createdAt: TIME_1,
    updatedAt: TIME_1,
    ...overrides,
  };
}

function evidence(
  id: string,
  memoryIds: readonly string[],
  overrides: Partial<EvidenceRecord> = {},
): EvidenceRecord {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    type: 'REPOSITORY_STATE',
    source: 'package.json',
    content: 'The current repository supports this claim.',
    relationship: 'SUPPORTS',
    memoryIds,
    collectedAt: TIME_1,
    collectedBy: 'phase2-test',
    ...overrides,
  };
}

function candidate(
  action: UpdateCandidate['action'],
  overrides: Partial<UpdateCandidate> = {},
): UpdateCandidate {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    action,
    evidence: [],
    proposedBy: 'phase2-test-agent',
    authorityLevel: 'INFERRED',
    requiresOwnerApproval: false,
    reason: 'Exercise controlled Phase 2 behavior.',
    timestamp: TIME_1,
    ...overrides,
  };
}

describe('Phase 2 validation and evidence', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'tamhees-phase2-'));
    const initialized = await initTamhees(projectDir, clock1);
    assert.equal(initialized.success, true);
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('validates evidence structure and rejects unknown fields', () => {
    assert.equal(validateEvidenceRecord(evidence('EV-001', ['DM-MEM-000001'])).valid, true);
    const invalid = { ...evidence('EV-002', ['DM-MEM-000001']), unexpected: true };
    const result = validateEvidenceRecord(invalid);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((item) => item.code === 'UNKNOWN_FIELD'));
  });

  it('validates update-candidate action contracts', () => {
    const record = memory('DM-MEM-CREATE-001');
    assert.equal(validateUpdateCandidate(candidate('CREATE', { proposedRecord: record })).valid, true);
    const invalid = candidate('REVOKE', { proposedRecord: record });
    const result = validateUpdateCandidate(invalid);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((item) => item.code === 'UNEXPECTED_FIELD'));
  });

  it('stores and loads evidence, rejecting duplicate IDs', async () => {
    const item = evidence('EV-STORE-001', ['DM-MEM-000001']);
    const first = await storeEvidenceRecord(projectDir, item);
    assert.equal(first.success, true);
    const second = await storeEvidenceRecord(projectDir, item);
    assert.equal(second.success, false);
    assert.ok(second.errors.some((error) => error.code === 'DUPLICATE_ID'));

    const loaded = await loadAllEvidence(projectDir);
    assert.deepEqual(loaded.errors, []);
    assert.deepEqual(loaded.evidence, [item]);
  });

  it('rejects evidence that references unknown memory', async () => {
    const result = await storeEvidenceRecord(projectDir, evidence('EV-UNKNOWN-001', ['MISSING-MEMORY']));
    assert.equal(result.success, false);
    assert.ok(result.errors.some((error) => error.code === 'UNKNOWN_MEMORY'));
  });

  it('rejects secret-like evidence without echoing the secret', async () => {
    const fakeSecret = 'api_key=dm_example_secret_123456789';
    const item = evidence('EV-SECRET-001', ['DM-MEM-000001'], { content: fakeSecret });
    const result = await storeEvidenceRecord(projectDir, item);
    assert.equal(result.success, false);
    const serialized = JSON.stringify(result);
    assert.ok(serialized.includes('SECRET_LIKE_CONTENT'));
    assert.ok(!serialized.includes(fakeSecret));
    await assert.rejects(stat(join(projectDir, STORAGE_DIR, 'evidence', 'EV-SECRET-001.json')));
  });
});

describe('Phase 2 controlled mutations', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'tamhees-mutation-'));
    const initialized = await initTamhees(projectDir, clock1);
    assert.equal(initialized.success, true);
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('creates a validated record and updates index plus audit history', async () => {
    const record = memory('DM-MEM-CREATE-001');
    const result = await applyUpdateCandidate(projectDir, candidate('CREATE', { proposedRecord: record }), clock2);
    assert.equal(result.success, true);
    assert.equal(result.record?.createdAt, TIME_2);

    const index = await loadIndex(projectDir);
    assert.ok(index?.entries.some((item) => item.id === record.id));
    const history = await readFile(join(projectDir, STORAGE_DIR, 'audits', 'history.jsonl'), 'utf-8');
    assert.ok(history.includes(record.id));
    assert.ok(history.includes('DM-RULE-AUTH-006'));
  });

  it('rejects authority escalation without changing controlled files', async () => {
    const record = memory('DM-MEM-ESCALATE-001', {
      verificationStatus: 'OWNER_CONFIRMED',
      source: { type: 'AGENT_INFERENCE', reference: 'agent guess' },
    });
    const indexPath = join(projectDir, STORAGE_DIR, 'memories', 'index.json');
    const historyPath = join(projectDir, STORAGE_DIR, 'audits', 'history.jsonl');
    const indexBefore = await readFile(indexPath);
    const historyBefore = await readFile(historyPath);

    const result = await applyUpdateCandidate(projectDir, candidate('CREATE', { proposedRecord: record }), clock2);
    assert.equal(result.success, false);
    assert.ok(result.errors.some((error) => error.code === 'AUTHORITY_ESCALATION'));
    assert.deepEqual(await readFile(indexPath), indexBefore);
    assert.deepEqual(await readFile(historyPath), historyBefore);
  });

  it('updates with optimistic concurrency and archives the previous record', async () => {
    const original = memory('DM-MEM-UPDATE-001');
    const created = await applyUpdateCandidate(projectDir, candidate('CREATE', { proposedRecord: original }), clock1);
    assert.equal(created.success, true);
    const current = created.record as MemoryRecord;
    const proposed = { ...current, statement: 'Updated statement with repository context.' };
    const updated = await applyUpdateCandidate(
      projectDir,
      candidate('UPDATE', { memoryId: current.id, proposedRecord: proposed, authorityLevel: 'INFERRED' }),
      clock2,
    );
    assert.equal(updated.success, true);
    assert.ok(updated.archivePath);
    assert.equal(updated.record?.createdAt, TIME_1);
    assert.equal(updated.record?.updatedAt, TIME_2);
    const archived = JSON.parse(await readFile(join(projectDir, STORAGE_DIR, updated.archivePath as string), 'utf-8')) as MemoryRecord;
    assert.equal(archived.statement, original.statement);
  });

  it('rejects stale updates and preserves the current record', async () => {
    const original = memory('DM-MEM-STALE-001');
    const created = await applyUpdateCandidate(projectDir, candidate('CREATE', { proposedRecord: original }), clock1);
    const current = created.record as MemoryRecord;
    const recordPath = join(projectDir, STORAGE_DIR, 'memories', 'records', `${current.id}.json`);
    const before = await readFile(recordPath);
    const stale = { ...current, statement: 'Stale edit', updatedAt: '2026-07-19T00:00:00.000Z' };
    const result = await applyUpdateCandidate(projectDir, candidate('UPDATE', { memoryId: current.id, proposedRecord: stale }), clock2);
    assert.equal(result.success, false);
    assert.ok(result.errors.some((error) => error.code === 'STALE_UPDATE'));
    assert.deepEqual(await readFile(recordPath), before);
  });

  it('prevents lower authority from changing an owner-confirmed record', async () => {
    const initial = await applyUpdateCandidate(
      projectDir,
      candidate('CREATE', { proposedRecord: memory('DM-MEM-OWNER-001') }),
      clock1,
    );
    assert.equal(initial.success, true);
    const ownerEvidence = evidence('EV-OWNER-001', ['DM-MEM-OWNER-001'], {
      type: 'OWNER_INSTRUCTION',
      source: 'Owner approval record',
      content: 'The owner explicitly approved this project decision.',
    });
    assert.equal((await storeEvidenceRecord(projectDir, ownerEvidence)).success, true);
    const ownerRecord = {
      ...(initial.record as MemoryRecord),
      source: { type: 'OWNER_INSTRUCTION', reference: 'owner approval' },
      verificationStatus: 'OWNER_CONFIRMED',
      confidence: 'HIGH',
    } as MemoryRecord;
    const created = await applyUpdateCandidate(
      projectDir,
      candidate('UPDATE', {
        memoryId: ownerRecord.id,
        proposedRecord: ownerRecord,
        authorityLevel: 'OWNER_CONFIRMED',
        evidence: [ownerEvidence.id],
      }),
      clock1,
    );
    assert.equal(created.success, true);
    const proposed = { ...(created.record as MemoryRecord), statement: 'Agent attempted overwrite.' };
    const result = await applyUpdateCandidate(
      projectDir,
      candidate('UPDATE', { memoryId: ownerRecord.id, proposedRecord: proposed, authorityLevel: 'INFERRED' }),
      clock2,
    );
    assert.equal(result.success, false);
    assert.ok(result.errors.some((error) => error.code === 'AUTHORITY_NON_ESCALATION'));
  });

  it('prevents lower authority from overwriting repository-verified state', async () => {
    const verified = memory('DM-MEM-REPO-AUTHORITY', {
      source: { type: 'REPOSITORY_STATE', reference: 'package.json' },
      verificationStatus: 'REPO_VERIFIED',
      confidence: 'HIGH',
    });
    const created = await applyUpdateCandidate(
      projectDir,
      candidate('CREATE', { proposedRecord: verified, authorityLevel: 'REPO_VERIFIED' }),
      clock1,
    );
    assert.equal(created.success, true);
    const proposed = memory(verified.id, {
      createdAt: created.record?.createdAt ?? TIME_1,
      updatedAt: created.record?.updatedAt ?? TIME_1,
      statement: 'A lower-authority replacement attempt.',
    });
    const result = await applyUpdateCandidate(
      projectDir,
      candidate('UPDATE', { memoryId: verified.id, proposedRecord: proposed, authorityLevel: 'INFERRED' }),
      clock2,
    );
    assert.equal(result.success, false);
    assert.ok(result.errors.some((error) => error.code === 'INSUFFICIENT_AUTHORITY'));
  });

  it('rejects verification status that does not match source provenance', async () => {
    const mismatched = memory('DM-MEM-SOURCE-MISMATCH', {
      source: { type: 'AGENT_INFERENCE', reference: 'agent guess' },
      verificationStatus: 'REPO_VERIFIED',
      confidence: 'HIGH',
    });
    const result = await applyUpdateCandidate(
      projectDir,
      candidate('CREATE', { proposedRecord: mismatched, authorityLevel: 'REPO_VERIFIED' }),
      clock1,
    );
    assert.equal(result.success, false);
    assert.ok(result.errors.some((error) => error.code === 'SOURCE_AUTHORITY_MISMATCH'));
  });

  it('revokes a record, archives the prior state, and maintains the index', async () => {
    const created = await applyUpdateCandidate(
      projectDir,
      candidate('CREATE', { proposedRecord: memory('DM-MEM-REVOKE-001') }),
      clock1,
    );
    assert.equal(created.success, true);
    const revoked = await applyUpdateCandidate(
      projectDir,
      candidate('REVOKE', { memoryId: 'DM-MEM-REVOKE-001', reason: 'No longer valid.' }),
      clock2,
    );
    assert.equal(revoked.success, true);
    assert.equal(revoked.record?.verificationStatus, 'REVOKED');
    assert.equal(revoked.record?.actionPermission, 'MUST_NOT_ACT');
    assert.ok(revoked.archivePath);
    const index = await loadIndex(projectDir);
    assert.equal(index?.entries.find((item) => item.id === 'DM-MEM-REVOKE-001')?.verificationStatus, 'REVOKED');
  });

  it('redacts legacy raw secret content without copying it into archive or audit', async () => {
    const fakeSecret = 'password=dm_example_very_secret_12345';
    const legacy = memory('DM-MEM-REDACT-001', {
      statement: fakeSecret,
      sensitivity: 'SECRET',
      actionPermission: 'FORGET_OR_REDACT',
    });
    const recordPath = join(projectDir, STORAGE_DIR, 'memories', 'records', `${legacy.id}.json`);
    await writeFile(recordPath, `${JSON.stringify(legacy, null, 2)}\n`, 'utf-8');
    assert.equal((await rebuildMemoryIndex(projectDir, clock1)).success, true);

    const result = await applyUpdateCandidate(
      projectDir,
      candidate('REDACT', { memoryId: legacy.id, reason: 'Legacy secret cleanup.' }),
      clock2,
    );
    assert.equal(result.success, true);
    assert.equal(result.archivePath, null);
    assert.ok(result.record?.statement.startsWith('[REDACTED'));

    const controlledText = await readControlledText(join(projectDir, STORAGE_DIR));
    assert.ok(!controlledText.includes(fakeSecret));
    assert.ok(controlledText.includes('DM-MEM-REDACT-001'));
  });

  it('rejects secret-like CREATE input before persistence', async () => {
    const fakeSecret = 'api_key=dm_example_secret_987654321';
    const record = memory('DM-MEM-SECRET-CREATE', { statement: fakeSecret });
    const result = await applyUpdateCandidate(projectDir, candidate('CREATE', { proposedRecord: record }), clock2);
    assert.equal(result.success, false);
    assert.ok(result.errors.some((error) => error.code === 'SECRET_LIKE_CONTENT'));
    assert.ok(!JSON.stringify(result).includes(fakeSecret));
  });

  it('rejects an archive-directory symlink before touching its external target', async (t) => {
    const created = await applyUpdateCandidate(
      projectDir,
      candidate('CREATE', { proposedRecord: memory('DM-MEM-ARCHIVE-SYMLINK') }),
      clock1,
    );
    assert.equal(created.success, true);
    const outside = await mkdtemp(join(tmpdir(), 'tamhees-outside-'));
    const marker = join(outside, 'marker.txt');
    await writeFile(marker, 'unchanged', 'utf-8');
    const archiveMemories = join(projectDir, STORAGE_DIR, 'archive', 'memories');
    await mkdir(join(projectDir, STORAGE_DIR, 'archive'), { recursive: true });
    try {
      try {
        await symlink(outside, archiveMemories, 'junction');
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EPERM') {
          return t.skip('Windows account cannot create a test symlink.');
        }
        throw error;
      }
      const current = created.record as MemoryRecord;
      const result = await applyUpdateCandidate(
        projectDir,
        candidate('UPDATE', { memoryId: current.id, proposedRecord: { ...current, statement: 'Attempted update.' } }),
        clock2,
      );
      assert.equal(result.success, false);
      assert.ok(result.errors.some((error) => error.code === 'PATH_SAFETY'));
      assert.equal(await readFile(marker, 'utf-8'), 'unchanged');
      assert.deepEqual((await readdir(outside)).sort(), ['marker.txt']);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe('Phase 2 audit precedence and context safety', () => {
  it('privacy outranks conflict and revocation', () => {
    const record = memory('DM-MEM-PRECEDENCE', {
      sensitivity: 'SECRET',
      verificationStatus: 'CONFLICTED',
      actionPermission: 'MUST_NOT_ACT',
    });
    const result = runAudit([record], clock2);
    assert.equal(result.overallOutcome, 'FORGET_OR_REDACT');
    assert.equal(result.findings[0]?.ruleId, 'DM-RULE-PRIV-001');
  });

  it('contradictory evidence blocks action and is named in the finding', () => {
    const record = memory('DM-MEM-CONFLICT-EVIDENCE', {
      source: { type: 'REPOSITORY_STATE', reference: 'package.json' },
      verificationStatus: 'REPO_VERIFIED',
      confidence: 'HIGH',
    });
    const contradiction = evidence('EV-CONTRADICT-001', [record.id], { relationship: 'CONTRADICTS' });
    const result = runAudit([record], clock2, [contradiction]);
    assert.equal(result.overallOutcome, 'BLOCK_ACTION');
    assert.deepEqual(result.findings[0]?.evidenceExamined, [contradiction.id]);
  });

  it('names the explicit retention-permission and revocation rules', () => {
    const restricted = memory('DM-MEM-RETENTION', { actionPermission: 'FORGET_OR_REDACT' });
    const revoked = memory('DM-MEM-REVOKED', { verificationStatus: 'REVOKED' });
    assert.equal(auditRecord(restricted)?.ruleId, 'DM-RULE-PRIV-002');
    assert.equal(auditRecord(revoked)?.ruleId, 'DM-RULE-REVOKE-001');
  });

  it('requires stored owner evidence before OWNER_CONFIRMED can be trusted', () => {
    const record = memory('DM-MEM-OWNER-AUDIT', {
      source: { type: 'OWNER_INSTRUCTION', reference: 'owner conversation' },
      verificationStatus: 'OWNER_CONFIRMED',
      confidence: 'HIGH',
    });
    const withoutEvidence = auditRecord(record, [], TIME_2);
    assert.equal(withoutEvidence?.ruleId, 'DM-RULE-AUTH-004');
    const ownerEvidence = evidence('EV-OWNER-AUDIT', [record.id], {
      type: 'OWNER_INSTRUCTION',
      source: 'Owner approval record',
      content: 'The owner explicitly confirmed this decision.',
    });
    assert.equal(runAudit([record], clock2, [ownerEvidence]).overallOutcome, 'TRUST');
  });

  it('applies ASK_BEFORE_CHANGE and ACT_WITH_CAUTION authority rules', () => {
    const ask = memory('DM-MEM-ASK', {
      source: { type: 'REPOSITORY_STATE', reference: 'package.json' },
      verificationStatus: 'REPO_VERIFIED',
      confidence: 'HIGH',
      actionPermission: 'ASK_BEFORE_CHANGE',
    });
    const caution = { ...ask, id: 'DM-MEM-CAUTION', actionPermission: 'ACT_WITH_CAUTION' as const };
    assert.equal(auditRecord(ask, [], TIME_2)?.ruleId, 'DM-RULE-AUTH-003');
    assert.equal(auditRecord(caution, [], TIME_2)?.ruleId, 'DM-RULE-AUTH-005');
  });

  it('expired memory returns RECHECK while supported current memory returns TRUST', () => {
    const expired = memory('DM-MEM-EXPIRED', {
      source: { type: 'REPOSITORY_STATE', reference: 'package.json' },
      verificationStatus: 'REPO_VERIFIED',
      confidence: 'HIGH',
      freshness: { lastVerified: TIME_1, expiresAfter: '2026-07-20T08:30:00.000Z' },
    });
    const current = memory('DM-MEM-CURRENT', {
      source: { type: 'REPOSITORY_STATE', reference: 'package.json' },
      verificationStatus: 'REPO_VERIFIED',
      confidence: 'HIGH',
    });
    assert.equal(runAudit([expired], clock2).overallOutcome, 'RECHECK');
    assert.equal(runAudit([current], clock2).overallOutcome, 'TRUST');
  });

  it('applies conditional review and missing-declared-evidence rules', () => {
    const conditional = memory('DM-MEM-CONDITIONAL', {
      source: { type: 'REPOSITORY_STATE', reference: 'package.json' },
      verificationStatus: 'REPO_VERIFIED',
      confidence: 'HIGH',
      freshness: { lastVerified: TIME_1, reviewAfter: 'before changing the database' },
    });
    const missingEvidence = memory('DM-MEM-MISSING-EVIDENCE', {
      source: { type: 'REPOSITORY_STATE', reference: 'package.json' },
      verificationStatus: 'REPO_VERIFIED',
      confidence: 'HIGH',
      relationships: { supportedBy: ['EV-NOT-PRESENT'] },
    });
    assert.equal(auditRecord(conditional, [], TIME_2)?.ruleId, 'DM-RULE-FRESH-002');
    assert.equal(auditRecord(missingEvidence, [], TIME_2)?.ruleId, 'DM-RULE-EVID-001');
  });

  it('context excludes blocked memory and redacts sensitive selected memory', () => {
    const blocked = memory('DM-MEM-BLOCKED', {
      statement: 'Database migration uses a forbidden service.',
      verificationStatus: 'CONFLICTED',
      tags: ['database'],
    });
    const sensitive = memory('DM-MEM-SENSITIVE', {
      statement: 'Internal database architecture detail.',
      source: { type: 'REPOSITORY_STATE', reference: 'database/config' },
      verificationStatus: 'REPO_VERIFIED',
      confidence: 'HIGH',
      sensitivity: 'SENSITIVE',
      tags: ['database'],
    });
    const pack = compileContext('change database architecture', [blocked, sensitive], clock2);
    assert.ok(pack.excluded.some((item) => item.memoryId === blocked.id && item.reasonCode === 'conflicted'));
    assert.equal(pack.selected.find((item) => item.memoryId === sensitive.id)?.statement, '[REDACTED — SENSITIVE content]');
    assert.ok(pack.warnings.some((warning) => warning.includes(blocked.id)));
  });

  it('context explains stale selections and never echoes secret-like task input', () => {
    const dueForReview = memory('DM-MEM-CONTEXT-DUE', {
      statement: 'Database migration guidance.',
      source: { type: 'REPOSITORY_STATE', reference: 'database/config' },
      verificationStatus: 'REPO_VERIFIED',
      confidence: 'HIGH',
      freshness: { lastVerified: TIME_1, reviewAfter: '2026-07-20T08:30:00.000Z' },
      tags: ['database'],
    });
    const normal = compileContext('review database migration', [dueForReview], clock2);
    assert.equal(normal.selected[0]?.auditOutcome, 'RECHECK');
    assert.ok(normal.selected[0]?.reason.includes('review was due'));
    assert.ok(normal.warnings.some((warning) => warning.includes('RECHECK')));

    const fakeSecretTask = 'deploy with api_key=dm_example_secret_1122334455';
    const redacted = compileContext(fakeSecretTask, [dueForReview], clock2);
    assert.ok(!JSON.stringify(redacted).includes(fakeSecretTask));
    assert.ok(redacted.taskDescription.startsWith('[REDACTED'));
    assert.equal(redacted.selected.length, 0);
  });
});

describe('Phase 2 CLI operations', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'tamhees-cli2-'));
    await execFileAsync('node', [CLI_PATH, 'init', projectDir]);
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('memory apply, list, and show use the canonical store', async () => {
    const inputPath = join(projectDir, 'candidate.json');
    const input = candidate('CREATE', { proposedRecord: memory('DM-MEM-CLI-001') });
    await writeFile(inputPath, JSON.stringify(input), 'utf-8');
    const applyResult = await execFileAsync('node', [CLI_PATH, 'memory', 'apply', '--input', inputPath], { cwd: projectDir });
    assert.ok(applyResult.stdout.includes('DM-MEM-CLI-001'));
    const listResult = await execFileAsync('node', [CLI_PATH, 'memory', 'list'], { cwd: projectDir });
    assert.ok(listResult.stdout.includes('DM-MEM-CLI-001'));
    const showResult = await execFileAsync('node', [CLI_PATH, 'memory', 'show', 'DM-MEM-CLI-001'], { cwd: projectDir });
    assert.ok(showResult.stdout.includes('Memory statement for DM-MEM-CLI-001'));
  });

  it('evidence add and list persist validated evidence', async () => {
    const inputPath = join(projectDir, 'evidence.json');
    await writeFile(inputPath, JSON.stringify(evidence('EV-CLI-001', ['DM-MEM-000001'])), 'utf-8');
    const addResult = await execFileAsync('node', [CLI_PATH, 'evidence', 'add', '--input', inputPath], { cwd: projectDir });
    assert.ok(addResult.stdout.includes('EV-CLI-001'));
    const listResult = await execFileAsync('node', [CLI_PATH, 'evidence', 'list'], { cwd: projectDir });
    assert.ok(listResult.stdout.includes('EV-CLI-001'));
  });

  it('memory CLI never echoes a sensitive statement', async () => {
    const sensitiveText = 'Private internal deployment topology for the example project.';
    const legacy = memory('DM-MEM-CLI-SENSITIVE', {
      statement: sensitiveText,
      sensitivity: 'SENSITIVE',
      source: { type: 'REPOSITORY_STATE', reference: 'private/deployment/config' },
      verificationStatus: 'REPO_VERIFIED',
      confidence: 'HIGH',
    });
    await writeFile(
      join(projectDir, STORAGE_DIR, 'memories', 'records', `${legacy.id}.json`),
      JSON.stringify(legacy),
      'utf-8',
    );
    assert.equal((await rebuildMemoryIndex(projectDir, clock1)).success, true);
    const shown = await execFileAsync('node', [CLI_PATH, 'memory', 'show', legacy.id], { cwd: projectDir });
    const listed = await execFileAsync('node', [CLI_PATH, 'memory', 'list'], { cwd: projectDir });
    assert.ok(!shown.stdout.includes(sensitiveText));
    assert.ok(!shown.stdout.includes('private/deployment/config'));
    assert.ok(!listed.stdout.includes(sensitiveText));
    assert.ok(shown.stdout.includes('[REDACTED'));
  });

  it('controlled CREATE rejects raw sensitive retention', async () => {
    const inputPath = join(projectDir, 'sensitive-candidate.json');
    const input = candidate('CREATE', {
      proposedRecord: memory('DM-MEM-CLI-SENSITIVE-REJECT', {
        statement: 'Raw sensitive example content.',
        sensitivity: 'SENSITIVE',
      }),
    });
    await writeFile(inputPath, JSON.stringify(input), 'utf-8');
    await assert.rejects(
      execFileAsync('node', [CLI_PATH, 'memory', 'apply', '--input', inputPath], { cwd: projectDir }),
      (error: unknown) => (
        typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 1
        && 'stderr' in error
        && typeof error.stderr === 'string'
        && error.stderr.includes('RAW_SENSITIVE_RETENTION')
      ),
    );
  });

  it('unknown nested operations return usage exit code 2', async () => {
    await assert.rejects(
      execFileAsync('node', [CLI_PATH, 'memory', 'explode'], { cwd: projectDir }),
      (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 2,
    );
  });
});

async function readControlledText(root: string): Promise<string> {
  const parts: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name);
      const info = await stat(path);
      if (info.isDirectory()) {
        await walk(path);
      } else if (name.endsWith('.json') || name.endsWith('.jsonl')) {
        parts.push(await readFile(path, 'utf-8'));
      }
    }
  }
  await walk(root);
  return parts.join('\n');
}
