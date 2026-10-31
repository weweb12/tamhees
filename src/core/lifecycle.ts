/** Tamhees - controlled task lifecycle. */

import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { appendValidatedAuditEvents } from './audit-log.js';
import { atomicWriteJson, verifyPathSafety, verifyStorageTreeSafety } from './atomic-write.js';
import { compileContext, formatContextAsMarkdown, type ContextCompileOptions } from './context.js';
import { loadAllEvidence } from './evidence.js';
import { ENGINE_AUDITOR, ENGINE_VERSION, STORAGE_DIR } from './identity.js';
import { applyUpdateCandidate, previewUpdateCandidate } from './mutations.js';
import { isRedactedText, scanMemoryRecord, scanSecretLikeText } from './privacy.js';
import { loadAllRecords } from './store.js';
import {
  CURRENT_SCHEMA_VERSION,
  type AuditEvent,
  type Clock,
  type EvidenceRecord,
  type LifecycleBeginResult,
  type LifecycleDispositionRecord,
  type LifecycleFinalizationInput,
  type LifecycleFinalizeResult,
  type LifecycleMetadata,
  type LifecycleProposer,
  type MemoryRecord,
  type UpdateCandidate,
  type ValidationIssue,
  type VerificationStatus,
} from './types.js';
import {
  isIso8601,
  isSafeArtifactId,
  validateContextPack,
  validateLifecycleFinalizationInput,
  validateLifecycleMetadata,
  validateUpdateCandidate,
} from './validation.js';
import { withWriteLock } from './lock.js';

export type LifecycleIdGenerator = () => string;

const AUTHORITY_ALLOWED: Readonly<Record<VerificationStatus, readonly VerificationStatus[]>> = {
  OWNER_CONFIRMED: ['OWNER_CONFIRMED', 'REPO_VERIFIED', 'TEST_VERIFIED', 'OBSERVED', 'INFERRED', 'UNKNOWN', 'CONFLICTED'],
  REPO_VERIFIED: ['REPO_VERIFIED', 'OBSERVED', 'INFERRED', 'UNKNOWN', 'CONFLICTED'],
  TEST_VERIFIED: ['TEST_VERIFIED', 'OBSERVED', 'INFERRED', 'UNKNOWN', 'CONFLICTED'],
  OBSERVED: ['OBSERVED', 'INFERRED', 'UNKNOWN'],
  INFERRED: ['INFERRED', 'UNKNOWN'],
  UNKNOWN: ['UNKNOWN'],
  CONFLICTED: ['CONFLICTED', 'UNKNOWN'],
  REVOKED: [],
};

const OWNER_POLICY_TERMS = [
  'architecture', 'budget', 'cost', 'external service', 'external-service', 'payment',
  'privacy', 'publication', 'publish', 'remote', 'scope', 'telemetry', 'upload',
] as const;

const GENERATED_EVIDENCE_MARKERS = [
  'context pack', 'generated summary', 'lifecycle result', 'audit output', 'engine summary',
] as const;

export interface LifecycleBeginOptions extends ContextCompileOptions {}

/** Optional operation hooks used by adapters and deterministic failure testing. */
export interface LifecycleOperationHooks {
  readonly beforeEvidenceWrite?: (evidence: EvidenceRecord) => void | Promise<void>;
  readonly beforeMetadataWrite?: (metadata: LifecycleMetadata) => void | Promise<void>;
  readonly beforeAuditAppend?: (events: readonly AuditEvent[]) => void | Promise<void>;
  readonly beforeMutation?: (candidate: UpdateCandidate, proposalIndex: number) => void | Promise<void>;
}

export function randomLifecycleId(): string {
  return `lc-${randomBytes(12).toString('hex')}`;
}

export async function beginLifecycle(
  projectDir: string,
  taskDescription: string,
  clock: Clock,
  idGenerator: LifecycleIdGenerator,
  options: LifecycleBeginOptions = {},
  hooks: LifecycleOperationHooks = {},
): Promise<LifecycleBeginResult> {
  return withWriteLock(projectDir, () => beginLifecycleUnlocked(projectDir, taskDescription, clock, idGenerator, options, hooks));
}

async function beginLifecycleUnlocked(
  projectDir: string,
  taskDescription: string,
  clock: Clock,
  idGenerator: LifecycleIdGenerator,
  options: LifecycleBeginOptions = {},
  hooks: LifecycleOperationHooks = {},
): Promise<LifecycleBeginResult> {
  if (taskDescription.trim().length === 0) {
    return beginFailure(issue('task', 'MISSING_REQUIRED', 'A non-empty task description is required.'));
  }
  const taskScan = scanSecretLikeText([taskDescription]);
  if (taskScan.secretLike) {
    return beginFailure(issue('task', 'SECRET_LIKE_CONTENT', `Task input matched secret-like patterns: ${taskScan.patternIds.join(', ')}. It was not retrieved or persisted.`));
  }

  const timestamp = clock();
  if (!isIso8601(timestamp)) {
    return beginFailure(issue('clock', 'INVALID_TIMESTAMP', 'The injected clock must return an ISO-8601 UTC timestamp.'));
  }
  const lifecycleId = idGenerator();
  if (!isSafeArtifactId(lifecycleId)) {
    return beginFailure(issue('lifecycleId', 'UNSAFE_ID', 'The lifecycle ID generator returned an unsafe identifier.'));
  }

  const absProjectDir = resolve(projectDir);
  const storagePath = join(absProjectDir, STORAGE_DIR);
  const treeSafety = await verifyStorageTreeSafety(storagePath, absProjectDir);
  if (!treeSafety.safe) return beginFailure(issue('', 'PATH_SAFETY', treeSafety.reason ?? 'Storage tree is unsafe.'));

  const lifecyclePath = lifecycleFilePath(absProjectDir, lifecycleId);
  const pathSafety = await verifyPathSafety(lifecyclePath, absProjectDir);
  if (!pathSafety.safe) return beginFailure(issue('', 'PATH_SAFETY', pathSafety.reason ?? 'Lifecycle path is unsafe.'));
  if (await pathExists(lifecyclePath)) {
    return beginFailure(issue('lifecycleId', 'DUPLICATE_ID', 'The generated lifecycle ID already exists; no metadata was changed.'));
  }

  const loaded = await loadAllRecords(absProjectDir);
  if (loaded.errors.length > 0) return beginFailure(issue('', 'STORE_INVALID', safeJoinedErrors(loaded.errors)));
  const evidenceLoaded = await loadAllEvidence(absProjectDir);
  if (evidenceLoaded.errors.length > 0) return beginFailure(issue('', 'EVIDENCE_STORE_INVALID', safeJoinedErrors(evidenceLoaded.errors)));

  let contextPack;
  try {
    contextPack = compileContext(taskDescription, loaded.records, () => timestamp, evidenceLoaded.evidence, options);
  } catch (error: unknown) {
    return beginFailure(issue('maxTokens', 'INVALID_NUMBER', error instanceof Error ? error.message : 'Context compilation failed.'));
  }
  const contextValidation = validateContextPack(contextPack);
  if (!contextValidation.valid) {
    return beginFailure(issue('', 'INTERNAL_VALIDATION', 'Generated context failed internal validation; raw context was not persisted or echoed.'));
  }

  const beginAuditId = lifecycleAuditId(lifecycleId, 'begin');
  const metadata: LifecycleMetadata = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    lifecycleId,
    status: 'OPEN',
    openedAt: timestamp,
    updatedAt: timestamp,
    selectedMemoryIds: contextPack.selected.map((item) => item.memoryId),
    exclusionReasonCodes: [...new Set(contextPack.excluded.map((item) => item.reasonCode))].sort(compareOrdinal),
    budget: contextPack.budget,
    auditReferences: [beginAuditId],
  };
  const metadataValidation = validateLifecycleMetadata(metadata);
  if (!metadataValidation.valid) return beginFailure(issue('', 'INTERNAL_VALIDATION', 'Lifecycle metadata failed internal validation.'));

  const auditEvent: AuditEvent = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    eventId: beginAuditId,
    timestamp,
    memoryId: lifecycleId,
    outcome: 'TRUST',
    triggeredRules: ['DM-RULE-LIFE-BEGIN-001'],
    evidenceExamined: [],
    explanation: 'Lifecycle opened after safe automatic retrieval. Task text and context statements were not persisted.',
    permissionConsequence: 'Only privacy-safe lifecycle metadata is retained for finalization correlation.',
    recommendedAction: 'Perform the task using the ephemeral context, then submit a controlled lifecycle finalization.',
    auditor: ENGINE_AUDITOR,
    engineVersion: ENGINE_VERSION,
  };

  try {
    await hooks.beforeMetadataWrite?.(metadata);
    await atomicWriteJson(lifecyclePath, metadata, { allowOverwrite: false });
    await hooks.beforeAuditAppend?.([auditEvent]);
    await appendValidatedAuditEvents(absProjectDir, [auditEvent]);
  } catch {
    try { await unlink(lifecyclePath); } catch { /* best-effort rollback */ }
    return beginFailure(issue('', 'WRITE_FAILED', 'Lifecycle begin could not commit safe metadata and its audit reference; no context pack was persisted.'));
  }

  return {
    success: true,
    lifecycleId,
    status: 'OPEN',
    openedAt: timestamp,
    contextPack,
    auditReferences: [beginAuditId],
    errors: [],
  };
}

const activeFinalizations = new Set<string>();
/**
 * A second finalization started in this process while one is active is refused at
 * once (same-process guard). Writers in other processes queue on the project write
 * lock (DM-DEC-043) instead of racing.
 */
export async function finalizeLifecycle(projectDir: string, input: unknown, clock: Clock, hooks: LifecycleOperationHooks = {}): Promise<LifecycleFinalizeResult> {
  const key = resolve(projectDir);
  if (activeFinalizations.has(key)) return finalizeFailure(null, issue('', 'CONCURRENT_FINALIZATION', 'Another finalization is active in this process. Retry after it completes.'));
  activeFinalizations.add(key);
  try { return await withWriteLock(projectDir, () => finalizeLifecycleInternal(projectDir, input, clock, hooks)); }
  finally { activeFinalizations.delete(key); }
}
async function finalizeLifecycleInternal(
  projectDir: string,
  input: unknown,
  clock: Clock,
  hooks: LifecycleOperationHooks = {},
): Promise<LifecycleFinalizeResult> {
  const secretScan = scanSecretLikeText(collectStrings(input));
  if (secretScan.secretLike) {
    return finalizeFailure(null, issue('', 'SECRET_LIKE_CONTENT', `Finalization input matched secret-like patterns: ${secretScan.patternIds.join(', ')}. Nothing was persisted or applied.`));
  }

  const validation = validateLifecycleFinalizationInput(input);
  if (!validation.valid) return finalizeFailures(null, validation.issues);
  const request = input as LifecycleFinalizationInput;
  const absProjectDir = resolve(projectDir);
  const storagePath = join(absProjectDir, STORAGE_DIR);
  const treeSafety = await verifyStorageTreeSafety(storagePath, absProjectDir);
  if (!treeSafety.safe) return finalizeFailure(request.lifecycleId, issue('', 'PATH_SAFETY', treeSafety.reason ?? 'Storage tree is unsafe.'));

  const lifecyclePath = lifecycleFilePath(absProjectDir, request.lifecycleId);
  const pathSafety = await verifyPathSafety(lifecyclePath, absProjectDir);
  if (!pathSafety.safe) return finalizeFailure(request.lifecycleId, issue('', 'PATH_SAFETY', pathSafety.reason ?? 'Lifecycle path is unsafe.'));
  const loadedMetadata = await readLifecycleMetadata(lifecyclePath, request.lifecycleId);
  if (!loadedMetadata.success) return finalizeFailure(request.lifecycleId, loadedMetadata.error);
  const metadata = loadedMetadata.metadata;
  const fingerprint = hashFinalization(request);

  if (metadata.status === 'COMPLETED' || metadata.status === 'COMPLETED_WITH_HELD_ITEMS') {
    if (metadata.finalization?.fingerprint !== fingerprint) {
      return finalizeFailure(request.lifecycleId, issue('lifecycleId', 'ALREADY_FINALIZED', 'This lifecycle was finalized with different content. Canonical state was preserved.'));
    }
    return resultFromMetadata(metadata, true);
  }
  if (metadata.status === 'FINALIZING') {
    return finalizeFailure(request.lifecycleId, issue('lifecycleId', 'RECOVERY_REQUIRED', 'This lifecycle has an interrupted finalization journal. Automatic replay is blocked to prevent duplicate mutations; inspect the recorded dispositions and controlled storage before recovery.'));
  }
  if (metadata.status === 'FAILED') {
    return finalizeFailure(request.lifecycleId, issue('lifecycleId', 'FAILED_LIFECYCLE', metadata.recoveryGuidance ?? 'This lifecycle failed and requires controlled recovery.'));
  }
  if (metadata.status !== 'OPEN') {
    return finalizeFailure(request.lifecycleId, issue('status', 'INVALID_STATE', 'The lifecycle state does not permit finalization. The metadata file was preserved.'));
  }

  const timestamp = clock();
  if (!isIso8601(timestamp)) return finalizeFailure(request.lifecycleId, issue('clock', 'INVALID_TIMESTAMP', 'The injected clock must return an ISO-8601 UTC timestamp.'));
  if (Date.parse(timestamp) < Date.parse(metadata.openedAt)) return finalizeFailure(request.lifecycleId, issue('clock', 'INVALID_TIMESTAMP_ORDER', 'Finalization time cannot precede lifecycle opening time.'));
  const recordsLoaded = await loadAllRecords(absProjectDir);
  if (recordsLoaded.errors.length > 0) return finalizeFailure(request.lifecycleId, issue('', 'STORE_INVALID', safeJoinedErrors(recordsLoaded.errors)));
  const evidenceLoaded = await loadAllEvidence(absProjectDir);
  if (evidenceLoaded.errors.length > 0) return finalizeFailure(request.lifecycleId, issue('', 'EVIDENCE_STORE_INVALID', safeJoinedErrors(evidenceLoaded.errors)));

  const records = new Map(recordsLoaded.records.map((record) => [record.id, record]));
  const evidence = new Map(evidenceLoaded.evidence.map((item) => [item.id, item]));
  const proposedEvidence = request.proposedEvidence ?? [];
  const knownMemoryIds = new Set([...records.keys(), ...request.proposedUpdates.filter(c => c.action === 'CREATE').map(c => c.proposedRecord!.id)]);
  for (const item of proposedEvidence) {
    if (evidence.has(item.id)) return finalizeFailure(request.lifecycleId, issue('proposedEvidence', 'DUPLICATE_ID', 'Evidence ID already exists.'));
    if (item.collectedBy !== request.proposer.id) return finalizeFailure(request.lifecycleId, issue('proposedEvidence', 'PROPOSER_MISMATCH', 'Evidence collector must match the proposer.'));
    if (item.type === 'OWNER_INSTRUCTION' && request.proposer.type !== 'OWNER') return finalizeFailure(request.lifecycleId, issue('proposedEvidence', 'OWNER_EVIDENCE_REQUIRED', 'Only an owner may submit owner evidence.'));
    if (!request.proposedUpdates.some(c => c.evidence.includes(item.id))) return finalizeFailure(request.lifecycleId, issue('proposedEvidence', 'UNUSED_EVIDENCE', 'Proposed evidence must be referenced by a proposal.'));
    if (item.memoryIds.some(id => !knownMemoryIds.has(id))) return finalizeFailure(request.lifecycleId, issue('proposedEvidence', 'UNKNOWN_MEMORY', 'Evidence references an unknown memory.'));
    evidence.set(item.id, item);
  }
  const dispositions = request.proposedUpdates.map((candidate, index) => classifyCandidate(candidate, index, request.proposer, records, evidence));
  // Preflight the same canonical boundary used for writes, with the validated union of evidence.
  // Reject the whole bundle before journal/canonical mutation if any candidate is invalid.
  for (let i = 0; i < request.proposedUpdates.length; i++) {
    const candidate = request.proposedUpdates[i]!;
    const disposition = dispositions[i]!;
    if (disposition.disposition === 'REJECTED') return { ...finalizeFailure(request.lifecycleId, issue('proposedUpdates', disposition.reasonCode, disposition.explanation)), dispositions: dispositions.map(d => d.disposition === 'APPLIED' ? { ...d, disposition: 'REJECTED' as const, reasonCode: 'INVALID_CANDIDATE' as const, explanation: 'The bundle contains an invalid proposal; nothing was applied.' } : d) };
    const references = candidate.proposedRecord?.relationships;
    if ((references?.supportedBy ?? []).some(id => !evidence.has(id))) return finalizeFailure(request.lifecycleId, issue('proposedUpdates', 'UNKNOWN_EVIDENCE', 'A supporting evidence reference does not exist.'));
    if ((references?.supportedBy ?? []).some(id => { const item = evidence.get(id)!; return item.relationship !== 'SUPPORTS' || !item.memoryIds.includes(candidate.proposedRecord!.id); })) return finalizeFailure(request.lifecycleId, issue('proposedUpdates', 'RELATIONSHIP_MISMATCH', 'Supporting evidence must support this memory.'));
    if ([references?.supersedes, references?.supersededBy, ...(references?.conflictsWith ?? []), ...(references?.relatedTo ?? [])].some(id => id !== undefined && !knownMemoryIds.has(id))) return finalizeFailure(request.lifecycleId, issue('proposedUpdates', 'UNKNOWN_MEMORY', 'A memory relationship does not exist.'));
    if (disposition.disposition === 'APPLIED') {
      const preview = await previewUpdateCandidate(absProjectDir, candidate, () => timestamp, [...evidence.values()]);
      if (!preview.success) return finalizeFailures(request.lifecycleId, preview.errors);
    }
  }
  // Evidence is retained only for applied proposals. A held owner proposal cannot leave evidence
  // that changes an existing memory's audit result or independently certifies authority.
  const evidenceToWrite = proposedEvidence.filter(item => request.proposedUpdates.some((c, i) => dispositions[i]!.disposition === 'APPLIED' && c.evidence.includes(item.id)));
  const appliedIds = new Set(dispositions.filter(d => d.disposition === 'APPLIED').map(d => d.memoryId));
  const retainedIds = new Set([...records.keys(), ...appliedIds]);
  if (request.proposedUpdates.some((c, i) => dispositions[i]!.disposition === 'APPLIED' && [c.proposedRecord?.relationships.supersedes, ...(c.proposedRecord?.relationships.relatedTo ?? []), ...(c.proposedRecord?.relationships.conflictsWith ?? [])].some(id => id !== undefined && !retainedIds.has(id)))) return finalizeFailure(request.lifecycleId, issue('proposedUpdates', 'HELD_REFERENCE', 'Applied memory cannot reference a held new memory.'));
  if (evidenceToWrite.some(item => item.memoryIds.some(id => !appliedIds.has(id)))) return finalizeFailure(request.lifecycleId, issue('proposedEvidence', 'HELD_REFERENCE', 'Applied evidence may reference only applied proposal targets.'));


  let journal: LifecycleMetadata = {
    ...metadata,
    status: 'FINALIZING',
    updatedAt: timestamp,
    finalization: { fingerprint, proposer: request.proposer, startedAt: timestamp, dispositions, evidenceIds: evidenceToWrite.map(e => e.id) },
  };
  try {
    await hooks.beforeMetadataWrite?.(journal);
    await writeLifecycleMetadata(lifecyclePath, journal);
  } catch {
    return finalizeFailure(request.lifecycleId, issue('', 'WRITE_FAILED', 'Unable to create the finalization recovery journal; no proposal was applied.'));
  }
  // Evidence first: interruption can leave orphan evidence, never a verified memory without it.
  // The journal contains every intended evidence ID before the first evidence write.
  try {
    for (const item of evidenceToWrite) {
      await hooks.beforeEvidenceWrite?.(item);
      const destination = join(storagePath, 'evidence', `${item.id}.json`);
      const safety = await verifyPathSafety(destination, absProjectDir);
      if (!safety.safe) throw new Error('Unsafe evidence destination.');
      await mkdir(join(storagePath, 'evidence'), { recursive: true });
      await atomicWriteJson(destination, item, { allowOverwrite: false });
    }
  } catch {
    await markLifecycleFailed(lifecyclePath, journal, timestamp, 'EVIDENCE_WRITE_FAILED');
    return finalizeFailure(request.lifecycleId, issue('', 'RECOVERY_REQUIRED', 'Evidence persistence was interrupted. Inspect journal evidence IDs and canonical storage; automatic replay is blocked.'));
  }
  for (let index = 0; index < dispositions.length; index += 1) {
    const disposition = dispositions[index];
    if (disposition?.disposition !== 'APPLIED') continue;
    let mutation;
    try {
      await hooks.beforeMutation?.(request.proposedUpdates[index]!, index);
      mutation = await applyUpdateCandidate(absProjectDir, request.proposedUpdates[index]!, () => timestamp);
    } catch {
      await markLifecycleFailed(lifecyclePath, journal, timestamp, 'MUTATION_FAILED');
      return finalizeFailure(request.lifecycleId, issue('', 'RECOVERY_REQUIRED', 'A controlled mutation was interrupted. Inspect the finalization journal and canonical storage before recovery.'));
    }
    if (!mutation.success) {
      await markLifecycleFailed(lifecyclePath, journal, timestamp, 'MUTATION_FAILED');
      return finalizeFailure(request.lifecycleId, issue('', 'RECOVERY_REQUIRED', 'Canonical mutation failed after preflight. Inspect journal and storage before recovery.'));
    }
    dispositions[index] = { ...disposition, storageChanged: true };
    journal = { ...journal, updatedAt: timestamp, finalization: { ...journal.finalization!, dispositions: [...dispositions] } };
    try {
      await hooks.beforeMetadataWrite?.(journal);
      await writeLifecycleMetadata(lifecyclePath, journal);
    } catch {
      await markLifecycleFailed(lifecyclePath, journal, timestamp, 'JOURNAL_WRITE_FAILED');
      return finalizeFailure(request.lifecycleId, issue('', 'RECOVERY_REQUIRED', 'A mutation completed but its lifecycle journal could not be updated. Inspect canonical storage and recover explicitly.'));
    }
  }

  const finalizeAuditId = lifecycleAuditId(request.lifecycleId, 'finalize');
  const finalizedDispositions = dispositions.map((item) => ({ ...item, auditReferences: [finalizeAuditId] }));
  const hasHeld = finalizedDispositions.some((item) => item.disposition === 'HELD_FOR_OWNER');
  const completedAt = timestamp;
  const auditedJournal: LifecycleMetadata = {
    ...journal,
    auditReferences: [...journal.auditReferences, finalizeAuditId],
    finalization: { ...journal.finalization!, dispositions: finalizedDispositions },
  };
  const completed: LifecycleMetadata = {
    ...auditedJournal,
    status: hasHeld ? 'COMPLETED_WITH_HELD_ITEMS' : 'COMPLETED',
    updatedAt: completedAt,
    finalization: { ...auditedJournal.finalization!, completedAt },
  };
  const event = lifecycleFinalizeAudit(request.lifecycleId, completed, finalizeAuditId, timestamp);
  try {
    await hooks.beforeAuditAppend?.([event]);
    await appendValidatedAuditEvents(absProjectDir, [event]);
  } catch {
    await markLifecycleFailed(lifecyclePath, journal, timestamp, 'FINALIZE_AUDIT_FAILED');
    return finalizeFailure(request.lifecycleId, issue('', 'RECOVERY_REQUIRED', 'Finalization audit persistence failed. Inspect controlled storage before recovery.'));
  }
  try {
    await hooks.beforeMetadataWrite?.(completed);
    await writeLifecycleMetadata(lifecyclePath, completed);
  } catch {
    await markLifecycleFailed(lifecyclePath, auditedJournal, timestamp, 'TERMINAL_JOURNAL_FAILED');
    return finalizeFailure(request.lifecycleId, issue('', 'RECOVERY_REQUIRED', 'The final audit was persisted but the terminal journal was not. The failed journal contains its safe audit reference for explicit recovery.'));
  }
  return resultFromMetadata(completed, false);
}
function classifyCandidate(
  candidate: UpdateCandidate,
  index: number,
  proposer: LifecycleProposer,
  records: ReadonlyMap<string, MemoryRecord>,
  evidence: ReadonlyMap<string, EvidenceRecord>,
): LifecycleDispositionRecord {
  const memoryId = candidate.memoryId ?? candidate.proposedRecord?.id ?? null;
  const base = { proposalIndex: index, action: candidate.action, memoryId } as const;
  const validation = validateUpdateCandidate(candidate);
  if (!validation.valid) return rejected(base, 'INVALID_CANDIDATE', 'The proposal failed strict update-candidate validation.', ['DM-RULE-LIFE-VALIDATE-001']);
  if (candidate.proposedBy !== proposer.id) return rejected(base, 'INSUFFICIENT_AUTHORITY', 'The candidate proposer does not match the declared lifecycle proposer.', ['DM-RULE-LIFE-PROPOSER-001']);

  const missingEvidence = candidate.evidence.filter((id) => !evidence.has(id));
  if (missingEvidence.length > 0) return rejected(base, 'MISSING_ARTIFACT', 'One or more referenced evidence artifacts are unavailable.', ['DM-RULE-LIFE-EVIDENCE-001']);
  const target = candidate.memoryId ? records.get(candidate.memoryId) : undefined;
  if (candidate.action === 'CREATE' && candidate.proposedRecord && records.has(candidate.proposedRecord.id)) {
    return rejected(base, 'STALE_UPDATE', 'The proposed memory ID already exists.', ['DM-RULE-LIFE-CONCURRENCY-001']);
  }
  if (candidate.action !== 'CREATE' && !target) return rejected(base, 'MISSING_ARTIFACT', 'The target memory does not exist.', ['DM-RULE-LIFE-CONCURRENCY-001']);
  if (candidate.action === 'UPDATE' && target && candidate.proposedRecord) {
    if (candidate.proposedRecord.createdAt !== target.createdAt || candidate.proposedRecord.updatedAt !== target.updatedAt) {
      return rejected(base, 'STALE_UPDATE', 'The proposal does not match the current canonical record version.', ['DM-RULE-LIFE-CONCURRENCY-001']);
    }
    if (sameRecord(candidate.proposedRecord, target)) return noChange(base, 'The proposal is identical to canonical state.');
  }
  if (candidate.action === 'REVOKE' && target?.verificationStatus === 'REVOKED') return noChange(base, 'The target is already revoked.');
  if (candidate.action === 'REDACT' && target && isRedactedText(target.statement)) return noChange(base, 'The target is already privacy-redacted.');

  const candidateEvidence = candidate.evidence.map((id) => evidence.get(id) as EvidenceRecord);
  const ownerEvidence = candidateEvidence.some((item) => item.type === 'OWNER_INSTRUCTION' && item.relationship === 'SUPPORTS' && (!memoryId || item.memoryIds.includes(memoryId)));
  const ownerAuthorized = proposer.type === 'OWNER' && candidate.authorityLevel === 'OWNER_CONFIRMED' && ownerEvidence;
  const proposed = candidate.proposedRecord;
  const ownerBoundary = candidate.requiresOwnerApproval
    || candidate.authorityLevel === 'OWNER_CONFIRMED'
    || proposed?.verificationStatus === 'OWNER_CONFIRMED'
    || target?.verificationStatus === 'OWNER_CONFIRMED'
    || concernsOwnerPolicy(candidate);
  if (ownerBoundary && !ownerAuthorized) {
    return held(base, 'Owner confirmation and matching owner evidence are required at this policy or authority boundary.');
  }

  if (candidate.authorityLevel === 'UNKNOWN' || candidate.authorityLevel === 'CONFLICTED' || candidate.authorityLevel === 'REVOKED') {
    return rejected(base, 'INSUFFICIENT_AUTHORITY', 'The proposal authority cannot authorize an automatic mutation.', ['DM-RULE-LIFE-AUTH-001']);
  }
  if (target && candidate.action !== 'REDACT' && !AUTHORITY_ALLOWED[candidate.authorityLevel].includes(target.verificationStatus)) {
    return rejected(base, 'INSUFFICIENT_AUTHORITY', 'The proposal authority cannot change the target authority level.', ['DM-RULE-LIFE-AUTH-002']);
  }
  if (proposed && !AUTHORITY_ALLOWED[candidate.authorityLevel].includes(proposed.verificationStatus)) {
    return rejected(base, 'INSUFFICIENT_AUTHORITY', 'The proposal attempts an authority escalation.', ['DM-RULE-LIFE-AUTH-003']);
  }
  if (proposed && !hasIndependentEvidence(proposed.verificationStatus, proposed, candidateEvidence)) {
    return rejected(base, 'INSUFFICIENT_AUTHORITY', 'The proposed verification status lacks independent supporting evidence.', ['DM-RULE-LIFE-EVIDENCE-002']);
  }
  if (proposed) {
    const scan = scanMemoryRecord(proposed);
    if (scan.secretLike) return rejected(base, 'PRIVACY_REDACTION', 'Secret-like content cannot be retained automatically.', ['DM-RULE-PRIV-001']);
    const restricted = proposed.sensitivity === 'SENSITIVE' || proposed.sensitivity === 'SECRET' || proposed.actionPermission === 'FORGET_OR_REDACT';
    if (restricted && (!isRedactedText(proposed.statement) || !isRedactedText(proposed.source.reference) || proposed.tags.some((tag) => tag.toLowerCase() !== 'redacted'))) {
      return rejected(base, 'PRIVACY_REDACTION', 'Restricted content may retain only explicitly redacted fields and the safe redacted tag.', ['DM-RULE-PRIV-001']);
    }
  }
  return {
    ...base,
    disposition: 'APPLIED', reasonCode: 'AUTHORIZED',
    explanation: 'The proposal passed lifecycle policy checks and is eligible for the canonical mutation boundary.',
    triggeredRules: ['DM-RULE-LIFE-AUTH-001', 'DM-RULE-LIFE-EVIDENCE-002'], storageChanged: false,
    auditReferences: [], recommendedAction: 'Audit the resulting canonical memory before relying on it.',
  };
}
function hasIndependentEvidence(status: VerificationStatus, record: MemoryRecord, evidence: readonly EvidenceRecord[]): boolean {
  if (status === 'UNKNOWN' || status === 'CONFLICTED') return true;
  const expected: Partial<Record<VerificationStatus, readonly EvidenceRecord['type'][]>> = {
    OWNER_CONFIRMED: ['OWNER_INSTRUCTION'], REPO_VERIFIED: ['REPOSITORY_STATE'], TEST_VERIFIED: ['TEST_RESULT'],
    OBSERVED: ['AGENT_OBSERVATION'], INFERRED: ['AGENT_OBSERVATION', 'DOCUMENT_REFERENCE', 'CONVERSATION_RECORD'],
  };
  const allowed = expected[status];
  if (!allowed) return false;
  return evidence.some((item) => item.relationship === 'SUPPORTS'
    && item.memoryIds.includes(record.id)
    && allowed.includes(item.type)
    && !isGeneratedEvidence(item));
}

function isGeneratedEvidence(item: EvidenceRecord): boolean {
  const text = `${item.source} ${item.content}`.toLowerCase();
  return GENERATED_EVIDENCE_MARKERS.some((marker) => text.includes(marker));
}

function concernsOwnerPolicy(candidate: UpdateCandidate): boolean {
  const text = [candidate.reason, candidate.proposedRecord?.statement ?? '', ...(candidate.proposedRecord?.tags ?? [])].join(' ').toLowerCase();
  return OWNER_POLICY_TERMS.some((term) => text.includes(term));
}

function sameRecord(left: MemoryRecord, right: MemoryRecord): boolean {
  return stableStringify(left) === stableStringify(right);
}

type DispositionBase = Pick<LifecycleDispositionRecord, 'proposalIndex' | 'action' | 'memoryId'>;

function held(base: DispositionBase, explanation: string): LifecycleDispositionRecord {
  return { ...base, disposition: 'HELD_FOR_OWNER', reasonCode: 'OWNER_CONFIRMATION_REQUIRED', explanation,
    triggeredRules: ['DM-RULE-LIFE-OWNER-001'], storageChanged: false, auditReferences: [],
    recommendedAction: 'Ask the owner to confirm this specific proposal with explicit supporting evidence.' };
}
function rejected(base: DispositionBase, reasonCode: LifecycleDispositionRecord['reasonCode'], explanation: string, rules: readonly string[]): LifecycleDispositionRecord {
  return { ...base, disposition: 'REJECTED', reasonCode, explanation, triggeredRules: rules,
    storageChanged: false, auditReferences: [], recommendedAction: 'Correct the proposal or its evidence, then begin a new lifecycle.' };
}
function noChange(base: DispositionBase, explanation: string): LifecycleDispositionRecord {
  return { ...base, disposition: 'NO_CHANGE', reasonCode: 'NO_MATERIAL_CHANGE', explanation,
    triggeredRules: ['DM-RULE-LIFE-IDEMPOTENCY-001'], storageChanged: false, auditReferences: [],
    recommendedAction: 'No canonical storage change is needed.' };
}
function lifecycleFinalizeAudit(lifecycleId: string, metadata: LifecycleMetadata, eventId: string, timestamp: string): AuditEvent {
  const dispositions = metadata.finalization?.dispositions ?? [];
  return { schemaVersion: CURRENT_SCHEMA_VERSION, eventId, timestamp, memoryId: lifecycleId,
    outcome: dispositions.some((item) => item.disposition === 'HELD_FOR_OWNER') ? 'ASK_OWNER' : 'RECHECK',
    triggeredRules: ['DM-RULE-LIFE-FINALIZE-001'], evidenceExamined: [],
    explanation: `Lifecycle finalization recorded ${dispositions.length} privacy-safe disposition(s).`,
    permissionConsequence: 'Only explicitly authorized proposals changed canonical storage; held and rejected items did not.',
    recommendedAction: 'Review held items with the owner and audit applied memories before reliance.',
    auditor: ENGINE_AUDITOR, engineVersion: ENGINE_VERSION };
}

function lifecycleFilePath(projectDir: string, id: string): string {
  return join(projectDir, STORAGE_DIR, 'episodes', `${id}.json`);
}
async function pathExists(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile(); } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
async function readLifecycleMetadata(path: string, expectedLifecycleId: string): Promise<{ success: true; metadata: LifecycleMetadata } | { success: false; error: ValidationIssue }> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > 1_048_576) return { success: false, error: issue('', 'INVALID_ARTIFACT', 'Lifecycle metadata must be a regular file no larger than 1 MiB.') };
    const value: unknown = JSON.parse(await readFile(path, 'utf8'));
    const validation = validateLifecycleMetadata(value);
    if (!validation.valid) return { success: false, error: issue('', 'INVALID_ARTIFACT', 'Lifecycle metadata failed strict validation and was preserved.') };
    if ((value as LifecycleMetadata).lifecycleId !== expectedLifecycleId) return { success: false, error: issue('lifecycleId', 'INVALID_ARTIFACT', 'Lifecycle metadata identity does not match its controlled filename.') };
    return { success: true, metadata: value as LifecycleMetadata };
  } catch (error: unknown) {
    const missing = error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
    return { success: false, error: issue('lifecycleId', missing ? 'NOT_FOUND' : 'READ_FAILED', missing ? 'The lifecycle does not exist.' : 'Lifecycle metadata could not be read safely.') };
  }
}
async function writeLifecycleMetadata(path: string, metadata: LifecycleMetadata): Promise<void> {
  const validation = validateLifecycleMetadata(metadata);
  if (!validation.valid) throw new Error('Lifecycle metadata failed internal validation.');
  await atomicWriteJson(path, metadata, { allowOverwrite: true });
}
async function markLifecycleFailed(path: string, metadata: LifecycleMetadata, timestamp: string, code: string): Promise<void> {
  const failed: LifecycleMetadata = { ...metadata, status: 'FAILED', updatedAt: timestamp, failureCode: code,
    recoveryGuidance: 'Inspect the privacy-safe finalization journal and canonical storage; perform controlled manual recovery before another mutation.' };
  try { await writeLifecycleMetadata(path, failed); } catch { /* preserve the last durable journal */ }
}
function hashFinalization(input: LifecycleFinalizationInput): string {
  return createHash('sha256').update(stableStringify(input), 'utf8').digest('hex');
}
function lifecycleAuditId(lifecycleId: string, phase: 'begin' | 'finalize'): string {
  const digest = createHash('sha256').update(lifecycleId, 'utf8').digest('hex').slice(0, 32);
  return `evt-life-${digest}-${phase}`;
}
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort(compareOrdinal).map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function collectStrings(value: unknown, seen = new Set<object>()): string[] {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item, seen));
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => [key, ...collectStrings(item, seen)]);
}
function resultFromMetadata(metadata: LifecycleMetadata, alreadyFinalized: boolean): LifecycleFinalizeResult {
  const dispositions = metadata.finalization?.dispositions ?? [];
  return { success: true, lifecycleId: metadata.lifecycleId, status: metadata.status, dispositions,
    storageChanged: dispositions.some((item) => item.storageChanged), auditReferences: metadata.auditReferences,
    recommendedAction: dispositions.some((item) => item.disposition === 'HELD_FOR_OWNER')
      ? 'Ask the owner to review held proposals; do not apply them automatically.'
      : 'Audit applied memories before relying on them.',
    completedAt: metadata.finalization?.completedAt ?? null, alreadyFinalized, errors: [] };
}
function beginFailure(error: ValidationIssue): LifecycleBeginResult {
  return { success: false, lifecycleId: null, status: null, openedAt: null, contextPack: null, auditReferences: [], errors: [error] };
}
function finalizeFailure(lifecycleId: string | null, error: ValidationIssue): LifecycleFinalizeResult {
  return finalizeFailures(lifecycleId, [error]);
}
function finalizeFailures(lifecycleId: string | null, errors: readonly ValidationIssue[]): LifecycleFinalizeResult {
  return { success: false, lifecycleId, status: null, dispositions: [], storageChanged: false,
    auditReferences: [], recommendedAction: 'Correct the reported validation or recovery condition before retrying.',
    completedAt: null, alreadyFinalized: false, errors };
}
function issue(field: string, code: string, message: string): ValidationIssue { return { field, code, message }; }
function safeJoinedErrors(errors: readonly string[]): string {
  return `${errors.length} controlled artifact error(s) prevented the operation; raw artifact content was not echoed.`;
}
function compareOrdinal(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }

export function formatLifecycleBeginAsMarkdown(result: LifecycleBeginResult): string {
  if (!result.success || !result.contextPack) return `# Lifecycle begin failed\n\n${result.errors.map((item) => `- ${item.code}: ${item.message}`).join('\n')}\n`;
  return `# Lifecycle ${result.lifecycleId}\n\nStatus: ${result.status}\n\n${formatContextAsMarkdown(result.contextPack)}`;
}
export function formatLifecycleFinalizeAsMarkdown(result: LifecycleFinalizeResult): string {
  if (!result.success) return `# Lifecycle finalization failed\n\n${result.errors.map((item) => `- ${item.code}: ${item.message}`).join('\n')}\n`;
  const rows = result.dispositions.map((item) => `- Proposal ${item.proposalIndex + 1}: ${item.disposition} (${item.reasonCode}) - ${item.explanation}`);
  return `# Lifecycle ${result.lifecycleId} finalization\n\nStatus: ${result.status}\n\n${rows.length > 0 ? rows.join('\n') : '- No proposals submitted.'}\n\nRecommended action: ${result.recommendedAction}\n`;
}
