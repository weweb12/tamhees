/**
 * Tamhees — deterministic audit engine.
 *
 * Phase 2 implements the complete precedence chain defined by the protocol:
 * privacy, revocation, conflict, authority, freshness, evidence, then trust.
 * Rules are packaged in source and cannot be weakened by project data.
 */

import { CLI_NAME, ENGINE_AUDITOR, STORAGE_DIR } from './identity.js';
import {
  CURRENT_SCHEMA_VERSION,
  ENGINE_VERSION,
  type AuditEvent,
  type AuditFinding,
  type AuditOutcome,
  type AuditRunResult,
  type Clock,
  type EvidenceRecord,
  type MemoryRecord,
} from './types.js';

export interface AuditRuleDefinition {
  readonly id: string;
  readonly description: string;
}

export const AUDIT_RULES: readonly AuditRuleDefinition[] = [
  { id: 'DM-RULE-PRIV-001', description: 'SECRET records must be forgotten or redacted.' },
  { id: 'DM-RULE-PRIV-002', description: 'FORGET_OR_REDACT permission prevents retention.' },
  { id: 'DM-RULE-REVOKE-001', description: 'Revoked or superseded records cannot authorize action.' },
  { id: 'DM-RULE-CONFLICT-001', description: 'Material conflicts block dependent action.' },
  { id: 'DM-RULE-AUTH-001', description: 'Agent inference cannot become owner-confirmed automatically.' },
  { id: 'DM-RULE-AUTH-002', description: 'MUST_NOT_ACT permission blocks action.' },
  { id: 'DM-RULE-AUTH-004', description: 'Owner-confirmed status requires owner evidence.' },
  { id: 'DM-RULE-AUTH-003', description: 'ASK_BEFORE_CHANGE permission requires owner approval.' },
  { id: 'DM-RULE-AUTH-005', description: 'ACT_WITH_CAUTION requires a recheck before action.' },
  { id: 'DM-RULE-AUTH-006', description: 'Controlled mutations must pass authority non-escalation validation.' },
  { id: 'DM-RULE-FRESH-001', description: 'Expired records require re-verification.' },
  { id: 'DM-RULE-FRESH-002', description: 'Records past reviewAfter require re-verification.' },
  { id: 'DM-RULE-EVID-001', description: 'Declared evidence references must exist and support the record.' },
  { id: 'DM-RULE-EVID-002', description: 'Unknown, inferred, or weakly supported records require recheck.' },
  { id: 'DM-RULE-TRUST-001', description: 'Supported current records may be trusted within their permission.' },
] as const;

const IMPLEMENTED_RULE_IDS = AUDIT_RULES.map((rule) => rule.id);

export function auditRecord(
  record: MemoryRecord,
  evidence: readonly EvidenceRecord[] = [],
  now = record.updatedAt,
): AuditFinding | null {
  const relevant = evidence
    .filter((item) => item.memoryIds.includes(record.id))
    .sort((a, b) => compareOrdinal(a.id, b.id));
  const evidenceIds = relevant.map((item) => item.id);

  if (record.sensitivity === 'SECRET') {
    return finding(
      'DM-RULE-PRIV-001', record, 'FORGET_OR_REDACT', evidenceIds,
      'Record has SECRET sensitivity. Raw content must not be retained.',
      'The record cannot appear in context or authorize action.',
      'Redact the raw content and retain only privacy-safe audit metadata.',
    );
  }
  if (record.actionPermission === 'FORGET_OR_REDACT') {
    return finding(
      'DM-RULE-PRIV-002', record, 'FORGET_OR_REDACT', evidenceIds,
      'Record explicitly requires forgetting or redaction.',
      'Raw content must not be retained or served.',
      'Run the controlled REDACT operation.',
    );
  }
  if (record.verificationStatus === 'REVOKED' || record.relationships.supersededBy !== undefined) {
    return finding(
      'DM-RULE-REVOKE-001', record, 'BLOCK_ACTION', evidenceIds,
      'Record is revoked or superseded and is no longer active truth.',
      'The record cannot authorize action.',
      record.relationships.supersededBy
        ? `Use superseding record ${record.relationships.supersededBy}.`
        : 'Ask the owner for current guidance.',
    );
  }

  const contradictoryEvidence = relevant.filter((item) => item.relationship === 'CONTRADICTS');
  if (
    record.verificationStatus === 'CONFLICTED'
    || (record.relationships.conflictsWith?.length ?? 0) > 0
    || contradictoryEvidence.length > 0
  ) {
    const conflictIds = contradictoryEvidence.map((item) => item.id);
    return finding(
      'DM-RULE-CONFLICT-001', record, 'BLOCK_ACTION', conflictIds.length > 0 ? conflictIds : evidenceIds,
      conflictIds.length > 0
        ? `Contradictory evidence exists: ${conflictIds.join(', ')}.`
        : 'The record declares a material unresolved conflict.',
      'Dependent action is blocked until the conflict is resolved.',
      'Ask the owner to resolve the conflicting claims or evidence.',
    );
  }

  if (record.source.type === 'AGENT_INFERENCE' && record.verificationStatus === 'OWNER_CONFIRMED') {
    return finding(
      'DM-RULE-AUTH-001', record, 'BLOCK_ACTION', evidenceIds,
      'Agent inference cannot be marked owner-confirmed without explicit owner evidence.',
      'The claimed owner authority is invalid and cannot authorize action.',
      'Obtain explicit owner confirmation evidence or demote the record to INFERRED.',
    );
  }
  if (record.actionPermission === 'MUST_NOT_ACT') {
    return finding(
      'DM-RULE-AUTH-002', record, 'BLOCK_ACTION', evidenceIds,
      'Record permission is MUST_NOT_ACT.',
      'No action may be taken based on this record.',
      'Use other verified guidance or ask the owner.',
    );
  }
  if (record.verificationStatus === 'OWNER_CONFIRMED' && !hasOwnerEvidence(record, relevant)) {
    return finding(
      'DM-RULE-AUTH-004', record, 'ASK_OWNER', evidenceIds,
      'OWNER_CONFIRMED status lacks explicit owner provenance or supporting owner evidence.',
      'The record cannot authorize an owner-level decision.',
      'Attach supporting OWNER_INSTRUCTION evidence or ask the owner.',
    );
  }
  if (record.actionPermission === 'ASK_BEFORE_CHANGE') {
    return finding(
      'DM-RULE-AUTH-003', record, 'ASK_OWNER', evidenceIds,
      'The recorded permission requires owner approval before change.',
      'The agent may inspect and explain, but must not make the significant change.',
      'Ask the owner for explicit approval.',
    );
  }
  if (record.actionPermission === 'ACT_WITH_CAUTION') {
    return finding(
      'DM-RULE-AUTH-005', record, 'RECHECK', evidenceIds,
      'The record permits action only with caution.',
      'Verify the related conditions before acting.',
      record.recheckMethod ?? 'Recheck the stated source and relevant repository state.',
    );
  }

  const nowMs = Date.parse(now);
  const expiresMs = record.freshness.expiresAfter ? Date.parse(record.freshness.expiresAfter) : Number.NaN;
  if (Number.isFinite(expiresMs) && Number.isFinite(nowMs) && expiresMs <= nowMs) {
    return finding(
      'DM-RULE-FRESH-001', record, 'RECHECK', evidenceIds,
      `Record expired at ${record.freshness.expiresAfter}.`,
      'The expired record cannot authorize action until re-verified.',
      record.recheckMethod ?? 'Verify the record against its stated source.',
    );
  }
  if (record.freshness.reviewAfter !== undefined) {
    const reviewMs = Date.parse(record.freshness.reviewAfter);
    if (!Number.isFinite(reviewMs) || (Number.isFinite(nowMs) && reviewMs <= nowMs)) {
      return finding(
        'DM-RULE-FRESH-002', record, 'RECHECK', evidenceIds,
        Number.isFinite(reviewMs)
          ? `Record review was due at ${record.freshness.reviewAfter}.`
          : record.sensitivity === 'SENSITIVE'
            ? 'Record has a conditional review requirement with sensitive details redacted.'
            : `Record has a conditional review requirement: ${record.freshness.reviewAfter}.`,
        'The record must be reviewed before it authorizes action.',
        record.recheckMethod ?? 'Complete the recorded review condition.',
      );
    }
  }

  const declaredIds = [...(record.relationships.supportedBy ?? [])].sort();
  if (declaredIds.length > 0) {
    const relevantById = new Map(relevant.map((item) => [item.id, item]));
    const missingOrNonSupporting = declaredIds.filter((id) => relevantById.get(id)?.relationship !== 'SUPPORTS');
    if (missingOrNonSupporting.length > 0) {
      return finding(
        'DM-RULE-EVID-001', record, 'RECHECK', evidenceIds,
        `Declared supporting evidence is missing or non-supporting: ${missingOrNonSupporting.join(', ')}.`,
        'Missing evidence is not treated as confirmation.',
        'Add valid supporting evidence or remove the unsupported relationship after review.',
      );
    }
  }

  if (
    record.verificationStatus === 'UNKNOWN'
    || record.verificationStatus === 'INFERRED'
    || record.confidence === 'LOW'
    || !hasSufficientEvidence(record, relevant)
  ) {
    return finding(
      'DM-RULE-EVID-002', record, 'RECHECK', evidenceIds,
      'The record does not yet have sufficient verified support for TRUST.',
      'Treat the record as context only; do not let it independently authorize significant action.',
      record.recheckMethod ?? 'Verify the record against its stated source and attach supporting evidence.',
    );
  }

  return null;
}

export function determineRecordOutcome(
  record: MemoryRecord,
  evidence: readonly EvidenceRecord[] = [],
  now = record.updatedAt,
): AuditOutcome {
  return auditRecord(record, evidence, now)?.outcome ?? 'TRUST';
}

export function runAudit(
  records: readonly MemoryRecord[],
  clock: Clock,
  evidence: readonly EvidenceRecord[] = [],
): AuditRunResult {
  const timestamp = clock();
  const findings = [...records]
    .sort((a, b) => compareOrdinal(a.id, b.id))
    .map((record) => auditRecord(record, evidence, timestamp))
    .filter((item): item is AuditFinding => item !== null);

  return {
    overallOutcome: determineOverallOutcome(findings),
    findings,
    recordsAudited: records.length,
    rulesApplied: IMPLEMENTED_RULE_IDS,
    implementedRuleCount: IMPLEMENTED_RULE_IDS.length,
    timestamp,
  };
}

export function formatAuditResult(result: AuditRunResult): string {
  const lines = [
    `${CLI_NAME} audit report`,
    '─'.repeat(40),
    `Overall outcome: ${result.overallOutcome}`,
    `Records audited: ${result.recordsAudited}`,
    `Rules applied: ${result.rulesApplied.join(', ')}`,
    `Implemented rules: ${result.implementedRuleCount}`,
    `Timestamp: ${result.timestamp}`,
    '',
  ];
  if (result.findings.length === 0) {
    lines.push('No higher-priority rule triggered. Records satisfy the Phase 2 TRUST conditions.');
  } else {
    lines.push('Findings:', '');
    for (const item of result.findings) {
      lines.push(
        `  Record: ${item.recordId}`,
        `  Rule: ${item.ruleId}`,
        `  Outcome: ${item.outcome}`,
        `  Evidence: ${item.evidenceExamined.length > 0 ? item.evidenceExamined.join(', ') : 'none'}`,
        `  Summary: ${item.summary}`,
        `  Permission: ${item.permissionConsequence}`,
        `  Next step: ${item.recommendedNextStep}`,
        '',
      );
    }
  }
  return lines.join('\n');
}

function finding(
  ruleId: string,
  record: MemoryRecord,
  outcome: AuditOutcome,
  evidenceExamined: readonly string[],
  summary: string,
  permissionConsequence: string,
  recommendedNextStep: string,
): AuditFinding {
  return {
    ruleId,
    recordId: record.id,
    outcome,
    evidenceExamined: [...evidenceExamined].sort(),
    summary,
    permissionConsequence,
    recommendedNextStep,
  };
}

function hasOwnerEvidence(record: MemoryRecord, evidence: readonly EvidenceRecord[]): boolean {
  return evidence.some((item) => (
    item.type === 'OWNER_INSTRUCTION'
    && item.relationship === 'SUPPORTS'
    && item.memoryIds.includes(record.id)
  ));
}

function hasSufficientEvidence(record: MemoryRecord, evidence: readonly EvidenceRecord[]): boolean {
  if (evidence.some((item) => item.relationship === 'SUPPORTS')) return true;
  switch (record.verificationStatus) {
    case 'OWNER_CONFIRMED':
      return hasOwnerEvidence(record, evidence);
    case 'REPO_VERIFIED':
      return record.source.type === 'REPOSITORY_STATE' || record.source.type === 'SYSTEM_OBSERVATION';
    case 'TEST_VERIFIED':
      return record.source.type === 'TEST_RESULT';
    case 'OBSERVED':
      return record.source.type === 'AGENT_OBSERVATION' || record.source.type === 'SYSTEM_OBSERVATION';
    default:
      return false;
  }
}

function determineOverallOutcome(findings: readonly AuditFinding[]): AuditOutcome {
  const priority: readonly AuditOutcome[] = [
    'FORGET_OR_REDACT',
    'BLOCK_ACTION',
    'ASK_OWNER',
    'RECHECK',
  ];
  for (const outcome of priority) {
    if (findings.some((item) => item.outcome === outcome)) return outcome;
  }
  return 'TRUST';
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

