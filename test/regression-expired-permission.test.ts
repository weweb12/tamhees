import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditRecord } from '../src/core/audit.js';
import { compileContext } from '../src/core/context.js';
import { CURRENT_SCHEMA_VERSION, fixedClock, type MemoryRecord } from '../src/core/types.js';
import { validateContextPack } from '../src/core/validation.js';

// Regression: an expired record whose permission rule (ACT_WITH_CAUTION, ASK_BEFORE_CHANGE,
// or an unconfirmed OWNER_CONFIRMED claim) precedes DM-RULE-FRESH-001 in audit precedence
// used to reach context ranking. Context validation then rejected the whole pack, so one
// expired memory denied context for every matching task. Found by scripts/failure-test.mjs.

const NOW = '2026-10-25T09:00:00.000Z';
const clock = fixedClock(NOW);

function expired(id: string, overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    scope: { kind: 'PROJECT' },
    kind: 'CONVENTION',
    statement: 'Release builds use the legacy build script.',
    source: { type: 'REPOSITORY_STATE', reference: 'scripts/' },
    verificationStatus: 'REPO_VERIFIED',
    confidence: 'HIGH',
    freshness: {
      lastVerified: '2026-04-08T09:00:00.000Z',
      expiresAfter: '2026-10-05T09:00:00.000Z',
    },
    sensitivity: 'INTERNAL',
    actionPermission: 'ACT_WITH_CAUTION',
    relationships: {},
    tags: ['build', 'release'],
    recheckMethod: 'Inspect package.json scripts.',
    createdAt: '2026-04-08T09:00:00.000Z',
    updatedAt: '2026-04-08T09:00:00.000Z',
    ...overrides,
  };
}

function current(id: string): MemoryRecord {
  return expired(id, {
    statement: 'Release builds run npm run build before packaging.',
    actionPermission: 'MAY_ACT',
    freshness: { lastVerified: '2026-10-24T09:00:00.000Z' },
  });
}

describe('Regression: expired records behind permission rules', () => {
  for (const [label, overrides] of [
    ['ACT_WITH_CAUTION', { actionPermission: 'ACT_WITH_CAUTION' }],
    ['ASK_BEFORE_CHANGE', { actionPermission: 'ASK_BEFORE_CHANGE' }],
    ['OWNER_CONFIRMED without owner evidence', {
      actionPermission: 'MAY_ACT',
      verificationStatus: 'OWNER_CONFIRMED',
      source: { type: 'OWNER_INSTRUCTION', reference: 'planning note' },
    }],
  ] as const) {
    it(`excludes an expired ${label} record and still returns a valid pack`, () => {
      const stale = expired('DM-MEM-EXPIRED-001', overrides as Partial<MemoryRecord>);
      // Precondition: the primary audit finding is a permission rule, not DM-RULE-FRESH-001.
      assert.notEqual(auditRecord(stale, [], NOW)?.ruleId, 'DM-RULE-FRESH-001');

      const pack = compileContext('run the release build', [stale, current('DM-MEM-CURRENT-001')], clock, []);
      assert.deepEqual(validateContextPack(pack), { valid: true, issues: [] });
      assert.equal(pack.selected.some((item) => item.memoryId === stale.id), false);
      assert.deepEqual(
        pack.excluded.find((item) => item.memoryId === stale.id)?.reasonCode,
        'expired',
      );
      assert.deepEqual(pack.selected.map((item) => item.memoryId), ['DM-MEM-CURRENT-001']);
    });
  }

  it('keeps irrelevant expired records reported as irrelevant', () => {
    const pack = compileContext('update the color palette', [expired('DM-MEM-EXPIRED-002')], clock, []);
    assert.equal(validateContextPack(pack).valid, true);
    assert.equal(pack.excluded[0]?.reasonCode, 'irrelevant');
  });
});
