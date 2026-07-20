/**
 * Doubtful Memory — Phase 1 Core Vertical Slice Tests
 *
 * Uses node:test and node:assert only.
 * Tests use isolated directories under os.tmpdir().
 * Tests never touch the real repository's .gptbrain/ data.
 * Fixed clocks are used where time appears in expected output.
 * No test uses network access.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm, readFile, readdir, writeFile, mkdir, stat, symlink, appendFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, readdirSync, statSync } from 'node:fs';

import { validateMemoryRecord, validateAuditEvent, validateConfig, validateState, isIso8601 } from '../src/core/validation.js';
import { CURRENT_SCHEMA_VERSION, fixedClock, type MemoryRecord } from '../src/core/types.js';
import { atomicWriteJson, verifyPathSafety, verifyStorageTreeSafety } from '../src/core/atomic-write.js';
import { initGptbrain, loadAllRecords, loadIndex } from '../src/core/store.js';
import { compileContext } from '../src/core/context.js';
import { auditRecord, runAudit, writeAuditEvents } from '../src/core/audit.js';
import { PRODUCT_NAME, CLI_NAME, STORAGE_DIR, ENGINE_VERSION } from '../src/core/identity.js';

const execFileAsync = promisify(execFile);

const FIXED_TIME = '2026-07-19T00:00:00.000Z';
const clock = fixedClock(FIXED_TIME);

// CLI path — compiled output
const CLI_PATH = join(import.meta.dirname, '..', 'src', 'cli.js');

// ─── Test helpers ───────────────────────────────────────────

function makeValidRecord(overrides?: Partial<MemoryRecord>): MemoryRecord {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'DM-MEM-TEST-001',
    kind: 'OBSERVATION',
    statement: 'Test memory record for unit testing.',
    source: {
      type: 'SYSTEM_OBSERVATION',
      reference: 'test-suite',
    },
    verificationStatus: 'REPO_VERIFIED',
    confidence: 'HIGH',
    freshness: {
      lastVerified: FIXED_TIME,
    },
    sensitivity: 'INTERNAL',
    actionPermission: 'MAY_ACT',
    relationships: {},
    tags: ['test', 'initialization'],
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    ...overrides,
  };
}

// ─── 1. Validation tests ────────────────────────────────────

describe('Validation', () => {
  it('Valid memory record passes runtime validation', () => {
    const record = makeValidRecord();
    const result = validateMemoryRecord(record);
    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  it('Missing required field fails with structured issue', () => {
    const record = makeValidRecord();
    const { statement: _, ...incomplete } = record;
    const result = validateMemoryRecord(incomplete);
    assert.equal(result.valid, false);
    const stmtIssue = result.issues.find((i) => i.field === 'statement');
    assert.ok(stmtIssue);
    assert.equal(stmtIssue.code, 'MISSING_REQUIRED');
  });

  it('Unsupported schema version mentions preservation', () => {
    const config = { schemaVersion: '99.0.0', projectName: 'test', createdAt: FIXED_TIME };
    const result = validateConfig(config);
    assert.equal(result.valid, false);
    const issue = result.issues.find((i: import('../src/core/types.js').ValidationIssue) => i.field === 'schemaVersion');
    assert.ok(issue);
    assert.ok(issue.message.includes('preserved'), 'Should mention the file was preserved');
  });

  it('Invalid timestamp fails validation', () => {
    const record = makeValidRecord({
      freshness: { lastVerified: 'not-a-date' }
    });
    const result = validateMemoryRecord(record);
    assert.equal(result.valid, false);
    const issue = result.issues.find((i) => i.field === 'freshness.lastVerified');
    assert.ok(issue);
  });

  it('JSONL audit event validates properly', () => {
    const event = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      eventId: 'evt-123',
      timestamp: FIXED_TIME,
      memoryId: 'mem-1',
      outcome: 'TRUST',
      triggeredRules: [],
      explanation: 'Test',
      permissionConsequence: 'Test',
      recommendedAction: 'Test',
      auditor: 'test',
      engineVersion: '0.1.0'
    };
    const result = validateAuditEvent(event);
    assert.equal(result.valid, true);
  });

  it('isIso8601 accepts valid leap-year date', () => {
    assert.equal(isIso8601('2028-02-29T00:00:00Z'), true);
  });

  it('isIso8601 rejects invalid non-leap date', () => {
    assert.equal(isIso8601('2026-02-29T00:00:00Z'), false);
  });

  it('isIso8601 rejects invalid date (Feb 30)', () => {
    assert.equal(isIso8601('2026-02-30T00:00:00Z'), false);
  });

  it('isIso8601 rejects invalid month', () => {
    assert.equal(isIso8601('2026-13-01T00:00:00Z'), false);
    assert.equal(isIso8601('2026-00-01T00:00:00Z'), false);
  });

  it('isIso8601 rejects invalid hour', () => {
    assert.equal(isIso8601('2026-01-01T24:00:00Z'), false);
  });

  it('isIso8601 accepts valid fractional seconds', () => {
    assert.equal(isIso8601('2026-01-01T00:00:00.123Z'), true);
  });
});

// ─── 2. Init and store tests ────────────────────────────────

describe('Init and Store', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'gptbrain-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('init derives projectName from directory basename', async () => {
    await initGptbrain(testDir, clock);
    const config = JSON.parse(await readFile(join(testDir, STORAGE_DIR, 'config.json'), 'utf-8'));
    assert.equal(config.projectName, basename(testDir));
  });

  it('second init is idempotent and does not overwrite', async () => {
    await initGptbrain(testDir, clock);
    const recordPath = join(testDir, STORAGE_DIR, 'memories', 'records', 'DM-MEM-000001.json');
    const original = JSON.parse(await readFile(recordPath, 'utf-8'));
    const modified = { ...original, statement: 'Modified statement' };
    await writeFile(recordPath, JSON.stringify(modified), 'utf-8');

    const result2 = await initGptbrain(testDir, clock);
    assert.equal(result2.success, true);
    assert.equal(result2.created.length, 0);

    const afterInit = JSON.parse(await readFile(recordPath, 'utf-8'));
    assert.equal(afterInit.statement, 'Modified statement', 'Existing valid data must be preserved');
  });

  it('duplicate or filename-mismatched IDs cause index build to fail', async () => {
    await initGptbrain(testDir, clock);
    const recordsDir = join(testDir, STORAGE_DIR, 'memories', 'records');
    const r1 = makeValidRecord({ id: 'DUP-1' });
    const r2 = makeValidRecord({ id: 'DUP-1' }); // Same ID
    await writeFile(join(recordsDir, 'r1.json'), JSON.stringify(r1));
    await writeFile(join(recordsDir, 'r2.json'), JSON.stringify(r2));

    const result = await initGptbrain(testDir, clock);
    assert.equal(result.success, false);
    assert.ok(result.errors.some(e => e.includes('Duplicate memory ID') || e.includes('filename mismatch')), 'Should fail on duplicate or mismatched canonical identity');
  });

  it('malformed records do not change index.json', async () => {
    await initGptbrain(testDir, clock);
    const indexBefore = await readFile(join(testDir, STORAGE_DIR, 'memories', 'index.json'), 'utf-8');

    // Write malformed record
    await writeFile(join(testDir, STORAGE_DIR, 'memories', 'records', 'bad.json'), 'BAD JSON');
    const result = await initGptbrain(testDir, clock);

    // Init should fail, and index should be untouched
    assert.equal(result.success, false);
    const indexAfter = await readFile(join(testDir, STORAGE_DIR, 'memories', 'index.json'), 'utf-8');
    assert.equal(indexBefore, indexAfter);
  });

  it('Invalid config timestamp makes init fail', async () => {
    await initGptbrain(testDir, clock);
    const configPath = join(testDir, STORAGE_DIR, 'config.json');
    const content = JSON.parse(await readFile(configPath, 'utf-8'));
    content.createdAt = 'not-a-date';
    await writeFile(configPath, JSON.stringify(content));
    const bytesBefore = await readFile(configPath);
    const result = await initGptbrain(testDir, clock);
    assert.equal(result.success, false);
    const bytesAfter = await readFile(configPath);
    assert.deepEqual(bytesAfter, bytesBefore);
  });

  it('Unsupported state schema makes init fail', async () => {
    await initGptbrain(testDir, clock);
    const statePath = join(testDir, STORAGE_DIR, 'state.json');
    const content = JSON.parse(await readFile(statePath, 'utf-8'));
    content.schemaVersion = '99.0.0';
    await writeFile(statePath, JSON.stringify(content));
    const bytesBefore = await readFile(statePath);
    const result = await initGptbrain(testDir, clock);
    assert.equal(result.success, false);
    assert.ok(result.errors.some(e => e.includes('schemaVersion') && e.includes('preserv')), 'Should mention schemaVersion and preservation');
    const bytesAfter = await readFile(statePath);
    assert.deepEqual(bytesAfter, bytesBefore);
  });


  it('Invalid state timestamp makes init fail', async () => {
    await initGptbrain(testDir, clock);
    const statePath = join(testDir, STORAGE_DIR, 'state.json');
    const content = JSON.parse(await readFile(statePath, 'utf-8'));
    content.lastOperationAt = 'not-a-date';
    await writeFile(statePath, JSON.stringify(content));
    const bytesBefore = await readFile(statePath);
    const result = await initGptbrain(testDir, clock);
    assert.equal(result.success, false);
    const bytesAfter = await readFile(statePath);
    assert.deepEqual(bytesAfter, bytesBefore);
  });

  it('Unsupported config schema makes init fail', async () => {
    await initGptbrain(testDir, clock);
    const configPath = join(testDir, STORAGE_DIR, 'config.json');
    const content = JSON.parse(await readFile(configPath, 'utf-8'));
    content.schemaVersion = '99.0.0';
    await writeFile(configPath, JSON.stringify(content));
    const bytesBefore = await readFile(configPath);
    const result = await initGptbrain(testDir, clock);
    assert.equal(result.success, false);
    const bytesAfter = await readFile(configPath);
    assert.deepEqual(bytesAfter, bytesBefore);
  });

  it('Malformed history makes init fail and remains byte-for-byte unchanged', async () => {
    await initGptbrain(testDir, clock);
    const historyPath = join(testDir, STORAGE_DIR, 'audits', 'history.jsonl');
    await appendFile(historyPath, 'not-json\n');
    const bytesBefore = await readFile(historyPath);
    const result = await initGptbrain(testDir, clock);
    assert.equal(result.success, false);
    const bytesAfter = await readFile(historyPath);
    assert.deepEqual(bytesAfter, bytesBefore);
  });

  it('Repeated init preserving a valid record byte-for-byte', async () => {
    await initGptbrain(testDir, clock);
    const recordPath = join(testDir, STORAGE_DIR, 'memories', 'records', 'DM-MEM-000001.json');
    const bytesBefore = await readFile(recordPath);
    await initGptbrain(testDir, clock);
    const bytesAfter = await readFile(recordPath);
    assert.deepEqual(bytesAfter, bytesBefore);
  });

  it('Invalid index timestamp is rejected', async () => {
    await initGptbrain(testDir, clock);
    const indexPath = join(testDir, STORAGE_DIR, 'memories', 'index.json');
    const content = JSON.parse(await readFile(indexPath, 'utf-8'));
    content.lastRebuilt = 'not-a-date';
    await writeFile(indexPath, JSON.stringify(content));
    const idx = await loadIndex(testDir);
    assert.equal(idx, null);
  });

  it('Invalid index entry vocabulary is rejected', async () => {
    await initGptbrain(testDir, clock);
    const indexPath = join(testDir, STORAGE_DIR, 'memories', 'index.json');
    const content = JSON.parse(await readFile(indexPath, 'utf-8'));
    content.entries = [{ id: 'TEST', kind: 'BOGUS', tags: [], verificationStatus: 'TRUST', updatedAt: FIXED_TIME }];
    await writeFile(indexPath, JSON.stringify(content));
    const idx = await loadIndex(testDir);
    assert.equal(idx, null);
  });
});

// ─── 3. Path Safety tests ───────────────────────────────────

describe('Path Safety', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'gptbrain-test-'));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('nested symlink present before init is rejected', async (t) => {
    const storageDir = join(testDir, STORAGE_DIR);
    await mkdir(storageDir, { recursive: true });

    const outsideDir = await mkdtemp(join(tmpdir(), 'gptbrain-outside-'));
    try {
      try {
        await symlink(outsideDir, join(storageDir, 'memories'), 'junction');
      } catch (e: any) {
        if (e.code === 'EPERM') return t.skip('Windows missing privilege to create symlink');
        throw e;
      }

      const result = await initGptbrain(testDir, clock);
      assert.equal(result.success, false);
      assert.ok(result.errors.some(e => e.includes('Symbolic link detected')), 'Should reject symlink before init');
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('records directory symlink after init is rejected on read', async (t) => {
    await initGptbrain(testDir, clock);
    const recordsDir = join(testDir, STORAGE_DIR, 'memories', 'records');
    await rm(recordsDir, { recursive: true, force: true });

    const outsideDir = await mkdtemp(join(tmpdir(), 'gptbrain-outside-'));
    try {
      try {
        await symlink(outsideDir, recordsDir, 'junction');
      } catch (e: any) {
        if (e.code === 'EPERM') return t.skip('Windows missing privilege to create symlink');
        throw e;
      }

      const { errors } = await loadAllRecords(testDir);
      assert.ok(errors.some(e => e.includes('Symbolic link detected')), 'Should reject symlink on read');
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('audit history symlink after init is rejected on append', async (t) => {
    await initGptbrain(testDir, clock);
    const auditsDir = join(testDir, STORAGE_DIR, 'audits');
    const historyFile = join(auditsDir, 'history.jsonl');
    await rm(historyFile, { force: true });

    const outsideDir = await mkdtemp(join(tmpdir(), 'gptbrain-outside-'));
    const outsideFile = join(outsideDir, 'history.jsonl');
    await writeFile(outsideFile, 'initial content');
    const bytesBefore = await readFile(outsideFile);

    try {
      try {
        await symlink(outsideFile, historyFile, 'file');
      } catch (e: any) {
        if (e.code === 'EPERM') return t.skip('Windows missing privilege to create symlink');
        throw e;
      }

      const record = makeValidRecord();
      const result = runAudit([record], clock);
      try {
        await writeAuditEvents(testDir, result, [record], clock);
        assert.fail('Should have thrown on symlink write');
      } catch (e: any) {
        assert.ok(e.message.includes('Symbolic link detected') || e.message.includes('Path safety check failed'), 'Should reject symlink on write');
      }
      const bytesAfter = await readFile(outsideFile);
      assert.deepEqual(bytesAfter, bytesBefore, 'External target should be completely untouched');
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('individual record-file symlink is rejected and external target untouched', async (t) => {
    await initGptbrain(testDir, clock);
    const recordsDir = join(testDir, STORAGE_DIR, 'memories', 'records');
    const recordPath = join(recordsDir, 'DM-MEM-TEST-002.json');

    const outsideDir = await mkdtemp(join(tmpdir(), 'gptbrain-outside-'));
    const outsideFile = join(outsideDir, 'DM-MEM-TEST-002.json');
    const externalRecord = makeValidRecord({ id: 'DM-MEM-TEST-002' });
    await writeFile(outsideFile, JSON.stringify(externalRecord));
    const bytesBefore = await readFile(outsideFile);

    try {
      try {
        await symlink(outsideFile, recordPath, 'file');
      } catch (e: any) {
        if (e.code === 'EPERM') return t.skip('Windows missing privilege to create symlink');
        throw e;
      }

      const { records, errors } = await loadAllRecords(testDir);
      assert.ok(errors.some(e => e.includes('Path safety check failed')), 'Should reject individual record symlink');
      assert.equal(records.some(r => r.id === 'DM-MEM-TEST-002'), false, 'Should not load external record');

      const bytesAfter = await readFile(outsideFile);
      assert.deepEqual(bytesAfter, bytesBefore, 'External target should be completely untouched');
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('index-file symlink is rejected and external target untouched', async (t) => {
    await initGptbrain(testDir, clock);
    const indexPath = join(testDir, STORAGE_DIR, 'memories', 'index.json');
    await rm(indexPath, { force: true });

    const outsideDir = await mkdtemp(join(tmpdir(), 'gptbrain-outside-'));
    const outsideFile = join(outsideDir, 'index.json');
    await writeFile(outsideFile, JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, entries: [], lastRebuilt: FIXED_TIME }));
    const bytesBefore = await readFile(outsideFile);

    try {
      try {
        await symlink(outsideFile, indexPath, 'file');
      } catch (e: any) {
        if (e.code === 'EPERM') return t.skip('Windows missing privilege to create symlink');
        throw e;
      }

      const idx = await loadIndex(testDir);
      assert.equal(idx, null, 'Index should be null because it was a symlink');
      const bytesAfter = await readFile(outsideFile);
      assert.deepEqual(bytesAfter, bytesBefore, 'External target should be completely untouched');
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('Normal files still work', async () => {
    await initGptbrain(testDir, clock);
    const { records, errors } = await loadAllRecords(testDir);
    assert.equal(errors.length, 0);
    assert.ok(records.length > 0);
  });
});

// ─── 4. Audit Fail-safe tests ───────────────────────────────

describe('Audit Fail-safe', () => {
  it('CONFLICTED produces BLOCK_ACTION', () => {
    const record = makeValidRecord({ verificationStatus: 'CONFLICTED' });
    const finding = auditRecord(record);
    assert.equal(finding?.outcome, 'BLOCK_ACTION');
  });

  it('REVOKED produces BLOCK_ACTION', () => {
    const record = makeValidRecord({ verificationStatus: 'REVOKED' });
    const finding = auditRecord(record);
    assert.equal(finding?.outcome, 'BLOCK_ACTION');
  });

  it('UNKNOWN produces RECHECK', () => {
    const record = makeValidRecord({ verificationStatus: 'UNKNOWN' });
    const finding = auditRecord(record);
    assert.equal(finding?.outcome, 'RECHECK');
  });

  it('SECRET produces FORGET_OR_REDACT', () => {
    const record = makeValidRecord({ sensitivity: 'SECRET' });
    const finding = auditRecord(record);
    assert.equal(finding?.outcome, 'FORGET_OR_REDACT');
  });

  it('MUST_NOT_ACT produces BLOCK_ACTION', () => {
    const record = makeValidRecord({ actionPermission: 'MUST_NOT_ACT' });
    const finding = auditRecord(record);
    assert.equal(finding?.outcome, 'BLOCK_ACTION');
  });

  it('FORGET_OR_REDACT produces FORGET_OR_REDACT', () => {
    const record = makeValidRecord({ actionPermission: 'FORGET_OR_REDACT' });
    const finding = auditRecord(record);
    assert.equal(finding?.outcome, 'FORGET_OR_REDACT');
  });

  it('Normal fully supported records receive TRUST after Phase 2 rules', () => {
    const record = makeValidRecord();
    const result = runAudit([record], clock);
    assert.equal(result.overallOutcome, 'TRUST');
    assert.equal(result.findings.length, 0);
  });

  it('DM-RULE-AUTH-001: AGENT_INFERENCE + OWNER_CONFIRMED produces BLOCK_ACTION', () => {
    const record = makeValidRecord({
      source: { type: 'AGENT_INFERENCE', reference: 'test' },
      verificationStatus: 'OWNER_CONFIRMED',
    });
    const finding = auditRecord(record);
    assert.equal(finding?.outcome, 'BLOCK_ACTION');
    assert.equal(finding?.ruleId, 'DM-RULE-AUTH-001');
    assert.ok(finding?.recommendedNextStep.includes('explicit owner confirmation'));
  });

  it('Identical fixed inputs produce identical audit results', () => {
    const records = [makeValidRecord({ id: 'R1' }), makeValidRecord({ id: 'R2', sensitivity: 'SECRET' })];
    const res1 = runAudit(records, clock);
    const res2 = runAudit(records, clock);
    assert.deepEqual(res1, res2);
  });

  it('Malformed history makes audit fail and remains byte-for-byte unchanged', async () => {
    const testDir = await mkdtemp(join(tmpdir(), 'gptbrain-test-'));
    try {
      await initGptbrain(testDir, clock);
      const historyPath = join(testDir, STORAGE_DIR, 'audits', 'history.jsonl');
      await appendFile(historyPath, 'not-json\n');
      const bytesBefore = await readFile(historyPath);
      const record = makeValidRecord();
      const result = runAudit([record], clock);
      try {
        await writeAuditEvents(testDir, result, [record], clock);
        assert.fail('Should have failed');
      } catch (e) {
        // expected
      }
      const bytesAfter = await readFile(historyPath);
      assert.deepEqual(bytesAfter, bytesBefore);
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it('Invalid audit-event outcome is rejected by direct validation', () => {
    const validEvent = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      eventId: 'evt-123',
      timestamp: FIXED_TIME,
      memoryId: 'DM-MEM-000001',
      outcome: 'BOGUS',
      triggeredRules: ['DM-RULE-AUTH-001'],
      explanation: 'A valid summary',
      permissionConsequence: 'A valid consequence',
      recommendedAction: 'A valid next step',
      auditor: CLI_NAME,
      engineVersion: ENGINE_VERSION
    };
    const validation = validateAuditEvent(validEvent);
    assert.equal(validation.valid, false);
    assert.equal(validation.issues.length, 1);
    assert.equal(validation.issues[0]?.field, 'outcome');
  });

  it('Batch fail-closed: Invalid outcome in second event rejects entire batch', async () => {
    const testDir = await mkdtemp(join(tmpdir(), 'gptbrain-test-'));
    try {
      await initGptbrain(testDir, clock);
      const record1 = makeValidRecord({ id: 'R1' });
      const record2 = makeValidRecord({ id: 'R2' });
      let result = runAudit([record1, record2], clock);

      // Intentional malformed-runtime test data
      const malformedFinding = {
        ruleId: 'DM-RULE-AUTH-001',
        recordId: 'R2',
        outcome: 'BOGUS' as unknown as 'TRUST',
        evidenceExamined: [],
        summary: 'A valid summary',
        permissionConsequence: 'A valid consequence',
        recommendedNextStep: 'A valid next step'
      };

      result = { ...result, findings: [...result.findings, malformedFinding] };

      const historyPath = join(testDir, STORAGE_DIR, 'audits', 'history.jsonl');
      const bytesBefore = await readFile(historyPath);
      try {
        await writeAuditEvents(testDir, result, [record1, record2], clock);
        assert.fail('Should have failed validation');
      } catch (e: any) {
        assert.ok(e.message.includes('Internal error: invalid audit event batch'));
      }
      const bytesAfter = await readFile(historyPath);
      assert.deepEqual(bytesAfter, bytesBefore, 'history.jsonl remains byte-for-byte unchanged');
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  });
});

// ─── 5. CLI Tests ───────────────────────────────────────────

describe('CLI Integration', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'gptbrain-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('CLI invalid usage (missing arg) returns exit code 2', async () => {
    try {
      await execFileAsync('node', [CLI_PATH, 'context']);
      assert.fail('Should have failed');
    } catch (e: any) {
      assert.equal(e.code, 2);
    }
  });

  it('CLI invalid usage (unknown option) returns exit code 2', async () => {
    try {
      await execFileAsync('node', [CLI_PATH, 'init', '--bogus']);
      assert.fail('Should have failed');
    } catch (e: any) {
      assert.equal(e.code, 2);
    }
  });

  it('CLI invalid usage (unexpected positional) returns exit code 2', async () => {
    try {
      await execFileAsync('node', [CLI_PATH, 'audit', 'extra-arg']);
      assert.fail('Should have failed');
    } catch (e: any) {
      assert.equal(e.code, 2);
    }
  });

  it('Real CLI init is idempotent', async () => {
    const { stdout: out1 } = await execFileAsync('node', [CLI_PATH, 'init', testDir]);
    assert.ok(out1.includes('Created:'));

    const { stdout: out2 } = await execFileAsync('node', [CLI_PATH, 'init', testDir]);
    assert.ok(out2.includes('preserved'));
  });

  it('Real CLI context does not persist pack', async () => {
    await execFileAsync('node', [CLI_PATH, 'init', testDir]);
    const { stdout } = await execFileAsync('node', [CLI_PATH, 'context', '--task', 'project initialization', '--format', 'json'], { cwd: testDir });
    interface ContextRecord { memoryId: string }
    const contextData = JSON.parse(stdout) as { selected: ContextRecord[], excluded: ContextRecord[] };
    assert.ok(contextData.selected.some(r => r.memoryId === 'DM-MEM-000001'), 'DM-MEM-000001 should be selected');
    assert.ok(!contextData.excluded.some(r => r.memoryId === 'DM-MEM-000001'), 'DM-MEM-000001 should not be excluded');

    // Check nothing extra was created in testDir
    const files = await readdir(testDir);
    assert.deepEqual(files, [STORAGE_DIR]);
  });

  it('CLI audit healthy baseline returns TRUST and exit code 0', async () => {
    await execFileAsync('node', [CLI_PATH, 'init', testDir]);
    const { stdout } = await execFileAsync('node', [CLI_PATH, 'audit'], { cwd: testDir });
    assert.ok(stdout.includes('TRUST'));
  });

  it('gptbrain --help', async () => {
    const { stdout } = await execFileAsync('node', [CLI_PATH, '--help']);
    assert.ok(stdout.includes('Usage:'));
  });

  it('gptbrain --version', async () => {
    const { stdout } = await execFileAsync('node', [CLI_PATH, '--version']);
    assert.equal(stdout.trim(), `${CLI_NAME} v${ENGINE_VERSION}`);
  });

  it('Deterministic JSON key ordering test', async () => {
    const unordered = {
      z: 1,
      a: { c: 2, b: 3 },
      x: [ { e: 4, d: 5 } ]
    };
    const testDir2 = await mkdtemp(join(tmpdir(), 'gptbrain-test-'));
    try {
      const recordPath = join(testDir2, 'test.json');
      await atomicWriteJson(recordPath, unordered, { allowOverwrite: false });
      const str = await readFile(recordPath, 'utf-8');
      const expected = JSON.stringify({
        a: { b: 3, c: 2 },
        x: [ { d: 5, e: 4 } ],
        z: 1
      }, null, 2) + '\n';
      assert.equal(str, expected);
    } finally {
      await rm(testDir2, { recursive: true, force: true });
    }
  });
});

// ─── 6. No network test ─────────────────────────────────────

describe('No network', () => {
  it('No prohibited network strings found in source', () => {
    const srcDir = join(import.meta.dirname, '..', 'src');
    const prohibited = ['node:http', 'node:https', 'node:net', 'node:tls', ' fetch(', 'XMLHttpRequest', 'WebSocket'];

    function scan(dir: string) {
      const files = readdirSync(dir);
      for (const file of files) {
        const fullPath = join(dir, file);
        if (statSync(fullPath).isDirectory()) {
          scan(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.js')) {
          const content = readFileSync(fullPath, 'utf-8');
          for (const p of prohibited) {
            if (content.includes(p)) {
              assert.fail(`Prohibited network string "${p}" found in ${fullPath}`);
            }
          }
        }
      }
    }

    scan(srcDir);
  });
});
