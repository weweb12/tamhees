/**
 * Tamhees — everyday memory operations.
 *
 * Thin, safe builders over the canonical mutation boundary so a person or agent can
 * remember, forget, revoke and inspect memory without hand-writing update-candidate
 * JSON. Every write still goes through applyUpdateCandidate(), so schema, authority,
 * privacy, archive and audit-history rules are enforced exactly as for `memory apply`.
 * Inspection is read-only: it never appends audit events.
 */

import { loadAllEvidence } from './evidence.js';
import { applyUpdateCandidate, previewUpdateCandidate } from './mutations.js';
import { loadAllRecords } from './store.js';
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
import { withWriteLock } from './lock.js';

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
  const run = async () => {
    const loaded = await loadAllRecords(projectDir);
    if (loaded.errors.length > 0) {
      return loadFailure('CREATE', loaded.errors);
    }
    // The next free ID is chosen while holding the write lock, so concurrent
    // `remember` calls never pick the same ID.
    const candidate = buildRememberCandidate(options, loaded.records.map((record) => record.id), clock());
    if (dryRun) {
      const evidence = await loadAllEvidence(projectDir);
      const preview = await previewUpdateCandidate(projectDir, candidate, clock, evidence.evidence);
      return { ...preview, candidate };
    }
    return { ...(await applyUpdateCandidate(projectDir, candidate, clock)), candidate };
  };
  return dryRun ? run() : withWriteLock(projectDir, run);
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
  return withWriteLock(projectDir, async () => {
    const loaded = await loadAllRecords(projectDir);
    if (loaded.errors.length > 0) return loadFailure('REVOKE', loaded.errors);
    const target = loaded.records.find((record) => record.id === memoryId);
    if (target === undefined) {
      return {
        success: false, action: 'REVOKE', memoryId, record: null, archivePath: null,
        errors: [{ field: 'memoryId', code: 'UNKNOWN_MEMORY', message: `Memory not found: ${memoryId}.` }],
      } as const;
    }
    return applyUpdateCandidate(projectDir, buildRevokeCandidate(target, options, clock()), clock);
  });
}

function loadFailure(action: UpdateCandidate['action'], errors: readonly string[]) {
  return {
    success: false, action, memoryId: null, record: null, archivePath: null, candidate: null,
    errors: errors.map((message) => ({ field: 'store', code: 'STORE_INVALID', message })),
  } as const;
}

// ─── Inspection ─────────────────────────────────────────────
// Pure inspection lives in inspect.ts (shared with the dashboard and hosted demo).

export {
  formatInspectionText,
  inspectRecords,
  isForgottenTombstone,
  isServable,
  type FreshnessState,
  type InspectedEvidence,
  type InspectedMemory,
  type InspectionReport,
} from './inspect.js';
import { inspectRecords, type InspectionReport } from './inspect.js';

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

