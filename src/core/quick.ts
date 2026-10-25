/**
 * Tamhees — everyday memory operations.
 *
 * Thin, safe builders over the canonical mutation boundary so a person or agent can
 * remember, forget, revoke and inspect memory without hand-writing update-candidate
 * JSON. Every write still goes through applyUpdateCandidate(), so schema, authority,
 * privacy, archive and audit-history rules are enforced exactly as for `memory apply`.
 * Inspection is read-only: it never appends audit events.
 */

import { auditRecord } from './audit.js';
import { loadAllEvidence } from './evidence.js';
import { applyUpdateCandidate, previewUpdateCandidate } from './mutations.js';
import { memoryForOutput } from './privacy.js';
import { loadAllRecords } from './store.js';
import { normalizeLegacyMemory } from './scope.js';
import {
  CURRENT_SCHEMA_VERSION,
  type ActionPermission,
  type AuditOutcome,
  type Clock,
  type Confidence,
  type EvidenceRecord,
  type MemoryKind,
  type MemoryRecord,
  type MemoryScope,
  type MutationResult,
  type SourceType,
  type TaskScope,
  type UpdateCandidate,
  type VerificationStatus,
} from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MEMORY_ID_PATTERN = /^DM-MEM-(\d{6})$/;
export const DEFAULT_PROPOSER = 'tamhees-cli';

/** How the remembered fact is known. Owner confirmation is deliberately not offered here. */
export const REMEMBER_BASES = ['inferred', 'observed', 'repo', 'test', 'unknown'] as const;
export type RememberBasis = (typeof REMEMBER_BASES)[number];

interface BasisProfile {
  readonly status: VerificationStatus;
  readonly sourceType: SourceType;
  readonly kind: MemoryKind;
  readonly permission: ActionPermission;
  readonly reviewInDays: number;
  readonly recheck: (reference: string) => string;
}

// Defaults follow the authority model: guesses must be confirmed before they guide
// change, observations need caution, verified repository/test facts may act.
const BASIS: Readonly<Record<RememberBasis, BasisProfile>> = {
  inferred: {
    status: 'INFERRED', sourceType: 'AGENT_INFERENCE', kind: 'ASSUMPTION',
    permission: 'ASK_BEFORE_CHANGE', reviewInDays: 30,
    recheck: () => 'Ask the owner to confirm or correct this inference.',
  },
  observed: {
    status: 'OBSERVED', sourceType: 'AGENT_OBSERVATION', kind: 'OBSERVATION',
    permission: 'ACT_WITH_CAUTION', reviewInDays: 90,
    recheck: (reference) => `Observe ${reference} again.`,
  },
  repo: {
    status: 'REPO_VERIFIED', sourceType: 'REPOSITORY_STATE', kind: 'OBSERVATION',
    permission: 'MAY_ACT', reviewInDays: 180,
    recheck: (reference) => `Re-inspect ${reference} in the repository.`,
  },
  test: {
    status: 'TEST_VERIFIED', sourceType: 'TEST_RESULT', kind: 'OBSERVATION',
    permission: 'MAY_ACT', reviewInDays: 180,
    recheck: (reference) => `Re-run ${reference}.`,
  },
  unknown: {
    status: 'UNKNOWN', sourceType: 'CONVERSATION_RECORD', kind: 'ASSUMPTION',
    permission: 'ASK_BEFORE_CHANGE', reviewInDays: 30,
    recheck: () => 'Find a verifiable source for this statement.',
  },
};

export interface RememberOptions {
  readonly statement: string;
  readonly basis?: RememberBasis | undefined;
  readonly sourceReference?: string | undefined;
  readonly kind?: MemoryKind | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly confidence?: Confidence | undefined;
  readonly permission?: ActionPermission | undefined;
  readonly sensitivity?: 'PUBLIC' | 'INTERNAL' | undefined;
  readonly reviewInDays?: number | undefined;
  readonly expiresInDays?: number | undefined;
  readonly scope?: TaskScope | undefined;
  readonly recheckMethod?: string | undefined;
  readonly id?: string | undefined;
  readonly proposer?: string | undefined;
}

export function nextMemoryId(existingIds: Iterable<string>): string {
  let highest = 0;
  for (const id of existingIds) {
    const match = MEMORY_ID_PATTERN.exec(id);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `DM-MEM-${String(highest + 1).padStart(6, '0')}`;
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString();
}

function uniqueTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.normalize('NFKC').trim().toLowerCase();
    if (tag !== '' && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

export function buildRememberCandidate(
  options: RememberOptions,
  existingIds: Iterable<string>,
  now: string,
): UpdateCandidate {
  const basis = BASIS[options.basis ?? 'inferred'];
  const reference = options.sourceReference ?? `${DEFAULT_PROPOSER} remember`;
  const reviewInDays = options.reviewInDays ?? basis.reviewInDays;
  const scope: MemoryScope = options.scope && Object.values(options.scope).some((value) => value !== undefined)
    ? { kind: 'RESTRICTED', ...options.scope }
    : { kind: 'PROJECT' };
  const record: MemoryRecord = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: options.id ?? nextMemoryId(existingIds),
    scope,
    kind: options.kind ?? basis.kind,
    statement: options.statement.trim(),
    source: basis.sourceType === 'AGENT_INFERENCE' || basis.sourceType === 'AGENT_OBSERVATION'
      ? { type: basis.sourceType, reference, agent: options.proposer ?? DEFAULT_PROPOSER }
      : { type: basis.sourceType, reference },
    verificationStatus: basis.status,
    confidence: options.confidence ?? 'MEDIUM',
    freshness: {
      lastVerified: now,
      ...(reviewInDays > 0 ? { reviewAfter: addDays(now, reviewInDays) } : {}),
      ...(options.expiresInDays !== undefined ? { expiresAfter: addDays(now, options.expiresInDays) } : {}),
    },
    sensitivity: options.sensitivity ?? 'INTERNAL',
    actionPermission: options.permission ?? basis.permission,
    relationships: {},
    tags: uniqueTags(options.tags ?? []),
    recheckMethod: options.recheckMethod ?? basis.recheck(reference),
    createdAt: now,
    updatedAt: now,
  };
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    action: 'CREATE',
    proposedRecord: record,
    evidence: [],
    proposedBy: options.proposer ?? DEFAULT_PROPOSER,
    authorityLevel: basis.status,
    requiresOwnerApproval: false,
    reason: 'Remember a new claim with explicit provenance and freshness.',
    timestamp: now,
  };
}

export async function rememberMemory(
  projectDir: string,
  options: RememberOptions,
  clock: Clock,
  dryRun = false,
): Promise<MutationResult & { readonly candidate: UpdateCandidate | null }> {
  const loaded = await loadAllRecords(projectDir);
  if (loaded.errors.length > 0) {
    return loadFailure('CREATE', loaded.errors);
  }
  const candidate = buildRememberCandidate(options, loaded.records.map((record) => record.id), clock());
  if (dryRun) {
    const evidence = await loadAllEvidence(projectDir);
    const preview = await previewUpdateCandidate(projectDir, candidate, clock, evidence.evidence);
    return { ...preview, candidate };
  }
  return { ...(await applyUpdateCandidate(projectDir, candidate, clock)), candidate };
}

export interface RemovalOptions {
  readonly reason?: string | undefined;
  readonly asOwner?: boolean | undefined;
  readonly proposer?: string | undefined;
}

export function buildForgetCandidate(memoryId: string, options: RemovalOptions, now: string): UpdateCandidate {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    action: 'REDACT',
    memoryId,
    evidence: [],
    proposedBy: options.proposer ?? DEFAULT_PROPOSER,
    authorityLevel: options.asOwner ? 'OWNER_CONFIRMED' : 'OBSERVED',
    requiresOwnerApproval: options.asOwner === true,
    reason: options.reason ?? 'The owner asked for this memory to be forgotten.',
    timestamp: now,
  };
}

export function buildRevokeCandidate(
  target: MemoryRecord,
  options: RemovalOptions,
  now: string,
): UpdateCandidate {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    action: 'REVOKE',
    memoryId: target.id,
    evidence: [],
    proposedBy: options.proposer ?? DEFAULT_PROPOSER,
    authorityLevel: options.asOwner ? 'OWNER_CONFIRMED' : target.verificationStatus,
    requiresOwnerApproval: options.asOwner === true,
    reason: options.reason ?? 'This memory is no longer valid.',
    timestamp: now,
  };
}

export async function forgetMemory(
  projectDir: string,
  memoryId: string,
  options: RemovalOptions,
  clock: Clock,
): Promise<MutationResult> {
  return applyUpdateCandidate(projectDir, buildForgetCandidate(memoryId, options, clock()), clock);
}

export async function revokeMemory(
  projectDir: string,
  memoryId: string,
  options: RemovalOptions,
  clock: Clock,
): Promise<MutationResult> {
  const loaded = await loadAllRecords(projectDir);
  if (loaded.errors.length > 0) return loadFailure('REVOKE', loaded.errors);
  const target = loaded.records.find((record) => record.id === memoryId);
  if (target === undefined) {
    return {
      success: false, action: 'REVOKE', memoryId, record: null, archivePath: null,
      errors: [{ field: 'memoryId', code: 'UNKNOWN_MEMORY', message: `Memory not found: ${memoryId}.` }],
    };
  }
  return applyUpdateCandidate(projectDir, buildRevokeCandidate(target, options, clock()), clock);
}

function loadFailure(action: UpdateCandidate['action'], errors: readonly string[]) {
  return {
    success: false, action, memoryId: null, record: null, archivePath: null, candidate: null,
    errors: errors.map((message) => ({ field: 'store', code: 'STORE_INVALID', message })),
  } as const;
}

// ─── Inspection ("what do you remember, and how sure are you?") ─────────────

export type FreshnessState = 'CURRENT' | 'REVIEW_DUE' | 'CONDITIONAL' | 'EXPIRED';

export interface InspectedEvidence {
  readonly id: string;
  readonly type: EvidenceRecord['type'];
  readonly relationship: EvidenceRecord['relationship'];
  readonly source: string;
}

export interface InspectedMemory {
  readonly id: string;
  readonly statement: string;
  readonly kind: MemoryKind;
  readonly source: { readonly type: SourceType; readonly reference: string };
  readonly verificationStatus: VerificationStatus;
  readonly confidence: Confidence;
  readonly freshness: {
    readonly state: FreshnessState;
    readonly ageDays: number;
    readonly lastVerified: string;
    readonly reviewAfter?: string | undefined;
    readonly expiresAfter?: string | undefined;
  };
  readonly scope: MemoryScope;
  readonly sensitivity: MemoryRecord['sensitivity'];
  readonly actionPermission: ActionPermission;
  readonly tags: readonly string[];
  readonly outcome: AuditOutcome;
  readonly ruleId: string;
  readonly explanation: string;
  readonly nextStep: string;
  /** Whether retrieval may serve it to an agent when it is relevant and in scope. */
  readonly servable: boolean;
  /** True for a privacy tombstone left by a controlled REDACT ("forget"). */
  readonly forgotten: boolean;
  readonly evidence: readonly InspectedEvidence[];
}

export interface InspectionReport {
  readonly generatedAt: string;
  readonly total: number;
  readonly byOutcome: Readonly<Record<AuditOutcome, number>>;
  readonly memories: readonly InspectedMemory[];
}

function day(iso: string | undefined): string {
  return iso !== undefined && Number.isFinite(Date.parse(iso)) ? iso.slice(0, 10) : 'an earlier date';
}

function freshnessState(record: MemoryRecord, now: string): InspectedMemory['freshness'] {
  const nowMs = Date.parse(now);
  const lastMs = Date.parse(record.freshness.lastVerified);
  const ageDays = Number.isFinite(nowMs) && Number.isFinite(lastMs)
    ? Math.max(0, Math.floor((nowMs - lastMs) / DAY_MS))
    : 0;
  const { reviewAfter, expiresAfter } = record.freshness;
  let state: FreshnessState = 'CURRENT';
  const expiresMs = expiresAfter === undefined ? Number.NaN : Date.parse(expiresAfter);
  if (Number.isFinite(expiresMs) && expiresMs <= nowMs) {
    state = 'EXPIRED';
  } else if (reviewAfter !== undefined) {
    const reviewMs = Date.parse(reviewAfter);
    if (!Number.isFinite(reviewMs)) state = 'CONDITIONAL';
    else if (reviewMs <= nowMs) state = 'REVIEW_DUE';
  }
  return {
    state,
    ageDays,
    lastVerified: record.freshness.lastVerified,
    ...(reviewAfter !== undefined ? { reviewAfter } : {}),
    ...(expiresAfter !== undefined ? { expiresAfter } : {}),
  };
}

/** A controlled REDACT leaves exactly this tombstone shape (see mutations.ts). */
export function isForgottenTombstone(record: MemoryRecord): boolean {
  return record.actionPermission === 'FORGET_OR_REDACT'
    && record.verificationStatus === 'REVOKED'
    && record.source.type === 'SYSTEM_OBSERVATION'
    && record.source.reference === '[REDACTED]'
    && record.statement.startsWith('[REDACTED');
}

/**
 * Mirrors the eligibility gates of compileContext() (privacy, revocation, audit
 * conflict/block, expiry). Relevance, scope and budget are task-specific and are
 * therefore not part of this per-memory answer.
 */
export function isServable(record: MemoryRecord, evidence: readonly EvidenceRecord[], now: string): boolean {
  const normalized = normalizeLegacyMemory(record);
  if (normalized.sensitivity === 'SECRET' || normalized.actionPermission === 'FORGET_OR_REDACT') return false;
  if (normalized.verificationStatus === 'REVOKED' || normalized.relationships.supersededBy !== undefined) return false;
  const finding = auditRecord(normalized, evidence, now);
  const outcome = finding?.outcome ?? 'TRUST';
  if (outcome === 'FORGET_OR_REDACT' || outcome === 'BLOCK_ACTION') return false;
  if (finding?.ruleId === 'DM-RULE-FRESH-001') return false;
  return freshnessState(normalized, now).state !== 'EXPIRED';
}

export function inspectRecords(
  records: readonly MemoryRecord[],
  evidence: readonly EvidenceRecord[],
  now: string,
): InspectionReport {
  const byOutcome: Record<AuditOutcome, number> = {
    TRUST: 0, RECHECK: 0, ASK_OWNER: 0, BLOCK_ACTION: 0, FORGET_OR_REDACT: 0,
  };
  const memories = [...records]
    .map(normalizeLegacyMemory)
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map((record): InspectedMemory => {
      const safe = memoryForOutput(record);
      const finding = auditRecord(record, evidence, now);
      const outcome = finding?.outcome ?? 'TRUST';
      byOutcome[outcome] += 1;
      const freshness = freshnessState(record, now);
      // The audit names only the first rule in precedence order; surface time-based
      // problems that a higher-precedence rule would otherwise hide from the reader.
      const forgotten = isForgottenTombstone(record);
      let explanation = finding?.summary ?? 'Current evidence supports trust within the recorded permission.';
      if (forgotten) {
        explanation = 'Forgotten on request: the text was erased and only this privacy-safe tombstone remains.';
      } else if (freshness.state === 'EXPIRED' && finding?.ruleId !== 'DM-RULE-FRESH-001') {
        explanation += ` It also expired on ${day(freshness.expiresAfter)}.`;
      } else if (freshness.state === 'REVIEW_DUE' && finding?.ruleId !== 'DM-RULE-FRESH-002') {
        explanation += ` Its review date (${day(freshness.reviewAfter)}) has passed.`;
      }
      return {
        id: safe.id,
        statement: safe.statement,
        kind: safe.kind,
        source: { type: safe.source.type, reference: safe.source.reference },
        verificationStatus: safe.verificationStatus,
        confidence: safe.confidence,
        freshness,
        scope: record.scope,
        sensitivity: safe.sensitivity,
        actionPermission: safe.actionPermission,
        tags: safe.tags,
        outcome,
        ruleId: finding?.ruleId ?? 'DM-RULE-TRUST-001',
        explanation,
        nextStep: forgotten ? 'None. Already forgotten.' : finding?.recommendedNextStep ?? 'No action needed.',
        servable: isServable(record, evidence, now),
        forgotten,
        evidence: evidence
          .filter((item) => item.memoryIds.includes(record.id))
          .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
          .map((item) => ({ id: item.id, type: item.type, relationship: item.relationship, source: item.source })),
      };
    });
  return { generatedAt: now, total: memories.length, byOutcome, memories };
}

export async function inspectMemories(projectDir: string, clock: Clock): Promise<
  { readonly success: true; readonly report: InspectionReport }
  | { readonly success: false; readonly errors: readonly string[] }
> {
  const loaded = await loadAllRecords(projectDir);
  if (loaded.errors.length > 0) return { success: false, errors: loaded.errors };
  const evidence = await loadAllEvidence(projectDir);
  if (evidence.errors.length > 0) return { success: false, errors: evidence.errors };
  return { success: true, report: inspectRecords(loaded.records, evidence.evidence, clock()) };
}

const OUTCOME_LABEL: Readonly<Record<AuditOutcome, string>> = {
  TRUST: 'TRUST            ',
  RECHECK: 'RECHECK          ',
  ASK_OWNER: 'ASK_OWNER        ',
  BLOCK_ACTION: 'BLOCK_ACTION     ',
  FORGET_OR_REDACT: 'FORGET_OR_REDACT ',
};

const PLAIN_OUTCOME: Readonly<Record<AuditOutcome, string>> = {
  TRUST: 'I can rely on this.',
  RECHECK: 'I might be wrong. Verify before acting.',
  ASK_OWNER: 'This is a guess. Ask the owner first.',
  BLOCK_ACTION: 'Do not act on this.',
  FORGET_OR_REDACT: 'This must not be kept or shown.',
};

export function formatInspectionText(report: InspectionReport): string {
  const lines: string[] = [
    `What Tamhees remembers (${report.total} ${report.total === 1 ? 'memory' : 'memories'}, checked ${report.generatedAt})`,
    '',
  ];
  for (const memory of report.memories) {
    const freshness = memory.freshness.state === 'CURRENT'
      ? `verified ${memory.freshness.ageDays}d ago`
      : `${memory.freshness.state.toLowerCase().replace('_', ' ')}, verified ${memory.freshness.ageDays}d ago`;
    const scope = memory.scope.kind === 'PROJECT'
      ? 'whole project'
      : Object.entries(memory.scope).filter(([key]) => key !== 'kind').map(([key, value]) => `${key}=${String(value)}`).join(', ');
    lines.push(`${OUTCOME_LABEL[memory.outcome]}${memory.id}  ${memory.statement}`);
    lines.push(memory.forgotten ? `  ${memory.explanation}` : `  ${PLAIN_OUTCOME[memory.outcome]} ${memory.explanation}`);
    lines.push(`  source: ${memory.source.type} (${memory.source.reference}) · status: ${memory.verificationStatus} · confidence: ${memory.confidence}`);
    lines.push(`  freshness: ${freshness} · scope: ${scope} · permission: ${memory.actionPermission}${memory.servable ? '' : ' · withheld from agent context'}`);
    if (memory.evidence.length > 0) {
      lines.push(`  evidence: ${memory.evidence.map((item) => `${item.id} ${item.relationship}`).join(', ')}`);
    }
    if (memory.outcome !== 'TRUST' && !memory.forgotten) lines.push(`  next: ${memory.nextStep}`);
    lines.push('');
  }
  const counts = (Object.keys(report.byOutcome) as AuditOutcome[])
    .filter((outcome) => report.byOutcome[outcome] > 0)
    .map((outcome) => `${report.byOutcome[outcome]} ${outcome}`);
  lines.push(`Summary: ${counts.length > 0 ? counts.join(' · ') : 'no memories yet'}`);
  return lines.join('\n');
}
