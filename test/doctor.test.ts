import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, it } from 'node:test';
import { diagnoseStore, repairStore } from '../src/core/doctor.js';
import { STORAGE_DIR } from '../src/core/identity.js';
import { beginLifecycle } from '../src/core/lifecycle.js';
import { buildRememberCandidate, rememberMemory } from '../src/core/quick.js';
import { initTamhees, loadAllRecords } from '../src/core/store.js';
import { fixedClock, systemClock } from '../src/core/types.js';

const run = promisify(execFile);
const CLI = resolve('dist/src/cli.js');
const roots: string[] = [];
afterEach(async () => {
  while (roots.length > 0) await rm(roots.pop()!, { recursive: true, force: true });
});

async function store(memories = 2): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tamhees-doctor-'));
  roots.push(root);
  assert.equal((await initTamhees(root, systemClock)).success, true);
  for (let index = 0; index < memories; index += 1) {
    const result = await rememberMemory(root, { statement: `Builds use tool number ${index}.`, basis: 'repo', sourceReference: 'package.json' }, systemClock);
    assert.equal(result.success, true);
  }
  return root;
}

const recordPath = (root: string, id: string) => join(root, STORAGE_DIR, 'memories', 'records', `${id}.json`);
const codes = (report: { findings: readonly { code: string }[] }) => report.findings.map((finding) => finding.code).sort();

async function cli(cwd: string, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args], { cwd });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

describe('doctor: diagnosis', () => {
  it('reports a healthy store as healthy', async () => {
    const report = await diagnoseStore(await store(), systemClock);
    assert.equal(report.healthy, true);
    assert.deepEqual(report.findings, []);
    assert.equal(report.counts.records, 3);
  });

  it('reports a missing store with the command to run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tamhees-doctor-empty-'));
    roots.push(root);
    const report = await diagnoseStore(root, systemClock);
    assert.deepEqual(codes(report), ['STORE_MISSING']);
    assert.match(report.findings[0]!.fix, /tamhees init/);
  });

  it('explains a git merge conflict, broken JSON, invalid fields and a wrong file name', async () => {
    const root = await store(4);
    const original = await readFile(recordPath(root, 'DM-MEM-000002'), 'utf8');
    await writeFile(recordPath(root, 'DM-MEM-000002'), `<<<<<<< HEAD\n${original}=======\n${original}>>>>>>> branch\n`);
    await writeFile(recordPath(root, 'DM-MEM-000003'), original.slice(0, 40));
    await writeFile(recordPath(root, 'DM-MEM-000004'), JSON.stringify({ ...JSON.parse(original), id: 'DM-MEM-000004', confidence: 'VERY_HIGH' }));
    await writeFile(recordPath(root, 'DM-MEM-000009'), JSON.stringify({ ...JSON.parse(original), id: 'DM-MEM-000005' }));
    const report = await diagnoseStore(root, systemClock);
    assert.equal(report.healthy, false);
    for (const code of ['RECORD_MERGE_CONFLICT', 'RECORD_BROKEN_JSON', 'RECORD_INVALID', 'RECORD_NAME_MISMATCH']) {
      assert.ok(codes(report).includes(code), code);
    }
    const broken = report.findings.find((finding) => finding.code === 'RECORD_BROKEN_JSON')!;
    assert.match(broken.problem, /truncated|line \d+, column \d+/);
    const invalid = report.findings.find((finding) => finding.code === 'RECORD_INVALID')!;
    assert.match(invalid.problem, /confidence/);
    // A listed-but-broken file is not also reported as missing from disk.
    const index = report.findings.find((finding) => finding.code === 'INDEX_OUT_OF_DATE');
    assert.ok(index === undefined || !/DM-MEM-000002|DM-MEM-000003|DM-MEM-000004/.test(index.problem.split('no longer present')[1] ?? ''));
  });

  it('never prints raw file content, even from a broken file holding a secret', async () => {
    const root = await store(1);
    const fake = ['sk', 'live', 'FAKEDOCTOR0000000000000000'].join('_');
    await writeFile(recordPath(root, 'DM-MEM-000002'), `{"statement": "key ${fake}", `);
    const report = await diagnoseStore(root, systemClock);
    assert.doesNotMatch(JSON.stringify(report), /FAKEDOCTOR/);
    const text = await cli(root, 'doctor');
    assert.doesNotMatch(text.stdout + text.stderr, /FAKEDOCTOR/);
  });

  it('flags a secret stored before its pattern was recognized, and points to forget', async () => {
    const root = await store(1);
    const record = JSON.parse(await readFile(recordPath(root, 'DM-MEM-000002'), 'utf8'));
    const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJmYWtlLWRvY3Rvci10ZXN0In0', 'ZmFrZXNpZ25hdHVyZWZha2VzaWduYXR1cmU'].join('.');
    await writeFile(recordPath(root, 'DM-MEM-000002'), JSON.stringify({ ...record, statement: `Call the API with Bearer ${jwt}` }, null, 2));
    const report = await diagnoseStore(root, systemClock);
    const finding = report.findings.find((item) => item.code === 'RECORD_SECRET_LIKE')!;
    assert.equal(finding.severity, 'warning');
    assert.match(finding.fix, /tamhees forget DM-MEM-000002/);
    assert.equal(report.healthy, true, 'a warning does not block other commands');
  });

  it('detects an index that no longer matches the memory files', async () => {
    const root = await store(2);
    await rm(recordPath(root, 'DM-MEM-000003'));
    const report = await diagnoseStore(root, systemClock);
    assert.deepEqual(codes(report), ['INDEX_OUT_OF_DATE']);
    assert.match(report.findings[0]!.problem, /DM-MEM-000003/);
  });

  it('reports broken audit-log lines: blocking in the active segment, a warning in a sealed one', async () => {
    const root = await store(1);
    const active = join(root, STORAGE_DIR, 'audits', 'history.jsonl');
    const lines = (await readFile(active, 'utf8')).trim().split('\n');
    await writeFile(active, [lines[0], '{"truncated": tr', ...lines.slice(1)].join('\n') + '\n');
    await writeFile(join(root, STORAGE_DIR, 'audits', 'history-evt-0000000000000000.jsonl'), '<<<<<<< HEAD\n');
    const report = await diagnoseStore(root, systemClock);
    const activeFinding = report.findings.find((item) => item.file?.endsWith('history.jsonl'))!;
    const sealedFinding = report.findings.find((item) => item.file?.endsWith('history-evt-0000000000000000.jsonl'))!;
    assert.equal(activeFinding.severity, 'error');
    assert.match(activeFinding.problem, /line 2/);
    assert.equal(sealedFinding.code, 'AUDIT_MERGE_CONFLICT');
    assert.equal(sealedFinding.severity, 'warning');
  });

  it('explains an interrupted task after a real crash mid-save, without suggesting a replay', async () => {
    const root = await store(0);
    const opened = await beginLifecycle(root, 'record the build tools', systemClock, () => 'lc-doctor-crash');
    assert.equal(opened.success, true);
    const now = new Date().toISOString();
    const ids = ['DM-MEM-CRASH-001', 'DM-MEM-CRASH-002'];
    const evidence = ids.map((memoryId, index) => ({
      schemaVersion: '1.0.0', id: `DM-EVIDENCE-CRASH-00${index + 1}`, type: 'REPOSITORY_STATE', source: 'package.json',
      content: 'Observed in package.json.', relationship: 'SUPPORTS', memoryIds: [memoryId], collectedAt: now, collectedBy: 'doctor-test',
    }));
    const candidates = ids.map((id, index) => {
      const candidate = buildRememberCandidate({ statement: `${['First', 'Second'][index]} tool fact.`, basis: 'repo', sourceReference: 'package.json', id, proposer: 'doctor-test' }, [], now);
      return { ...candidate, evidence: [evidence[index]!.id], proposedRecord: { ...candidate.proposedRecord!, relationships: { supportedBy: [evidence[index]!.id] } } };
    });
    const script = join(root, 'crash.mjs');
    await writeFile(script, [
      `import { finalizeLifecycle } from ${JSON.stringify(resolve('dist/src/core/lifecycle.js'))};`,
      `await finalizeLifecycle(${JSON.stringify(root)}, ${JSON.stringify({
        schemaVersion: '1.0.0', lifecycleId: 'lc-doctor-crash', proposer: { type: 'AGENT', id: 'doctor-test' }, proposedEvidence: evidence, proposedUpdates: candidates,
      })}, () => new Date().toISOString(), { beforeMutation: (_c, index) => { if (index === 1) process.exit(9); } });`,
    ].join('\n'));
    await assert.rejects(run(process.execPath, [script]), (error: { code?: number }) => error.code === 9);

    const report = await diagnoseStore(root, systemClock);
    const finding = report.findings.find((item) => item.code === 'LIFECYCLE_INTERRUPTED')!;
    assert.ok(finding, codes(report).join(','));
    assert.match(finding.problem, /Saved: CREATE DM-MEM-CRASH-001/);
    assert.match(finding.problem, /Not confirmed.*CREATE DM-MEM-CRASH-002/);
    assert.match(finding.problem, /never replayed/);
    assert.equal(finding.autoFixable, false);
    // The crashed process left its write lock; the doctor recognizes it as stale.
    assert.ok(codes(report).includes('LOCK_STALE'));
    assert.equal(report.healthy, true, 'an interrupted task does not block other work');
  });

  it('recognizes a live lock holder and a stale one, and ignores its own', async () => {
    const root = await store(0);
    const lock = join(root, STORAGE_DIR, 'runtime', 'write.lock');
    const holder = (pid: number) => JSON.stringify({ pid, host: hostname(), token: 'test', acquiredAt: new Date().toISOString() });
    await writeFile(lock, holder(process.ppid));
    assert.deepEqual(codes(await diagnoseStore(root, systemClock)), ['LOCK_HELD']);
    await writeFile(lock, holder(2 ** 22 + 12345));
    assert.deepEqual(codes(await diagnoseStore(root, systemClock)), ['LOCK_STALE']);
    await writeFile(lock, holder(process.pid));
    assert.deepEqual(codes(await diagnoseStore(root, systemClock)), []);
  });
});

describe('doctor --fix: safe repair', () => {
  it('quarantines damaged files without deleting them, keeps valid audit events, and the store works again', async () => {
    const root = await store(3);
    const conflictPath = recordPath(root, 'DM-MEM-000002');
    const original = await readFile(conflictPath, 'utf8');
    const conflicted = `<<<<<<< HEAD\n${original}=======\n${original}>>>>>>> branch\n`;
    await writeFile(conflictPath, conflicted);
    const active = join(root, STORAGE_DIR, 'audits', 'history.jsonl');
    const events = (await readFile(active, 'utf8')).trim().split('\n');
    await writeFile(active, `${events.join('\n')}\n{"half": \n`);
    assert.equal((await loadAllRecords(root)).errors.length, 1, 'precondition: reads are blocked');

    const result = await repairStore(root, systemClock);
    assert.equal(result.before.healthy, false);
    assert.equal(result.after.healthy, true);
    assert.deepEqual(result.after.findings.filter((finding) => finding.severity !== 'info'), []);
    assert.ok(result.actions.some((action) => action.action === 'QUARANTINED' && action.file?.endsWith('DM-MEM-000002.json')));
    assert.ok(result.actions.some((action) => action.action === 'SALVAGED_AUDIT_SEGMENT'));
    assert.ok(result.actions.some((action) => action.action === 'REBUILT_INDEX'));

    // Nothing deleted: the exact bytes are in quarantine, with a manifest and a .gitignore.
    const quarantine = join(root, result.quarantineDir!);
    assert.equal(await readFile(join(quarantine, 'memories', 'records', 'DM-MEM-000002.json'), 'utf8'), conflicted);
    assert.match(await readFile(join(quarantine, '.gitignore'), 'utf8'), /^\*$/m);
    const manifest = JSON.parse(await readFile(join(quarantine, 'MANIFEST.json'), 'utf8'));
    assert.equal(manifest.files.length, 2);
    // Every valid audit event is kept, in order.
    assert.deepEqual((await readFile(active, 'utf8')).trim().split('\n'), events);

    assert.equal((await loadAllRecords(root)).errors.length, 0);
    const again = await rememberMemory(root, { statement: 'Writes work again.', basis: 'observed', sourceReference: 'test' }, systemClock);
    assert.equal(again.success, true);
  });

  it('is idempotent: a second run has nothing to do', async () => {
    const root = await store(1);
    await writeFile(recordPath(root, 'DM-MEM-000002'), '{');
    await repairStore(root, systemClock);
    const second = await repairStore(root, systemClock);
    assert.deepEqual(second.actions, []);
    assert.equal(second.quarantineDir, null);
  });

  it('never edits or forgets a valid memory, even one with a secret-like value', async () => {
    const root = await store(1);
    const path = recordPath(root, 'DM-MEM-000002');
    const record = JSON.parse(await readFile(path, 'utf8'));
    const fake = ['xoxb', '000000000000', 'FAKEFAKEFAKEFAKE'].join('-');
    await writeFile(path, JSON.stringify({ ...record, statement: `Slack bot token ${fake}` }, null, 2));
    const before = await readFile(path, 'utf8');
    const result = await repairStore(root, fixedClock('2026-10-25T09:00:00.000Z'));
    assert.equal(await readFile(path, 'utf8'), before);
    assert.ok(result.after.findings.some((finding) => finding.code === 'RECORD_SECRET_LIKE'));
  });

  it('CLI: exit 1 while a blocking problem remains, 0 after --fix; hints point to doctor', async () => {
    const root = await store(1);
    await writeFile(recordPath(root, 'DM-MEM-000002'), '{"oops"');
    const blocked = await cli(root, 'inspect');
    assert.equal(blocked.code, 1);
    assert.match(blocked.stderr, /tamhees doctor/);
    const diagnosis = await cli(root, 'doctor');
    assert.equal(diagnosis.code, 1);
    assert.match(diagnosis.stdout, /PROBLEM/);
    assert.match(diagnosis.stdout, /doctor --fix/);
    const fixed = await cli(root, 'doctor', '--fix');
    assert.equal(fixed.code, 0, fixed.stdout + fixed.stderr);
    assert.match(fixed.stdout, /Moved to quarantine/);
    assert.equal((await cli(root, 'inspect')).code, 0);
    const json = JSON.parse((await cli(root, 'doctor', '--format', 'json')).stdout);
    assert.equal(json.healthy, true);
    assert.equal((await cli(root, 'doctor', '--format', 'xml')).code, 2);
    assert.ok((await readdir(join(root, STORAGE_DIR, 'quarantine'))).length === 1);
  });
});
