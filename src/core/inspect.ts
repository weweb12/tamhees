/**
 * Tamhees — memory inspection ("what do you remember, and how sure are you?").
 *
 * Pure and read-only: no file access, no writes, no audit events. Shared by the
 * `tamhees inspect` command, the dashboard inspector and the hosted demo.
 */

import { auditRecord } from './audit.js';
import { memoryForOutput } from './privacy.js';
import { normalizeLegacyMemory } from './scope.js';
import type {
  ActionPermission,
  AuditOutcome,
  Confidence,
  EvidenceRecord,
  MemoryKind,
  MemoryRecord,
  MemoryScope,
  SourceType,
  VerificationStatus,
} from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

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
  ASK_OWNER: 'Not confirmed. Ask the owner first.',
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
