/**
 * The privacy tombstone left by a controlled REDACT ("forget").
 *
 * Pure (no file access) so the same transformation backs `tamhees forget`, lifecycle
 * REDACT proposals and the dashboard's live "Forget" demonstration. The raw statement,
 * source, tags and scope are dropped; only the ID, kind and timestamps survive, so the
 * audit trail still shows that something existed and when it was removed.
 */

import { CURRENT_SCHEMA_VERSION, type MemoryRecord } from './types.js';

export const REDACTED_STATEMENT = '[REDACTED — controlled privacy removal]';

export function redactedTombstone(prior: MemoryRecord, proposedBy: string, reason: string, now: string): MemoryRecord {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: prior.id,
    kind: prior.kind,
    scope: { kind: 'PROJECT' },
    statement: REDACTED_STATEMENT,
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
    notes: `Raw content removed by ${proposedBy}. Reason: ${reason}`,
    createdAt: prior.createdAt,
    updatedAt: now,
  };
}
