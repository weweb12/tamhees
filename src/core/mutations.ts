/** Doubtful Memory — controlled memory create/update/revoke/redact operations. */

import { randomBytes } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { appendValidatedAuditEvents } from './audit.js';
import { atomicWriteJson, verifyPathSafety, verifyStorageTreeSafety } from './atomic-write.js';
import { loadAllEvidence } from './evidence.js';
import { ENGINE_AUDITOR, ENGINE_VERSION, STORAGE_DIR } from './identity.js';
import { isRedactedText, scanMemoryRecord, scanSecretLikeText } from './privacy.js';
import { loadAllRecords, rebuildMemoryIndex } from './store.js';
import {
  CURRENT_SCHEMA_VERSION,
  type AuditEvent,
  type Clock,
  type EvidenceRecord,
  type MemoryRecord,
  type MutationResult,
  type UpdateCandidate,
  type ValidationIssue,
  type VerificationStatus,
} from './types.js';
import { validateMemoryRecord, validateUpdateCandidate } from './validation.js';

const STATUS_ALLOWED_BY_AUTHORITY: Readonly<Record<VerificationStatus, readonly VerificationStatus[]>> = {
  OWNER_CONFIRMED: ['OWNER_CONFIRMED', 'REPO_VERIFIED', 'TEST_VERIFIED', 'OBSERVED', 'INFERRED', 'UNKNOWN', 'CONFLICTED'],
  REPO_VERIFIED: ['REPO_VERIFIED', 'OBSERVED', 'INFERRED', 'UNKNOWN', 'CONFLICTED'],
  TEST_VERIFIED: ['TEST_VERIFIED', 'OBSERVED', 'INFERRED', 'UNKNOWN', 'CONFLICTED'],
  OBSERVED: ['OBSERVED', 'INFERRED', 'UNKNOWN'],
  INFERRED: ['INFERRED', 'UNKNOWN'],
  UNKNOWN: ['UNKNOWN'],
  CONFLICTED: ['CONFLICTED', 'UNKNOWN'],
  REVOKED: [],
};

export async function applyUpdateCandidate(
  projectDir: string,
  input: unknown,
  clock: Clock,
): Promise<MutationResult> {
  const candidateValidation = validateUpdateCandidate(input);
  if (!candidateValidation.valid) {
    return failure(actionFromUnknown(input), null, candidateValidation.issues);
  }
  const candidate = input as UpdateCandidate;
  const candidateMetadataScan = scanSecretLikeText([
    candidate.proposedBy,
    candidate.reason,
    candidate.supersededBy ?? '',
  ]);
  if (candidateMetadataScan.secretLike) {
    return failure(candidate.action, candidate.memoryId ?? candidate.proposedRecord?.id ?? null, [
      issue('reason', 'SECRET_LIKE_CONTENT', `Candidate metadata matched secret-like patterns: ${candidateMetadataScan.patternIds.join(', ')}. Redact it before retrying.`),
    ]);
  }
  const absProjectDir = resolve(projectDir);
  const storagePath = join(absProjectDir, STORAGE_DIR);
  const treeSafety = await verifyStorageTreeSafety(storagePath, absProjectDir);
  if (!treeSafety.safe) {
    return failure(candidate.action, candidate.memoryId ?? candidate.proposedRecord?.id ?? null, [
      issue('', 'PATH_SAFETY', treeSafety.reason ?? 'Storage tree is unsafe.'),
    ]);
  }

  const loaded = await loadAllRecords(absProjectDir);
  if (loaded.errors.length > 0) {
    return failure(candidate.action, candidate.memoryId ?? candidate.proposedRecord?.id ?? null,
      loaded.errors.map((message) => issue('', 'STORE_INVALID', message)));
  }
  const evidenceLoaded = await loadAllEvidence(absProjectDir);
  if (evidenceLoaded.errors.length > 0) {
    return failure(candidate.action, candidate.memoryId ?? candidate.proposedRecord?.id ?? null,
      evidenceLoaded.errors.map((message) => issue('evidence', 'EVIDENCE_STORE_INVALID', message)));
  }

  const evidenceById = new Map(evidenceLoaded.evidence.map((item) => [item.id, item]));
  const missingEvidence = candidate.evidence.filter((id) => !evidenceById.has(id));
  if (missingEvidence.length > 0) {
    return failure(candidate.action, candidate.memoryId ?? candidate.proposedRecord?.id ?? null, [
      issue('evidence', 'UNKNOWN_EVIDENCE', `Unknown evidence IDs: ${missingEvidence.join(', ')}.`),
    ]);
  }
  const candidateEvidence = candidate.evidence.map((id) => evidenceById.get(id) as EvidenceRecord);
  const recordsById = new Map(loaded.records.map((record) => [record.id, record]));

  const approvalIssues = validateAuthority(candidate, candidateEvidence, recordsById);
  if (approvalIssues.length > 0) {
    return failure(candidate.action, candidate.memoryId ?? candidate.proposedRecord?.id ?? null, approvalIssues);
  }

  const now = clock();
  let prior: MemoryRecord | null = null;
  let next: MemoryRecord;

  if (candidate.action === 'CREATE') {
    const proposed = candidate.proposedRecord as MemoryRecord;
    if (recordsById.has(proposed.id)) {
      return failure(candidate.action, proposed.id, [issue('proposedRecord.id', 'DUPLICATE_ID', `Memory ID ${proposed.id} already exists.`)]);
    }
    next = { ...proposed, schemaVersion: CURRENT_SCHEMA_VERSION, createdAt: now, updatedAt: now };
  } else {
    const memoryId = candidate.memoryId as string;
    prior = recordsById.get(memoryId) ?? null;
    if (!prior) {
      return failure(candidate.action, memoryId, [issue('memoryId', 'NOT_FOUND', `Memory ID ${memoryId} was not found.`)]);
    }
    if (candidate.action === 'UPDATE') {
      const proposed = candidate.proposedRecord as MemoryRecord;
      if (proposed.createdAt !== prior.createdAt) {
        return failure(candidate.action, memoryId, [issue('proposedRecord.createdAt', 'IMMUTABLE_FIELD', 'createdAt cannot be changed.')]);
      }
      if (proposed.updatedAt !== prior.updatedAt) {
        return failure(candidate.action, memoryId, [issue('proposedRecord.updatedAt', 'STALE_UPDATE', 'updatedAt must match the current record before the engine applies a new timestamp.')]);
      }
      if (prior.verificationStatus === 'REVOKED') {
        return failure(candidate.action, memoryId, [issue('memoryId', 'REVOKED_RECORD', 'Revoked records cannot be updated; create a new record instead.')]);
      }
      next = { ...proposed, schemaVersion: CURRENT_SCHEMA_VERSION, createdAt: prior.createdAt, updatedAt: now };
    } else if (candidate.action === 'REVOKE') {
      next = {
        ...prior,
        verificationStatus: 'REVOKED',
        confidence: 'LOW',
        actionPermission: 'MUST_NOT_ACT',
        relationships: {
          ...prior.relationships,
          ...(candidate.supersededBy ? { supersededBy: candidate.supersededBy } : {}),
        },
        notes: appendSafeNote(prior.notes, `Revoked by ${candidate.proposedBy}. Reason: ${candidate.reason}`),
        updatedAt: now,
      };
    } else {
      next = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        id: prior.id,
        kind: prior.kind,
        statement: '[REDACTED — controlled privacy removal]',
        source: { type: 'SYSTEM_OBSERVATION', reference: '[REDACTED]' },
        verificationStatus: 'REVOKED',
        confidence: 'LOW',
        freshness: { lastVerified: now },
        sensitivity: 'SECRET',
        actionPermission: 'FORGET_OR_REDACT',
        relationships: {
          ...(prior.relationships.supersededBy ? { supersededBy: prior.relationships.supersededBy } : {}),
        },
        tags: ['redacted'],
        notes: `Raw content removed by ${candidate.proposedBy}. Reason: ${candidate.reason}`,
        createdAt: prior.createdAt,
        updatedAt: now,
      };
    }
  }

  const nextValidation = validateMemoryRecord(next);
  if (!nextValidation.valid) {
    return failure(candidate.action, next.id, nextValidation.issues);
  }
  if (candidate.action !== 'REDACT') {
    const scan = scanMemoryRecord(next);
    if (scan.secretLike) {
      return failure(candidate.action, next.id, [
        issue('proposedRecord', 'SECRET_LIKE_CONTENT', `Memory was not stored because secret-like content matched: ${scan.patternIds.join(', ')}. Redact it before retrying.`),
      ]);
    }
    const requiresRedactedRetention = next.sensitivity === 'SENSITIVE'
      || next.sensitivity === 'SECRET'
      || next.actionPermission === 'FORGET_OR_REDACT';
    if (requiresRedactedRetention) {
      if (!isRedactedText(next.statement) || !isRedactedText(next.source.reference)) {
        return failure(candidate.action, next.id, [
          issue('proposedRecord', 'RAW_SENSITIVE_RETENTION', 'SENSITIVE, SECRET, or FORGET_OR_REDACT records may retain only explicitly redacted statement and source fields.'),
        ]);
      }
      if (next.tags.some((tag) => tag.toLowerCase() !== 'redacted')) {
        return failure(candidate.action, next.id, [
          issue('proposedRecord.tags', 'RAW_SENSITIVE_RETENTION', 'Restricted records may retain only the safe "redacted" tag.'),
        ]);
      }
    }
  }

  const supersessionIssues = validateSupersession(candidate, next, recordsById);
  if (supersessionIssues.length > 0) {
    return failure(candidate.action, next.id, supersessionIssues);
  }

  const recordPath = join(storagePath, 'memories', 'records', `${next.id}.json`);
  const recordSafety = await verifyPathSafety(recordPath, absProjectDir);
  if (!recordSafety.safe) {
    return failure(candidate.action, next.id, [issue('', 'PATH_SAFETY', recordSafety.reason ?? 'Record path is unsafe.')]);
  }

  let archivePath: string | null = null;
  if (prior && candidate.action !== 'REDACT') {
    const archiveDir = join(storagePath, 'archive', 'memories', prior.id);
    const archiveDirSafety = await verifyPathSafety(archiveDir, absProjectDir);
    if (!archiveDirSafety.safe) {
      return failure(candidate.action, next.id, [issue('', 'PATH_SAFETY', archiveDirSafety.reason ?? 'Archive directory is unsafe.')]);
    }
    try {
      await mkdir(archiveDir, { recursive: true });
    } catch {
      return failure(candidate.action, next.id, [issue('', 'ARCHIVE_FAILED', 'Unable to create the safe archive directory.')]);
    }
    const archiveNonce = randomBytes(4).toString('hex');
    archivePath = join('archive', 'memories', prior.id, `${fileTimestamp(now)}-${archiveNonce}-pre-${candidate.action.toLowerCase()}.json`);
    const absoluteArchive = join(storagePath, archivePath);
    const archiveSafety = await verifyPathSafety(absoluteArchive, absProjectDir);
    if (!archiveSafety.safe) {
      return failure(candidate.action, next.id, [issue('', 'PATH_SAFETY', archiveSafety.reason ?? 'Archive path is unsafe.')]);
    }
    try {
      await atomicWriteJson(absoluteArchive, prior, { allowOverwrite: false });
    } catch (err: unknown) {
      return failure(candidate.action, next.id, [issue('', 'ARCHIVE_FAILED', err instanceof Error ? err.message : String(err))]);
    }
  }

  try {
    await atomicWriteJson(recordPath, next, { allowOverwrite: candidate.action !== 'CREATE' });
  } catch (err: unknown) {
    return failure(candidate.action, next.id, [issue('', 'WRITE_FAILED', err instanceof Error ? err.message : String(err))], archivePath);
  }

  const indexResult = await rebuildMemoryIndex(absProjectDir, () => now);
  if (!indexResult.success) {
    const rollbackError = await rollbackCanonical(recordPath, prior);
    const rollbackIndex = await rebuildMemoryIndex(absProjectDir, () => now);
    const errors = indexResult.errors.map((message) => issue('', 'INDEX_FAILED', message));
    if (rollbackError) errors.push(issue('', 'ROLLBACK_FAILED', rollbackError));
    if (!rollbackIndex.success) errors.push(...rollbackIndex.errors.map((message) => issue('', 'ROLLBACK_INDEX_FAILED', message)));
    return failure(candidate.action, next.id, errors, archivePath);
  }

  const auditEvent = mutationAuditEvent(candidate, next, now);
  try {
    await appendValidatedAuditEvents(absProjectDir, [auditEvent]);
  } catch (err: unknown) {
    const rollbackError = await rollbackCanonical(recordPath, prior);
    const rollbackIndex = await rebuildMemoryIndex(absProjectDir, () => now);
    const errors = [
      issue('', 'AUDIT_WRITE_FAILED', `Mutation was rolled back because its audit event could not be written: ${err instanceof Error ? err.message : String(err)}`),
    ];
    if (rollbackError) errors.push(issue('', 'ROLLBACK_FAILED', rollbackError));
    if (!rollbackIndex.success) errors.push(...rollbackIndex.errors.map((message) => issue('', 'ROLLBACK_INDEX_FAILED', message)));
    return failure(candidate.action, next.id, errors, archivePath);
  }

  return {
    success: true,
    action: candidate.action,
    memoryId: next.id,
    record: next,
    archivePath,
    errors: [],
  };
}

function validateAuthority(
  candidate: UpdateCandidate,
  evidence: readonly EvidenceRecord[],
  records: ReadonlyMap<string, MemoryRecord>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (candidate.requiresOwnerApproval && candidate.authorityLevel !== 'OWNER_CONFIRMED') {
    issues.push(issue('authorityLevel', 'OWNER_APPROVAL_REQUIRED', 'This candidate requires owner approval and cannot be applied with lower authority.'));
  }

  const target = candidate.memoryId ? records.get(candidate.memoryId) : undefined;
  if (
    target
    && candidate.action !== 'REDACT'
    && (
      candidate.authorityLevel === 'UNKNOWN'
      || candidate.authorityLevel === 'CONFLICTED'
      || candidate.authorityLevel === 'REVOKED'
      || !STATUS_ALLOWED_BY_AUTHORITY[candidate.authorityLevel].includes(target.verificationStatus)
    )
  ) {
    issues.push(issue('authorityLevel', 'INSUFFICIENT_AUTHORITY', `${candidate.authorityLevel} authority cannot ${candidate.action.toLowerCase()} a ${target.verificationStatus} record.`));
  }
  if (target?.verificationStatus === 'OWNER_CONFIRMED' && candidate.authorityLevel !== 'OWNER_CONFIRMED') {
    issues.push(issue('authorityLevel', 'AUTHORITY_NON_ESCALATION', 'Only explicit owner authority may change or revoke an OWNER_CONFIRMED record.'));
  }

  const proposed = candidate.proposedRecord;
  if (proposed) {
    if (proposed.verificationStatus === 'REVOKED') {
      issues.push(issue('proposedRecord.verificationStatus', 'INVALID_TRANSITION', 'Use the REVOKE action instead of directly proposing REVOKED status.'));
    }
    if (candidate.action === 'CREATE' && proposed.relationships.supersededBy !== undefined) {
      issues.push(issue('proposedRecord.relationships.supersededBy', 'INVALID_TRANSITION', 'CREATE cannot start as superseded; use the controlled REVOKE workflow after creation.'));
    }
    if (candidate.action === 'UPDATE' && proposed.relationships.supersededBy !== target?.relationships.supersededBy) {
      issues.push(issue('proposedRecord.relationships.supersededBy', 'INVALID_TRANSITION', 'UPDATE cannot change supersededBy; use the controlled REVOKE action.'));
    }
    if (!STATUS_ALLOWED_BY_AUTHORITY[candidate.authorityLevel].includes(proposed.verificationStatus)) {
      issues.push(issue('proposedRecord.verificationStatus', 'AUTHORITY_ESCALATION', `${candidate.authorityLevel} authority cannot propose ${proposed.verificationStatus} status.`));
    }
    const sourceAligned = (
      (proposed.verificationStatus === 'REPO_VERIFIED' && proposed.source.type === 'REPOSITORY_STATE')
      || (proposed.verificationStatus === 'TEST_VERIFIED' && proposed.source.type === 'TEST_RESULT')
      || (proposed.verificationStatus === 'OBSERVED' && (proposed.source.type === 'AGENT_OBSERVATION' || proposed.source.type === 'SYSTEM_OBSERVATION'))
      || (proposed.verificationStatus === 'INFERRED' && proposed.source.type === 'AGENT_INFERENCE')
      || proposed.verificationStatus === 'UNKNOWN'
      || proposed.verificationStatus === 'CONFLICTED'
      || proposed.verificationStatus === 'OWNER_CONFIRMED'
    );
    if (!sourceAligned) {
      issues.push(issue('proposedRecord.source.type', 'SOURCE_AUTHORITY_MISMATCH', `${proposed.source.type} does not support ${proposed.verificationStatus} status.`));
    }
    if (proposed.verificationStatus === 'OWNER_CONFIRMED') {
      const hasOwnerEvidence = evidence.some((item) => item.type === 'OWNER_INSTRUCTION' && item.relationship === 'SUPPORTS' && item.memoryIds.includes(proposed.id));
      if (!hasOwnerEvidence) {
        issues.push(issue('evidence', 'OWNER_EVIDENCE_REQUIRED', 'OWNER_CONFIRMED requires explicit supporting OWNER_INSTRUCTION evidence.'));
      }
    }
  }

  if (target?.verificationStatus === 'OWNER_CONFIRMED') {
    const hasOwnerEvidence = evidence.some((item) => item.type === 'OWNER_INSTRUCTION' && item.relationship === 'SUPPORTS' && item.memoryIds.includes(target.id));
    if (!hasOwnerEvidence) {
      issues.push(issue('evidence', 'OWNER_EVIDENCE_REQUIRED', 'Changing an OWNER_CONFIRMED record requires explicit supporting OWNER_INSTRUCTION evidence.'));
    }
  }
  return issues;
}

function validateSupersession(
  candidate: UpdateCandidate,
  next: MemoryRecord,
  records: ReadonlyMap<string, MemoryRecord>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const supersedes = next.relationships.supersedes;
  if (supersedes) {
    const prior = records.get(supersedes);
    if (!prior) {
      issues.push(issue('proposedRecord.relationships.supersedes', 'NOT_FOUND', `Superseded memory ${supersedes} was not found.`));
    }
  }
  if (candidate.supersededBy) {
    const replacement = records.get(candidate.supersededBy);
    if (!replacement) {
      issues.push(issue('supersededBy', 'NOT_FOUND', `Superseding memory ${candidate.supersededBy} was not found.`));
    } else if (replacement.relationships.supersedes !== candidate.memoryId) {
      issues.push(issue('supersededBy', 'RELATIONSHIP_MISMATCH', `Memory ${candidate.supersededBy} must declare relationships.supersedes = ${candidate.memoryId} before revocation.`));
    }
  }
  return issues;
}

function mutationAuditEvent(candidate: UpdateCandidate, record: MemoryRecord, timestamp: string): AuditEvent {
  const outcome = candidate.action === 'REDACT'
    ? 'FORGET_OR_REDACT'
    : candidate.action === 'REVOKE' ? 'BLOCK_ACTION' : 'RECHECK';
  const ruleId = candidate.action === 'REDACT'
    ? 'DM-RULE-PRIV-001'
    : candidate.action === 'REVOKE' ? 'DM-RULE-REVOKE-001' : 'DM-RULE-AUTH-006';
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    eventId: `evt-${randomBytes(8).toString('hex')}`,
    timestamp,
    memoryId: record.id,
    outcome,
    triggeredRules: [ruleId],
    evidenceExamined: [...candidate.evidence].sort(),
    explanation: `${candidate.action} completed through controlled mutation validation. Reason: ${candidate.reason}`,
    permissionConsequence: candidate.action === 'REDACT'
      ? 'Raw content is no longer available.'
      : candidate.action === 'REVOKE'
        ? 'The revoked record cannot authorize action.'
        : 'The resulting record remains subject to the normal audit rules.',
    recommendedAction: candidate.action === 'REDACT'
      ? 'Retain only privacy-safe audit metadata.'
      : candidate.action === 'REVOKE'
        ? 'Use a verified superseding record or ask the owner.'
        : 'Run the audit before relying on the record.',
    auditor: ENGINE_AUDITOR,
    engineVersion: ENGINE_VERSION,
  };
}

async function rollbackCanonical(path: string, prior: MemoryRecord | null): Promise<string | null> {
  try {
    if (prior) {
      await atomicWriteJson(path, prior, { allowOverwrite: true });
      return null;
    }
    await unlink(path);
    return null;
  } catch (err: unknown) {
    if (!prior && err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    return `Canonical rollback failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function appendSafeNote(existing: string | undefined, addition: string): string {
  return existing ? `${existing}\n${addition}` : addition;
}

function fileTimestamp(iso: string): string {
  return iso.replace(/[:.]/g, '-');
}

function issue(field: string, code: string, message: string): ValidationIssue {
  return { field, code, message };
}

function failure(
  action: MutationResult['action'],
  memoryId: string | null,
  errors: readonly ValidationIssue[],
  archivePath: string | null = null,
): MutationResult {
  return { success: false, action, memoryId, record: null, archivePath, errors };
}

function actionFromUnknown(value: unknown): MutationResult['action'] {
  if (typeof value === 'object' && value !== null && 'action' in value) {
    const action = (value as { action?: unknown }).action;
    if (action === 'CREATE' || action === 'UPDATE' || action === 'REVOKE' || action === 'REDACT') return action;
  }
  return 'UPDATE';
}
