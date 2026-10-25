/**
 * Tamhees — store health check and recovery (`tamhees doctor [--fix]`).
 *
 * Every other command is deliberately fail-closed: one unreadable memory file stops
 * retrieval and writes rather than risk serving unvalidated memory. That is safe, but on
 * its own it leaves the owner stuck. The doctor explains exactly what is wrong, file by
 * file, in plain words, and says how to fix it.
 *
 * `--fix` only does things that can be undone:
 *   - moves unreadable or invalid files into `.tamhees/quarantine/<time>/` (never deletes),
 *     with a MANIFEST.json and a `.gitignore` so quarantined content is not committed;
 *   - for a damaged audit-log segment, keeps every valid event line in place and moves the
 *     original file to quarantine;
 *   - rebuilds the memory index from the records that remain.
 * It never edits a memory's content, never forgets or revokes anything, and never touches
 * an interrupted task's journal: those are reported with the command to run.
 *
 * Raw file content is never printed (it may contain secrets). Problems are described by
 * kind, line number and field name only.
 */

import { lstat, mkdir, readdir, readFile, rename } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { atomicWriteText, readControlledFiles, verifyPathSafety, verifyStorageTreeSafety } from './atomic-write.js';
import { CLI_NAME, STORAGE_DIR } from './identity.js';
import { LOCK_RELATIVE_PATH, withWriteLock } from './lock.js';
import { scanEvidenceRecord, scanMemoryRecord } from './privacy.js';
import { normalizeLegacyMemory } from './scope.js';
import { rebuildMemoryIndex } from './store.js';
import type { Clock, EvidenceRecord, LifecycleMetadata, MemoryRecord } from './types.js';
import {
  validateAuditEvent,
  validateEvidenceRecord,
  validateLifecycleMetadata,
  validateMemoryIndex,
  validateMemoryRecord,
} from './validation.js';

export type DoctorSeverity = 'error' | 'warning' | 'info';
export type DoctorArea = 'store' | 'record' | 'evidence' | 'index' | 'audit' | 'lifecycle' | 'lock';

export interface DoctorFinding {
  /** Stable machine-readable code, e.g. RECORD_MERGE_CONFLICT. */
  readonly code: string;
  readonly severity: DoctorSeverity;
  readonly area: DoctorArea;
  /** Path relative to the project root, when the finding is about one file. */
  readonly file?: string;
  readonly problem: string;
  readonly fix: string;
  /** Whether `tamhees doctor --fix` resolves it. */
  readonly autoFixable: boolean;
}

export interface DoctorCounts {
  readonly records: number;
  readonly evidence: number;
  readonly auditEvents: number;
  readonly lifecycles: number;
}

export interface DoctorReport {
  readonly checkedAt: string;
  /** True when no error-severity finding remains. Warnings do not stop other commands. */
  readonly healthy: boolean;
  readonly counts: DoctorCounts;
  readonly findings: readonly DoctorFinding[];
}

export interface DoctorFixAction {
  readonly action: 'QUARANTINED' | 'SALVAGED_AUDIT_SEGMENT' | 'REBUILT_INDEX';
  readonly file?: string;
  readonly detail: string;
}

export interface DoctorFixResult {
  readonly before: DoctorReport;
  readonly actions: readonly DoctorFixAction[];
  readonly quarantineDir: string | null;
  readonly after: DoctorReport;
}

const CONFLICT_MARKER = /^(?:<{7}|={7}|>{7})(?:\s|$)/m;
const AUDIT_SEGMENT = /^history(?:-[A-Za-z0-9._-]{1,128})?\.jsonl$/;
const STALE_LOCK_MS = 10 * 60_000;
const OLD_OPEN_LIFECYCLE_MS = 7 * 24 * 60 * 60_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

interface FileProblem {
  readonly kind: 'conflict' | 'json' | 'schema' | 'mismatch' | 'unsafe' | 'unreadable';
  readonly detail: string;
}

function lineAndColumn(text: string, position: number): string {
  const before = text.slice(0, Math.max(0, Math.min(position, text.length)));
  const line = before.split('\n').length;
  const column = before.length - before.lastIndexOf('\n');
  return `line ${line}, column ${column}`;
}

/** Parse JSON without ever echoing content; returns where it broke. */
function parseJson(text: string): { ok: true; value: unknown } | { ok: false; detail: string } {
  if (text.trim() === '') return { ok: false, detail: 'the file is empty' };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const position = /position (\d+)/.exec(message)?.[1];
    if (position !== undefined) return { ok: false, detail: `the JSON is broken at ${lineAndColumn(text, Number(position))}` };
    if (/end of JSON input/i.test(message)) return { ok: false, detail: 'the JSON stops part-way through (the file is truncated)' };
    return { ok: false, detail: 'the JSON cannot be parsed' };
  }
}

function describeIssues(issues: readonly { field: string; code: string }[]): string {
  const shown = issues.slice(0, 4).map((issue) => `${issue.field || '(file)'} [${issue.code}]`);
  return `${shown.join(', ')}${issues.length > 4 ? ` and ${issues.length - 4} more` : ''}`;
}

function diagnoseContent(
  text: string,
  validate: (value: unknown) => { valid: boolean; issues: readonly { field: string; code: string }[] },
  normalize: (value: unknown) => unknown = (value) => value,
): FileProblem | { readonly value: unknown } {
  if (CONFLICT_MARKER.test(text)) {
    return { kind: 'conflict', detail: 'it contains git merge-conflict markers (<<<<<<< / ======= / >>>>>>>)' };
  }
  const parsed = parseJson(text);
  if (!parsed.ok) return { kind: 'json', detail: parsed.detail };
  const value = normalize(parsed.value);
  const validation = validate(value);
  if (!validation.valid) return { kind: 'schema', detail: `fields are invalid: ${describeIssues(validation.issues)}` };
  return { value };
}

function rel(root: string, path: string): string {
  return relative(root, path).split('\\').join('/');
}

function isProblem(value: FileProblem | { readonly value: unknown }): value is FileProblem {
  return 'kind' in value;
}

async function listDir(dir: string): Promise<string[] | null> {
  try {
    return (await readdir(dir)).sort();
  } catch {
    return null;
  }
}

function processAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// ─── Diagnosis ──────────────────────────────────────────────────────────────

export async function diagnoseStore(projectDir: string, clock: Clock): Promise<DoctorReport> {
  const root = resolve(projectDir);
  const storage = join(root, STORAGE_DIR);
  const findings: DoctorFinding[] = [];
  const counts = { records: 0, evidence: 0, auditEvents: 0, lifecycles: 0 };
  const now = clock();
  const finish = (): DoctorReport => ({
    checkedAt: now,
    healthy: !findings.some((finding) => finding.severity === 'error'),
    counts,
    findings,
  });

  // Store presence and link safety.
  const config = await readFile(join(storage, 'config.json'), 'utf8').catch(() => null);
  if (config === null && (await listDir(storage)) === null) {
    findings.push({
      code: 'STORE_MISSING', severity: 'error', area: 'store', problem: `There is no ${STORAGE_DIR}/ folder in this project.`,
      fix: `Run \`${CLI_NAME} init\` in the project folder.`, autoFixable: false,
    });
    return finish();
  }
  const tree = await verifyStorageTreeSafety(storage, root);
  if (!tree.safe) {
    findings.push({
      code: 'STORE_UNSAFE_PATH', severity: 'error', area: 'store',
      problem: `A ${STORAGE_DIR}/ folder is a symbolic link or points outside the project, so ${CLI_NAME} refuses to use it.`,
      fix: `Replace the link with a real folder (restore ${STORAGE_DIR}/ from version control or a backup).`, autoFixable: false,
    });
    return finish();
  }
  for (const name of ['config.json', 'state.json']) {
    const text = await readFile(join(storage, name), 'utf8').catch(() => null);
    const file = `${STORAGE_DIR}/${name}`;
    if (text === null) {
      findings.push({
        code: 'STORE_FILE_MISSING', severity: 'error', area: 'store', file, problem: `${file} is missing.`,
        fix: `Restore it from version control, or run \`${CLI_NAME} init\` to recreate the store's settings.`, autoFixable: false,
      });
      continue;
    }
    const problem = CONFLICT_MARKER.test(text) ? 'it contains git merge-conflict markers' : (() => {
      const parsed = parseJson(text);
      return parsed.ok ? null : parsed.detail;
    })();
    if (problem !== null) {
      findings.push({
        code: 'STORE_FILE_BROKEN', severity: 'error', area: 'store', file, problem: `${file} cannot be read: ${problem}.`,
        fix: 'Resolve the conflict or restore the file from version control. It holds store settings, so it is not moved automatically.',
        autoFixable: false,
      });
    }
  }

  // Memory records.
  const recordsDir = join(storage, 'memories', 'records');
  const recordNames = (await listDir(recordsDir)) ?? [];
  const validRecords = new Map<string, MemoryRecord>();
  const brokenRecordIds = new Set<string>();
  const reads = await readControlledFiles(recordsDir, recordNames.filter((name) => name.endsWith('.json')));
  for (const read of reads) {
    const file = rel(root, join(recordsDir, read.name));
    const fail = (code: string, problem: string, fix: string): void => {
      brokenRecordIds.add(read.name.replace(/\.json$/, ''));
      findings.push({ code, severity: 'error', area: 'record', file, problem, fix, autoFixable: true });
    };
    if (read.unsafeReason !== undefined) {
      fail('RECORD_UNSAFE', `${read.name} is a symbolic link, so it is never read.`, 'Replace it with the real file, or run `tamhees doctor --fix` to move the link aside.');
      continue;
    }
    if (read.content === undefined) {
      fail('RECORD_UNREADABLE', `${read.name} cannot be read from disk.`, 'Check file permissions, or run `tamhees doctor --fix` to move it aside.');
      continue;
    }
    const result = diagnoseContent(read.content, validateMemoryRecord, (value) =>
      value && typeof value === 'object' && 'statement' in value ? normalizeLegacyMemory(value) : value);
    if (isProblem(result)) {
      const code = result.kind === 'conflict' ? 'RECORD_MERGE_CONFLICT' : result.kind === 'json' ? 'RECORD_BROKEN_JSON' : 'RECORD_INVALID';
      const fix = result.kind === 'conflict'
        ? 'Open the file, keep one version of the memory and delete the conflict markers; or run `tamhees doctor --fix` to move it aside and continue without it.'
        : 'Restore it from version control or fix it by hand; or run `tamhees doctor --fix` to move it aside and continue without it.';
      fail(code, `Memory file ${read.name} cannot be used: ${result.detail}. Until this is fixed, every command that reads memory stops.`, fix);
      continue;
    }
    const record = result.value as MemoryRecord;
    if (read.name !== `${record.id}.json`) {
      fail('RECORD_NAME_MISMATCH', `${read.name} contains memory ${record.id}; the file name must be ${record.id}.json.`,
        `Rename the file to ${record.id}.json (if that name is free), or run \`tamhees doctor --fix\` to move it aside.`);
      continue;
    }
    validRecords.set(record.id, record);
    if (record.sensitivity !== 'SECRET' && record.actionPermission !== 'FORGET_OR_REDACT' && scanMemoryRecord(record).secretLike) {
      findings.push({
        code: 'RECORD_SECRET_LIKE', severity: 'warning', area: 'record', file,
        problem: `Memory ${record.id} contains something that looks like a secret (it was probably stored before that pattern was recognized). It is never shown to agents, but the raw text is still on disk.`,
        fix: `Run \`${CLI_NAME} forget ${record.id}\` to erase the text and keep a safe tombstone.`, autoFixable: false,
      });
    }
  }
  counts.records = validRecords.size;

  // Index.
  const indexPath = join(storage, 'memories', 'index.json');
  const indexText = await readFile(indexPath, 'utf8').catch(() => null);
  const indexFile = rel(root, indexPath);
  if (indexText === null) {
    findings.push({ code: 'INDEX_MISSING', severity: 'warning', area: 'index', file: indexFile, problem: 'The memory index is missing.', fix: 'Run `tamhees doctor --fix` to rebuild it from the memory files.', autoFixable: true });
  } else {
    const indexed = diagnoseContent(indexText, validateMemoryIndex);
    if (isProblem(indexed)) {
      findings.push({ code: 'INDEX_BROKEN', severity: 'warning', area: 'index', file: indexFile, problem: `The memory index cannot be read: ${indexed.detail}.`, fix: 'Run `tamhees doctor --fix` to rebuild it from the memory files (the index holds no information of its own).', autoFixable: true });
    } else {
      const ids = new Set(((indexed.value as { entries: { id: string }[] }).entries ?? []).map((entry) => entry.id));
      const missing = [...validRecords.keys()].filter((id) => !ids.has(id));
      // A listed memory whose file exists but is broken is reported above, not as missing.
      const stale = [...ids].filter((id) => !validRecords.has(id) && !brokenRecordIds.has(id));
      if (missing.length > 0 || stale.length > 0) {
        const parts = [
          ...(missing.length > 0 ? [`${missing.length} memory file(s) not listed (${missing.slice(0, 5).join(', ')})`] : []),
          ...(stale.length > 0 ? [`${stale.length} listed memory file(s) no longer present (${stale.slice(0, 5).join(', ')})`] : []),
        ];
        findings.push({
          code: 'INDEX_OUT_OF_DATE', severity: 'warning', area: 'index', file: indexFile,
          problem: `The memory index does not match the memory files: ${parts.join('; ')}. This happens when files are added or deleted by hand or by a merge.`,
          fix: 'Run `tamhees doctor --fix` to rebuild it. Deleted memory files are not recoverable from the index; restore them from version control if they were removed by mistake.',
          autoFixable: true,
        });
      }
    }
  }

  // Evidence.
  const evidenceDir = join(storage, 'evidence');
  const evidenceNames = (await listDir(evidenceDir)) ?? [];
  const evidenceReads = await readControlledFiles(evidenceDir, evidenceNames.filter((name) => name.endsWith('.json')));
  for (const read of evidenceReads) {
    const file = rel(root, join(evidenceDir, read.name));
    if (read.unsafeReason !== undefined || read.content === undefined) {
      findings.push({ code: 'EVIDENCE_UNREADABLE', severity: 'error', area: 'evidence', file, problem: `Evidence file ${read.name} is a symbolic link or cannot be read.`, fix: 'Replace it with the real file, or run `tamhees doctor --fix` to move it aside.', autoFixable: true });
      continue;
    }
    const result = diagnoseContent(read.content, validateEvidenceRecord);
    if (isProblem(result)) {
      findings.push({
        code: result.kind === 'conflict' ? 'EVIDENCE_MERGE_CONFLICT' : 'EVIDENCE_INVALID', severity: 'error', area: 'evidence', file,
        problem: `Evidence file ${read.name} cannot be used: ${result.detail}. Commands that read evidence (audit, context, inspect) stop until this is fixed.`,
        fix: 'Resolve or restore the file, or run `tamhees doctor --fix` to move it aside.', autoFixable: true,
      });
      continue;
    }
    const item = result.value as EvidenceRecord;
    counts.evidence += 1;
    const orphaned = item.memoryIds.filter((id) => !validRecords.has(id));
    if (orphaned.length > 0) {
      findings.push({
        code: 'EVIDENCE_ORPHANED', severity: 'info', area: 'evidence', file,
        problem: `Evidence ${item.id} refers to memory that no longer exists (${orphaned.join(', ')}). It is harmless and kept for history.`,
        fix: 'No action needed.', autoFixable: false,
      });
    }
    if (scanEvidenceRecord(item).secretLike) {
      findings.push({
        code: 'EVIDENCE_SECRET_LIKE', severity: 'warning', area: 'evidence', file,
        problem: `Evidence ${item.id} contains something that looks like a secret (it was probably stored before that pattern was recognized).`,
        fix: `Remove the file by hand (evidence has no forget command), or move it out of ${STORAGE_DIR}/evidence/.`, autoFixable: false,
      });
    }
  }

  // Audit log segments.
  const auditsDir = join(storage, 'audits');
  for (const name of ((await listDir(auditsDir)) ?? []).filter((file) => AUDIT_SEGMENT.test(file))) {
    const path = join(auditsDir, name);
    const file = rel(root, path);
    const safety = await verifyPathSafety(path, root);
    const text = safety.safe ? await readFile(path, 'utf8').catch(() => null) : null;
    if (text === null) {
      findings.push({ code: 'AUDIT_UNREADABLE', severity: 'error', area: 'audit', file, problem: `Audit log ${name} is a symbolic link or cannot be read.`, fix: 'Run `tamhees doctor --fix` to move it aside.', autoFixable: true });
      continue;
    }
    const bad: number[] = [];
    let good = 0;
    let conflict = false;
    text.split('\n').forEach((line, index) => {
      if (line.trim() === '') return;
      if (CONFLICT_MARKER.test(line)) {
        conflict = true;
        bad.push(index + 1);
        return;
      }
      try {
        if (validateAuditEvent(JSON.parse(line)).valid) good += 1;
        else bad.push(index + 1);
      } catch {
        bad.push(index + 1);
      }
    });
    counts.auditEvents += good;
    if (bad.length > 0) {
      const active = name === 'history.jsonl';
      findings.push({
        code: conflict ? 'AUDIT_MERGE_CONFLICT' : 'AUDIT_BROKEN_LINES', severity: active ? 'error' : 'warning', area: 'audit', file,
        problem: `Audit log ${name} has ${bad.length} unreadable line(s) (line ${bad.slice(0, 6).join(', ')}${bad.length > 6 ? ', …' : ''})`
          + `${conflict ? ', including git merge-conflict markers' : ''}; ${good} event(s) are fine.`
          + `${active ? ' New writes stop until this is fixed.' : ''}`,
        fix: 'Run `tamhees doctor --fix`: the valid events stay in place and the original file is kept in quarantine.',
        autoFixable: true,
      });
    }
  }

  // Task lifecycles.
  const episodesDir = join(storage, 'episodes');
  for (const name of ((await listDir(episodesDir)) ?? []).filter((file) => file.endsWith('.json'))) {
    const path = join(episodesDir, name);
    const file = rel(root, path);
    const safety = await verifyPathSafety(path, root);
    const text = safety.safe ? await readFile(path, 'utf8').catch(() => null) : null;
    const result = text === null ? null : diagnoseContent(text, validateLifecycleMetadata);
    if (result === null || isProblem(result)) {
      findings.push({
        code: 'LIFECYCLE_UNREADABLE', severity: 'warning', area: 'lifecycle', file,
        problem: `Task record ${name} cannot be read${result !== null && isProblem(result) ? `: ${result.detail}` : ''}. Only that task is affected.`,
        fix: 'Run `tamhees doctor --fix` to move it aside.', autoFixable: true,
      });
      continue;
    }
    counts.lifecycles += 1;
    const metadata = result.value as LifecycleMetadata;
    if (metadata.status === 'FINALIZING' || metadata.status === 'FAILED') {
      // The journal lists every change it intended (disposition APPLIED) and marks each one
      // storageChanged once saved. A crash between saving and marking leaves it unconfirmed,
      // so a new memory is also checked against the store itself.
      const intended = (metadata.finalization?.dispositions ?? []).filter((item) => item.disposition === 'APPLIED');
      const label = (item: (typeof intended)[number]): string => `${item.action} ${item.memoryId ?? `proposal ${item.proposalIndex + 1}`}`;
      const confirmed = intended.filter((item) => item.storageChanged
        || (item.action === 'CREATE' && item.memoryId !== null && validRecords.has(item.memoryId)));
      const unconfirmed = intended.filter((item) => !confirmed.includes(item));
      const interrupted = metadata.status === 'FINALIZING';
      const parts = [
        intended.length === 0 ? 'It was not going to change any memory.' : '',
        confirmed.length > 0 ? `Saved: ${confirmed.map(label).join(', ')}.` : '',
        unconfirmed.length > 0 ? `Not confirmed, check these with \`${CLI_NAME} inspect\`: ${unconfirmed.map(label).join(', ')}.` : '',
      ].filter(Boolean);
      findings.push({
        code: interrupted ? 'LIFECYCLE_INTERRUPTED' : 'LIFECYCLE_FAILED', severity: 'warning', area: 'lifecycle', file,
        problem: `Task ${metadata.lifecycleId} ${interrupted ? 'was interrupted while saving its updates' : 'failed while saving its updates'}`
          + ` (started ${metadata.finalization?.startedAt ?? metadata.updatedAt}). ${parts.join(' ')} `
          + 'It is never replayed automatically, so nothing is applied twice. Other tasks are not affected.',
        fix: `Start a new task (\`${CLI_NAME} adapter begin\`) and propose again anything that is missing. This task record is kept as history.`,
        autoFixable: false,
      });
    } else if (metadata.status === 'OPEN' && Date.parse(now) - Date.parse(metadata.openedAt) > OLD_OPEN_LIFECYCLE_MS) {
      findings.push({
        code: 'LIFECYCLE_ABANDONED', severity: 'info', area: 'lifecycle', file,
        problem: `Task ${metadata.lifecycleId} was started on ${metadata.openedAt.slice(0, 10)} and never finished. It is harmless.`,
        fix: 'No action needed.', autoFixable: false,
      });
    }
  }

  // Write lock.
  const lockPath = join(root, LOCK_RELATIVE_PATH);
  const lockText = await readFile(lockPath, 'utf8').catch(() => null);
  if (lockText !== null) {
    let holder: { pid?: unknown; host?: unknown; acquiredAt?: unknown } = {};
    try {
      holder = JSON.parse(lockText) as typeof holder;
    } catch {
      holder = {};
    }
    const sameHost = holder.host === hostname();
    const age = typeof holder.acquiredAt === 'string' ? Date.parse(now) - Date.parse(holder.acquiredAt) : Number.POSITIVE_INFINITY;
    const alive = sameHost && typeof holder.pid === 'number' && processAlive(holder.pid);
    if (sameHost && holder.pid === process.pid) {
      // Held by this process (doctor --fix re-checks while holding the lock): not a finding.
    } else if (alive) {
      findings.push({
        code: 'LOCK_HELD', severity: 'info', area: 'lock', file: LOCK_RELATIVE_PATH.split('\\').join('/'),
        problem: `Another ${CLI_NAME} process (pid ${String(holder.pid)}) is writing right now.`, fix: 'Wait for it to finish.', autoFixable: false,
      });
    } else if (sameHost || age > STALE_LOCK_MS) {
      findings.push({
        code: 'LOCK_STALE', severity: 'info', area: 'lock', file: LOCK_RELATIVE_PATH.split('\\').join('/'),
        problem: 'A write lock was left behind by a process that stopped. The next write clears it automatically.',
        fix: 'No action needed (`tamhees doctor --fix` also clears it).', autoFixable: true,
      });
    } else {
      findings.push({
        code: 'LOCK_OTHER_HOST', severity: 'warning', area: 'lock', file: LOCK_RELATIVE_PATH.split('\\').join('/'),
        problem: `A write lock is held by ${String(holder.host ?? 'another machine')}, for example over a shared drive. Writes here wait for it.`,
        fix: `If nothing is running there, delete ${LOCK_RELATIVE_PATH.split('\\').join('/')}.`, autoFixable: false,
      });
    }
  }

  return finish();
}

// ─── Repair ─────────────────────────────────────────────────────────────────

function quarantineStamp(now: string): string {
  return now.replace(/[:.]/g, '-');
}

async function moveToQuarantine(root: string, quarantineDir: string, file: string): Promise<void> {
  const source = join(root, file);
  const target = join(quarantineDir, relative(join(root, STORAGE_DIR), source));
  const safety = await verifyPathSafety(target, root);
  if (!safety.safe) throw new Error(`Quarantine path is unsafe: ${safety.reason ?? 'unknown reason'}`);
  await mkdir(dirname(target), { recursive: true });
  try {
    await lstat(target);
    throw new Error(`Quarantine target already exists: ${rel(root, target)}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await rename(source, target);
}

export async function repairStore(projectDir: string, clock: Clock): Promise<DoctorFixResult> {
  const root = resolve(projectDir);
  return withWriteLock(root, async () => {
    const before = await diagnoseStore(root, clock);
    const actions: DoctorFixAction[] = [];
    const quarantineDir = join(root, STORAGE_DIR, 'quarantine', quarantineStamp(before.checkedAt));
    const manifest: { file: string; code: string; reason: string }[] = [];
    let quarantineCreated = false;
    const ensureQuarantine = async (): Promise<void> => {
      if (quarantineCreated) return;
      const safety = await verifyPathSafety(quarantineDir, root);
      if (!safety.safe) throw new Error(`Quarantine path is unsafe: ${safety.reason ?? 'unknown reason'}`);
      await mkdir(quarantineDir, { recursive: true });
      await atomicWriteText(join(quarantineDir, '.gitignore'), '# Quarantined Tamhees files may contain secrets; never commit them.\n*\n', { allowOverwrite: true });
      quarantineCreated = true;
    };

    for (const finding of before.findings) {
      if (!finding.autoFixable || finding.file === undefined) continue;
      if (finding.area === 'record' || finding.area === 'evidence' || finding.area === 'lifecycle'
        || finding.code === 'AUDIT_UNREADABLE') {
        await ensureQuarantine();
        await moveToQuarantine(root, quarantineDir, finding.file);
        manifest.push({ file: finding.file, code: finding.code, reason: finding.problem });
        actions.push({ action: 'QUARANTINED', file: finding.file, detail: finding.problem });
      } else if (finding.code === 'AUDIT_BROKEN_LINES' || finding.code === 'AUDIT_MERGE_CONFLICT') {
        const path = join(root, finding.file);
        const text = await readFile(path, 'utf8');
        const kept = text.split('\n').filter((line) => {
          if (line.trim() === '' || CONFLICT_MARKER.test(line)) return false;
          try {
            return validateAuditEvent(JSON.parse(line)).valid;
          } catch {
            return false;
          }
        });
        await ensureQuarantine();
        await moveToQuarantine(root, quarantineDir, finding.file);
        if (kept.length > 0) await atomicWriteText(path, `${kept.join('\n')}\n`, { allowOverwrite: false });
        manifest.push({ file: finding.file, code: finding.code, reason: finding.problem });
        actions.push({ action: 'SALVAGED_AUDIT_SEGMENT', file: finding.file, detail: `Kept ${kept.length} valid event(s); the original file is in quarantine.` });
      }
    }

    if (quarantineCreated) {
      await atomicWriteText(join(quarantineDir, 'MANIFEST.json'), `${JSON.stringify({
        createdAt: before.checkedAt,
        createdBy: `${CLI_NAME} doctor --fix`,
        note: `These files were moved out of ${STORAGE_DIR}/ because they could not be used. Nothing was deleted. To restore one, fix it and move it back to the same path.`,
        files: manifest,
      }, null, 2)}\n`, { allowOverwrite: false });
    }

    const needsIndex = before.findings.some((finding) => finding.area === 'index' || finding.area === 'record');
    if (needsIndex && !before.findings.some((finding) => finding.code === 'STORE_MISSING' || finding.code === 'STORE_UNSAFE_PATH')) {
      const rebuilt = await rebuildMemoryIndex(root, clock);
      actions.push({
        action: 'REBUILT_INDEX', file: `${STORAGE_DIR}/memories/index.json`,
        detail: rebuilt.success ? 'Rebuilt the memory index from the memory files.' : `Could not rebuild the index: ${rebuilt.errors.join('; ')}`,
      });
    }

    const after = await diagnoseStore(root, clock);
    return { before, actions, quarantineDir: quarantineCreated ? rel(root, quarantineDir) : null, after };
  });
}

// ─── Text output ────────────────────────────────────────────────────────────

const SEVERITY_LABEL: Readonly<Record<DoctorSeverity, string>> = { error: 'PROBLEM', warning: 'WARNING', info: 'NOTE' };

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  const errors = report.findings.filter((finding) => finding.severity === 'error').length;
  const warnings = report.findings.filter((finding) => finding.severity === 'warning').length;
  const n = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
  lines.push(`${CLI_NAME} doctor: checked ${n(report.counts.records, 'memory', 'memories')}, `
    + `${n(report.counts.evidence, 'evidence record', 'evidence records')}, ${n(report.counts.auditEvents, 'audit event', 'audit events')}, `
    + `${n(report.counts.lifecycles, 'task record', 'task records')}.`);
  lines.push('');
  if (report.findings.length === 0) {
    lines.push('Everything looks healthy.');
    return lines.join('\n');
  }
  for (const finding of report.findings) {
    lines.push(`${SEVERITY_LABEL[finding.severity]}  ${finding.problem}`);
    if (finding.file !== undefined) lines.push(`         file: ${finding.file}`);
    lines.push(`         fix:  ${finding.fix}`);
    lines.push('');
  }
  const fixable = report.findings.filter((finding) => finding.autoFixable && finding.severity !== 'info').length;
  lines.push(errors === 0
    ? `No blocking problems${warnings > 0 ? ` (${warnings} warning${warnings === 1 ? '' : 's'})` : ''}. Other commands work normally.`
    : `${errors} blocking problem${errors === 1 ? '' : 's'}${warnings > 0 ? ` and ${warnings} warning${warnings === 1 ? '' : 's'}` : ''}.`);
  if (fixable > 0) lines.push(`Run \`${CLI_NAME} doctor --fix\` to fix ${fixable} of them safely (damaged files are moved to quarantine, never deleted).`);
  return lines.join('\n');
}

export function formatDoctorFix(result: DoctorFixResult): string {
  const lines: string[] = [];
  if (result.actions.length === 0) {
    lines.push('Nothing needed fixing automatically.');
  } else {
    lines.push('Fixed:');
    for (const action of result.actions) {
      const verb = action.action === 'QUARANTINED' ? 'Moved to quarantine' : action.action === 'SALVAGED_AUDIT_SEGMENT' ? 'Repaired audit log' : 'Rebuilt index';
      lines.push(`  ✔ ${verb}${action.file !== undefined ? `: ${action.file}` : ''}`);
      if (action.action !== 'QUARANTINED') lines.push(`    ${action.detail}`);
    }
    if (result.quarantineDir !== null) {
      lines.push('');
      lines.push(`Quarantined files are in ${result.quarantineDir}/ with a MANIFEST.json explaining each one.`);
      lines.push('Nothing was deleted. Delete that folder when you no longer need it; it is excluded from git.');
    }
  }
  lines.push('');
  lines.push('After fixing:');
  lines.push(formatDoctorReport(result.after));
  return lines.join('\n');
}
