/**
 * Tamhees — Local privacy guards
 *
 * These deterministic patterns are intentionally conservative and are not a
 * complete secret scanner. They prevent common raw credential shapes from
 * entering controlled storage. Errors report pattern names only and never echo
 * the candidate value.
 */

import type { EvidenceRecord, MemoryRecord } from './types.js';

interface SecretPattern {
  readonly id: string;
  readonly expression: RegExp;
}

const SECRET_PATTERNS: readonly SecretPattern[] = [
  { id: 'PRIVATE_KEY_BLOCK', expression: /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/i },
  { id: 'AWS_ACCESS_KEY_ID', expression: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'GITHUB_TOKEN', expression: /\b(?:gh[opsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { id: 'SECRET_KEY_PREFIX', expression: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  {
    id: 'ASSIGNED_SECRET',
    expression: /\b(?:password|passwd|api[_-]?key|access[_-]?token|secret)\s*[:=]\s*["']?[^\s"',;]{8,}/i,
  },
  // Added after a real-world review (DM-DEC-046): common credential shapes that the
  // original patterns let through.
  { id: 'JSON_WEB_TOKEN', expression: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { id: 'BEARER_TOKEN', expression: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i },
  { id: 'URL_CREDENTIALS', expression: /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s/:@]{1,64}:[^\s/@]{3,}@/i },
  { id: 'SLACK_TOKEN', expression: /\bxox[abposr]-[A-Za-z0-9-]{10,}|hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{8,}/ },
  { id: 'STRIPE_KEY', expression: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { id: 'GOOGLE_API_KEY', expression: /\bAIza[0-9A-Za-z_-]{35}\b/ },
];

export interface SecretScanResult {
  readonly secretLike: boolean;
  readonly patternIds: readonly string[];
}

export function scanSecretLikeText(values: readonly string[]): SecretScanResult {
  const matches = new Set<string>();
  for (const value of values) {
    for (const pattern of SECRET_PATTERNS) {
      pattern.expression.lastIndex = 0;
      if (pattern.expression.test(value)) {
        matches.add(pattern.id);
      }
    }
  }
  return { secretLike: matches.size > 0, patternIds: [...matches].sort() };
}

export function scanMemoryRecord(record: MemoryRecord): SecretScanResult {
  return scanSecretLikeText([
    record.statement,
    record.source.reference,
    record.source.agent ?? '',
    record.freshness.reviewAfter ?? '',
    record.freshness.expiresAfter ?? '',
    record.recheckMethod ?? '',
    record.notes ?? '',
    ...record.tags,
    ...Object.values(record.scope ?? {}).filter((v): v is string => typeof v === 'string'),
  ]);
}

export function scanEvidenceRecord(record: EvidenceRecord): SecretScanResult {
  return scanSecretLikeText([
    record.source,
    record.content,
    record.collectedBy,
    record.notes ?? '',
  ]);
}

export function isRedactedText(value: string): boolean {
  return /^\[REDACTED(?:[^\]]*)\]$/i.test(value.trim());
}

/** Return a display-safe copy without mutating canonical storage. */
export function memoryForOutput(record: MemoryRecord): MemoryRecord {
  if (
    record.sensitivity !== 'SENSITIVE'
    && record.sensitivity !== 'SECRET'
    && record.actionPermission !== 'FORGET_OR_REDACT'
  ) {
    return record;
  }

  const label = record.sensitivity === 'SENSITIVE'
    ? '[REDACTED — SENSITIVE content]'
    : '[REDACTED — restricted content]';
  return {
    ...record,
    scope: { kind: 'PROJECT' },
    statement: label,
    source: { type: record.source.type, reference: '[REDACTED]' },
    tags: ['redacted'],
    ...(record.recheckMethod !== undefined ? { recheckMethod: '[REDACTED]' } : {}),
    ...(record.notes !== undefined ? { notes: '[REDACTED]' } : {}),
  };
}
