/**
 * Doubtful Memory — Local privacy guards
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
    statement: label,
    source: { type: record.source.type, reference: '[REDACTED]' },
    tags: ['redacted'],
    ...(record.recheckMethod !== undefined ? { recheckMethod: '[REDACTED]' } : {}),
    ...(record.notes !== undefined ? { notes: '[REDACTED]' } : {}),
  };
}
