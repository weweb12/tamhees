/**
 * Tamhees — audit log writing.
 *
 * Kept apart from audit.ts (pure, deterministic rules) so the rules can run anywhere,
 * including the browser demo, while log writing stays on the filesystem side.
 */

import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { appendJsonlBatch, atomicWriteText, verifyPathSafety } from './atomic-write.js';
import { ENGINE_AUDITOR, STORAGE_DIR } from './identity.js';
import {
  CURRENT_SCHEMA_VERSION,
  ENGINE_VERSION,
  type AuditEvent,
  type AuditRunResult,
  type Clock,
  type EvidenceRecord,
  type MemoryRecord,
} from './types.js';
import { validateAuditEvent } from './validation.js';

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function generateEventId(): string {
  return `evt-${randomBytes(8).toString('hex')}`;
}

export async function writeAuditEvents(
  projectDir: string,
  result: AuditRunResult,
  records: readonly MemoryRecord[],
  clock: Clock,
  evidence: readonly EvidenceRecord[] = [],
): Promise<void> {
  const sorted = [...records].sort((a, b) => compareOrdinal(a.id, b.id));
  const events: AuditEvent[] = sorted.map((record) => {
    const itemEvidence = evidence
      .filter((item) => item.memoryIds.includes(record.id))
      .sort((a, b) => compareOrdinal(a.id, b.id));
    const findingForRecord = result.findings.find((item) => item.recordId === record.id);
    const outcome = findingForRecord?.outcome ?? 'TRUST';
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      eventId: generateEventId(),
      timestamp: clock(),
      memoryId: record.id,
      outcome,
      triggeredRules: [findingForRecord?.ruleId ?? 'DM-RULE-TRUST-001'],
      evidenceExamined: findingForRecord?.evidenceExamined ?? itemEvidence.map((item) => item.id),
      explanation: findingForRecord?.summary ?? 'Current evidence supports limited trust within the recorded permission.',
      permissionConsequence: findingForRecord?.permissionConsequence ?? 'The record may be used only within its recorded action permission.',
      recommendedAction: findingForRecord?.recommendedNextStep ?? 'Proceed within the recorded permission and recheck when freshness requires it.',
      auditor: ENGINE_AUDITOR,
      engineVersion: ENGINE_VERSION,
    };
  });
  await appendValidatedAuditEvents(projectDir, events);
}

/**
 * Append audit events. Callers must hold the project write lock (withWriteLock):
 * mutations, lifecycle, migration and the CLI audit command all do. The lock is not
 * taken here so this module's pure audit rules stay usable without filesystem locks.
 */
/** Active audit log rolls over into a segment once it would exceed this size. */
export const AUDIT_SEGMENT_MAX_BYTES = 4 * 1024 * 1024;

function segmentLimitBytes(): number {
  // Test hook: a smaller limit exercises rotation without writing megabytes.
  const raw = typeof process === 'undefined' ? undefined : process.env['TAMHEES_AUDIT_SEGMENT_BYTES'];
  const value = raw === undefined ? Number.NaN : Number(raw);
  return Number.isSafeInteger(value) && value >= 1024 ? value : AUDIT_SEGMENT_MAX_BYTES;
}
const SEGMENT_PATTERN = /^history-[A-Za-z0-9._-]{1,128}\.jsonl$/;

/**
 * Append audit events. Callers must hold the project write lock (withWriteLock):
 * mutations, lifecycle, migration and the CLI audit command all do. The lock is not
 * taken here so this module's pure audit rules stay usable without filesystem locks.
 *
 * The log is append-only and never truncated. To keep every write cheap as history
 * grows, `audits/history.jsonl` is the active segment: before it would exceed
 * AUDIT_SEGMENT_MAX_BYTES it is preserved as `audits/history-<first-event-id>.jsonl`
 * and a fresh active segment begins with the new events. Only the active segment is
 * re-validated on each append. `readAuditHistory` returns all segments in order.
 */
export async function appendValidatedAuditEvents(
  projectDir: string,
  events: readonly AuditEvent[],
): Promise<void> {
  const absProjectDir = resolve(projectDir);
  const historyPath = join(absProjectDir, STORAGE_DIR, 'audits', 'history.jsonl');
  const safety = await verifyPathSafety(historyPath, absProjectDir);
  if (!safety.safe) {
    throw new Error(`Path safety check failed: ${safety.reason}`);
  }

  let existing = '';
  let firstEventId: string | null = null;
  try {
    existing = await readFile(historyPath, 'utf-8');
    const lines = existing.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]?.trim();
      if (!line) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new Error(`Malformed existing audit history at line ${index + 1}. The file was preserved.`);
      }
      if (!validateAuditEvent(parsed).valid) {
        throw new Error(`Invalid existing audit event at line ${index + 1}. The file was preserved.`);
      }
      firstEventId ??= (parsed as AuditEvent).eventId;
    }
  } catch (err: unknown) {
    if (!(err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT')) {
      throw err;
    }
  }

  for (const event of events) {
    const validation = validateAuditEvent(event);
    if (!validation.valid) {
      throw new Error(`Internal error: invalid audit event batch (${validation.issues.map((item) => item.field).join(', ')}).`);
    }
  }

  const appendedBytes = events.reduce((sum, event) => sum + Buffer.byteLength(JSON.stringify(event), 'utf8') + 1, 0);
  if (firstEventId !== null && Buffer.byteLength(existing, 'utf8') + appendedBytes > segmentLimitBytes()) {
    await sealActiveSegment(absProjectDir, existing, firstEventId);
    await atomicWriteText(historyPath, '', { allowOverwrite: true });
  }
  await appendJsonlBatch(historyPath, events);
}

/**
 * Preserve the current active segment under a name derived from its first event ID.
 * Re-running after a crash finds the segment already present and continues, so events
 * are never lost and a sealed segment is never overwritten.
 */
async function sealActiveSegment(projectDir: string, content: string, firstEventId: string): Promise<void> {
  const name = `history-${firstEventId}.jsonl`;
  if (!SEGMENT_PATTERN.test(name)) throw new Error('Cannot seal the audit log segment: unexpected event ID format.');
  const segmentPath = join(projectDir, STORAGE_DIR, 'audits', name);
  const safety = await verifyPathSafety(segmentPath, projectDir);
  if (!safety.safe) throw new Error(`Path safety check failed: ${safety.reason}`);
  try {
    await atomicWriteText(segmentPath, content, { allowOverwrite: false });
  } catch (err: unknown) {
    const existingSegment = await readFile(segmentPath, 'utf-8').catch(() => null);
    if (existingSegment !== content) throw err;
  }
}

/** All audit events, oldest first: sealed segments in order, then the active segment. */
export async function readAuditHistory(projectDir: string): Promise<string> {
  const auditsDir = join(resolve(projectDir), STORAGE_DIR, 'audits');
  const segments: { name: string; firstTimestamp: string }[] = [];
  let names: string[] = [];
  try {
    names = await readdir(auditsDir);
  } catch {
    return '';
  }
  const parts: string[] = [];
  for (const name of names.filter((file) => SEGMENT_PATTERN.test(file))) {
    const text = await readFile(join(auditsDir, name), 'utf-8');
    const first = text.split('\n').find((line) => line.trim() !== '');
    let timestamp = '';
    try {
      timestamp = first ? String((JSON.parse(first) as { timestamp?: unknown }).timestamp ?? '') : '';
    } catch {
      timestamp = '';
    }
    segments.push({ name, firstTimestamp: timestamp });
    parts.push(text);
  }
  const ordered = segments
    .map((segment, index) => ({ ...segment, text: parts[index]! }))
    .sort((a, b) => (a.firstTimestamp < b.firstTimestamp ? -1 : a.firstTimestamp > b.firstTimestamp ? 1 : a.name < b.name ? -1 : 1));
  let active = '';
  try {
    active = await readFile(join(auditsDir, 'history.jsonl'), 'utf-8');
  } catch {
    active = '';
  }
  return [...ordered.map((segment) => segment.text), active].join('');
}

