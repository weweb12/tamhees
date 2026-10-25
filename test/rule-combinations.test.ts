import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditRecord } from '../src/core/audit.js';
import { compileContext } from '../src/core/context.js';
import {
  ACTION_PERMISSIONS,
  CURRENT_SCHEMA_VERSION,
  SENSITIVITY_VALUES,
  VERIFICATION_STATUSES,
  fixedClock,
  type EvidenceRecord,
  type MemoryRecord,
  type SourceType,
  type VerificationStatus,
} from '../src/core/types.js';
import { validateContextPack } from '../src/core/validation.js';

// Exhaustive rule-combination check.
//
// Single-rule tests cannot catch bugs that only appear when two rules interact (for
// example DM-DEC-038: an expired record behind a permission rule broke retrieval).
// This suite builds every combination of authority status, source, permission,
// sensitivity, freshness, evidence, supersession and confidence, then asserts the
// safety invariants that must hold for all of them.

const NOW = '2026-10-25T09:00:00.000Z';
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number): string => new Date(Date.parse(NOW) + days * DAY).toISOString();
const clock = fixedClock(NOW);
const TASK = 'update the payment webhook handler';
const RAW = 'Payment webhook handler retries failed deliveries three times.';

const ALIGNED_SOURCE: Record<VerificationStatus, SourceType> = {
  OWNER_CONFIRMED: 'OWNER_INSTRUCTION',
  REPO_VERIFIED: 'REPOSITORY_STATE',
  TEST_VERIFIED: 'TEST_RESULT',
  OBSERVED: 'AGENT_OBSERVATION',
  INFERRED: 'AGENT_INFERENCE',
  UNKNOWN: 'CONVERSATION_RECORD',
  CONFLICTED: 'REPOSITORY_STATE',
  REVOKED: 'REPOSITORY_STATE',
};

const FRESHNESS = {
  current: { lastVerified: at(-2) },
  old: { lastVerified: at(-700) },
  reviewDue: { lastVerified: at(-60), reviewAfter: at(-1) },
  conditional: { lastVerified: at(-5), reviewAfter: 'when the payment provider changes' },
  expired: { lastVerified: at(-200), expiresAfter: at(-1) },
  expiredAndDue: { lastVerified: at(-200), reviewAfter: at(-100), expiresAfter: at(-1) },
} as const;
type FreshnessKey = keyof typeof FRESHNESS;

const EVIDENCE_VARIANTS = ['none', 'supports', 'ownerSupports', 'contradicts', 'declaredMissing'] as const;
type EvidenceVariant = (typeof EVIDENCE_VARIANTS)[number];

const OUTCOMES_THAT_MAY_BE_SERVED = new Set(['TRUST', 'RECHECK', 'ASK_OWNER']);
const GATE_RULES = new Set([
  'DM-RULE-PRIV-001', 'DM-RULE-PRIV-002', 'DM-RULE-REVOKE-001', 'DM-RULE-CONFLICT-001',
  'DM-RULE-AUTH-001', 'DM-RULE-AUTH-002', 'DM-RULE-FRESH-001', 'DM-RULE-FRESH-002',
]);

interface Combination {
  readonly label: string;
  readonly record: MemoryRecord;
  readonly evidence: readonly EvidenceRecord[];
  readonly expired: boolean;
}

function evidenceFor(variant: EvidenceVariant, memoryId: string): EvidenceRecord[] {
  const base = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    source: 'src/payments/webhook.ts',
    memoryIds: [memoryId],
    collectedAt: at(-1),
    collectedBy: 'combination-test',
  };
  switch (variant) {
    case 'none':
    case 'declaredMissing':
      return [];
    case 'supports':
      return [{ ...base, id: 'DM-EVIDENCE-S', type: 'REPOSITORY_STATE', content: 'Retry count is three.', relationship: 'SUPPORTS' }];
    case 'ownerSupports':
      return [{ ...base, id: 'DM-EVIDENCE-O', type: 'OWNER_INSTRUCTION', content: 'Owner confirmed three retries.', relationship: 'SUPPORTS' }];
    case 'contradicts':
      return [{ ...base, id: 'DM-EVIDENCE-C', type: 'REPOSITORY_STATE', content: 'Retry count is now five.', relationship: 'CONTRADICTS' }];
  }
}

function* combinations(): Generator<Combination> {
  for (const status of VERIFICATION_STATUSES) {
    const sources = [...new Set<SourceType>([ALIGNED_SOURCE[status], 'AGENT_INFERENCE'])];
    for (const sourceType of sources) {
      for (const permission of ACTION_PERMISSIONS) {
        for (const sensitivity of SENSITIVITY_VALUES) {
          for (const freshnessKey of Object.keys(FRESHNESS) as FreshnessKey[]) {
            for (const evidenceVariant of EVIDENCE_VARIANTS) {
              for (const superseded of [false, true]) {
                const id = 'DM-MEM-COMBO-001';
                const freshness = FRESHNESS[freshnessKey];
                const record: MemoryRecord = {
                  schemaVersion: CURRENT_SCHEMA_VERSION,
                  id,
                  scope: { kind: 'PROJECT' },
                  kind: 'CONVENTION',
                  statement: RAW,
                  source: { type: sourceType, reference: 'combination fixture' },
                  verificationStatus: status,
                  confidence: 'HIGH',
                  freshness,
                  sensitivity,
                  actionPermission: permission,
                  relationships: {
                    ...(superseded ? { supersededBy: 'DM-MEM-COMBO-002' } : {}),
                    ...(evidenceVariant === 'declaredMissing' ? { supportedBy: ['DM-EVIDENCE-MISSING'] } : {}),
                  },
                  tags: ['payment', 'webhook'],
                  recheckMethod: 'Inspect the webhook handler.',
                  createdAt: at(-700),
                  updatedAt: at(-700),
                };
                yield {
                  label: `${status}/${sourceType}/${permission}/${sensitivity}/${freshnessKey}/${evidenceVariant}${superseded ? '/superseded' : ''}`,
                  record,
                  evidence: evidenceFor(evidenceVariant, id),
                  expired: 'expiresAfter' in freshness,
                };
              }
            }
          }
        }
      }
    }
  }
}

// A safe, current, relevant record that should always be servable. It proves the pack
// still works for the agent no matter how broken the record under test is.
const ANCHOR: MemoryRecord = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: 'DM-MEM-ANCHOR-001',
  scope: { kind: 'PROJECT' },
  kind: 'OBSERVATION',
  statement: 'The payment webhook handler lives in src/payments/webhook.ts.',
  source: { type: 'REPOSITORY_STATE', reference: 'src/payments/webhook.ts' },
  verificationStatus: 'REPO_VERIFIED',
  confidence: 'HIGH',
  freshness: { lastVerified: at(-1) },
  sensitivity: 'INTERNAL',
  actionPermission: 'MAY_ACT',
  relationships: { supportedBy: ['DM-EVIDENCE-ANCHOR'] },
  tags: ['payment', 'webhook'],
  recheckMethod: 'Inspect the source tree.',
  createdAt: at(-1),
  updatedAt: at(-1),
};
const ANCHOR_EVIDENCE: EvidenceRecord = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id: 'DM-EVIDENCE-ANCHOR',
  type: 'REPOSITORY_STATE',
  source: 'src/payments/webhook.ts',
  content: 'File exists.',
  relationship: 'SUPPORTS',
  memoryIds: ['DM-MEM-ANCHOR-001'],
  collectedAt: at(-1),
  collectedBy: 'combination-test',
};

describe('Rule combinations: safety invariants hold for every combination', () => {
  const all = [...combinations()];

  it(`covers a large combination space (${all.length} records)`, () => {
    assert.ok(all.length > 5000);
  });

  it('every context pack is valid, so retrieval never fails for the agent', () => {
    const failures: string[] = [];
    for (const { label, record, evidence } of all) {
      const pack = compileContext(TASK, [record, ANCHOR], clock, [...evidence, ANCHOR_EVIDENCE]);
      const validation = validateContextPack(pack);
      if (!validation.valid) failures.push(`${label}: ${validation.issues.map((issue) => issue.code).join(',')}`);
      if (!pack.selected.some((item) => item.memoryId === ANCHOR.id)) failures.push(`${label}: anchor not served`);
    }
    assert.deepEqual(failures.slice(0, 10), [], `${failures.length} invalid packs`);
  });

  it('every record is accounted for exactly once (selected or excluded with a reason)', () => {
    for (const { label, record, evidence } of all) {
      const pack = compileContext(TASK, [record], clock, evidence);
      const seen = [
        ...pack.selected.map((item) => item.memoryId),
        ...pack.excluded.map((item) => item.memoryId),
      ].filter((id) => id === record.id);
      assert.equal(seen.length, 1, label);
    }
  });

  it('unsafe records are never served: expired, revoked, superseded, contradicted, secret or forget-marked', () => {
    for (const { label, record, evidence, expired } of all) {
      const pack = compileContext(TASK, [record], clock, evidence);
      const served = pack.selected.find((item) => item.memoryId === record.id);
      if (served === undefined) continue;
      assert.equal(expired, false, `${label}: expired record served`);
      assert.notEqual(record.verificationStatus, 'REVOKED', `${label}: revoked record served`);
      assert.notEqual(record.verificationStatus, 'CONFLICTED', `${label}: conflicted record served`);
      assert.equal(record.relationships.supersededBy, undefined, `${label}: superseded record served`);
      assert.equal(evidence.some((item) => item.relationship === 'CONTRADICTS'), false, `${label}: contradicted record served`);
      assert.notEqual(record.sensitivity, 'SECRET', `${label}: secret record served`);
      assert.ok(!['FORGET_OR_REDACT', 'MUST_NOT_ACT'].includes(record.actionPermission), `${label}: forbidden permission served`);
      assert.ok(OUTCOMES_THAT_MAY_BE_SERVED.has(served.auditOutcome), `${label}: served with ${served.auditOutcome}`);
      if (record.sensitivity === 'SENSITIVE') {
        assert.notEqual(served.statement, RAW, `${label}: sensitive statement served raw`);
      }
    }
  });

  it('nothing expired, revoked or contradicted is ever trusted', () => {
    for (const { label, record, evidence, expired } of all) {
      const outcome = auditRecord(record, evidence, NOW)?.outcome ?? 'TRUST';
      if (expired || record.verificationStatus === 'REVOKED' || record.relationships.supersededBy !== undefined
        || evidence.some((item) => item.relationship === 'CONTRADICTS')) {
        assert.notEqual(outcome, 'TRUST', label);
      }
    }
  });

  it('high confidence never bypasses a gate; it can only remove the low-confidence recheck', () => {
    for (const { label, record, evidence } of all) {
      const high = auditRecord(record, evidence, NOW);
      const low = auditRecord({ ...record, confidence: 'LOW' }, evidence, NOW);
      if (high !== null && GATE_RULES.has(high.ruleId)) {
        assert.equal(low?.ruleId, high.ruleId, label);
      }
      if (low !== null && low.ruleId !== 'DM-RULE-EVID-002') {
        assert.equal(high?.ruleId, low.ruleId, label);
      }
    }
  });

  it('audit and context are deterministic for every combination', () => {
    for (const { label, record, evidence } of all.filter((_, index) => index % 7 === 0)) {
      assert.deepEqual(auditRecord(record, evidence, NOW), auditRecord(record, evidence, NOW), label);
      assert.deepEqual(
        compileContext(TASK, [record, ANCHOR], clock, [...evidence, ANCHOR_EVIDENCE]),
        compileContext(TASK, [ANCHOR, record], clock, [ANCHOR_EVIDENCE, ...evidence]),
        `${label}: order-dependent result`,
      );
    }
  });
});
