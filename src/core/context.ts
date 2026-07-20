/**
 * Doubtful Memory — Context Compiler
 *
 * Assembles task-specific memory context packs for agent consumption.
 *
 * Phase 1 strategy: deterministic lexical/tag selection.
 * This is NOT semantic or AI-powered retrieval.
 *
 * Full ranking and budget enforcement remain Phase 3.
 */

import {
  CURRENT_SCHEMA_VERSION,
  type AuditOutcome,
  type Clock,
  type ContextExclusion,
  type ContextPack,
  type ContextSelection,
  type EvidenceRecord,
  type MemoryRecord,
} from './types.js';
import { auditRecord, determineRecordOutcome } from './audit.js';
import { memoryForOutput, scanSecretLikeText } from './privacy.js';

const SELECTION_STRATEGY =
  'Phase 2 deterministic audit-aware lexical/tag selection. Task words are matched against tags and statement text; unsafe records are excluded before output.';

/**
 * Compile a context pack for a given task description.
 *
 * - Selects records whose tags or statement words are relevant.
 * - Excludes SECRET/FORGET_OR_REDACT content from usable context.
 * - Does NOT persist the context pack.
 * - Produces deterministic ordering for fixed clock/input.
 */
export function compileContext(
  taskDescription: string,
  records: readonly MemoryRecord[],
  clock: Clock,
  evidence: readonly EvidenceRecord[] = [],
): ContextPack {
  const taskScan = scanSecretLikeText([taskDescription]);
  const safeTaskDescription = taskScan.secretLike
    ? '[REDACTED — task description contained secret-like content]'
    : taskDescription;
  const taskWords = taskScan.secretLike ? [] : extractWords(taskDescription);
  const selected: ContextSelection[] = [];
  const excluded: ContextExclusion[] = [];
  const warnings: string[] = [];
  const generatedAt = clock();
  if (taskScan.secretLike) {
    warnings.push(`Task description was redacted because it matched: ${taskScan.patternIds.join(', ')}.`);
  }

  // Sort records by ID for deterministic ordering
  const sortedRecords = [...records].sort((a, b) => a.id.localeCompare(b.id));

  for (const record of sortedRecords) {
    // Exclude SECRET content
    if (record.sensitivity === 'SECRET') {
      excluded.push({
        memoryId: record.id,
        reason: 'redacted: SECRET sensitivity — content must not appear in context.',
      });
      continue;
    }

    // Exclude FORGET_OR_REDACT permission
    if (record.actionPermission === 'FORGET_OR_REDACT') {
      excluded.push({
        memoryId: record.id,
        reason: 'redacted: FORGET_OR_REDACT permission — raw content must not be retained.',
      });
      continue;
    }

    // Exclude REVOKED records
    if (record.verificationStatus === 'REVOKED') {
      excluded.push({
        memoryId: record.id,
        reason: 'revoked: record has been superseded or explicitly invalidated.',
      });
      continue;
    }

    // Check relevance via lexical/tag matching
    const relevance = computeRelevance(taskWords, record);
    if (relevance.score === 0) {
      excluded.push({
        memoryId: record.id,
        reason: 'irrelevant: no lexical or tag match with the task description.',
      });
      continue;
    }

    const outcome: AuditOutcome = determineRecordOutcome(record, evidence, generatedAt);

    const auditFinding = outcome === 'TRUST' ? null : auditRecord(record, evidence, generatedAt);
    if (outcome === 'BLOCK_ACTION') {
      const finding = auditFinding;
      warnings.push(
        `Record ${record.id} has a BLOCK_ACTION finding: ${finding?.summary ?? 'Unknown reason'}`,
      );
      excluded.push({
        memoryId: record.id,
        reason: `blocked: ${finding?.summary ?? 'audit policy prevents use'}`,
      });
      continue;
    }

    if (outcome === 'FORGET_OR_REDACT') {
      excluded.push({
        memoryId: record.id,
        reason: 'redacted: audit policy requires forgetting or redaction.',
      });
      continue;
    }

    if (outcome === 'ASK_OWNER') {
      warnings.push(`Record ${record.id} requires owner confirmation: ${auditFinding?.summary ?? 'authority is insufficient'}`);
    }

    if (outcome === 'RECHECK') {
      warnings.push(`Record ${record.id} requires recheck: ${auditFinding?.summary ?? 'evidence is insufficient'}`);
    }

    const safeRecord = memoryForOutput(record);
    const safeRelevanceReason = record.sensitivity === 'SENSITIVE'
      ? 'Lexical selection matched redacted sensitive metadata.'
      : relevance.reason;
    selected.push({
      memoryId: record.id,
      statement: safeRecord.statement,
      reason: auditFinding ? `${safeRelevanceReason} Audit: ${auditFinding.summary}` : safeRelevanceReason,
      auditOutcome: outcome,
      verificationStatus: record.verificationStatus,
      confidence: record.confidence,
      tags: [...safeRecord.tags],
    });
  }

  if (selected.length === 0) {
    warnings.push('No relevant memory records found for this task.');
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    taskDescription: safeTaskDescription,
    selectionStrategy: SELECTION_STRATEGY,
    selected,
    excluded,
    warnings,
    generatedAt,
  };
}

// ─── Relevance scoring ──────────────────────────────────────

interface RelevanceResult {
  score: number;
  reason: string;
}

function computeRelevance(
  taskWords: readonly string[],
  record: MemoryRecord,
): RelevanceResult {
  if (taskWords.length === 0) {
    return { score: 0, reason: 'Empty task description.' };
  }

  const matchedTags: string[] = [];
  const matchedWords: string[] = [];

  // Check tag matches
  for (const tag of record.tags) {
    const normalizedTag = tag.toLowerCase();
    for (const word of taskWords) {
      if (normalizedTag.includes(word) || word.includes(normalizedTag)) {
        matchedTags.push(tag);
        break;
      }
    }
  }

  // Check statement word matches
  const statementWords = extractWords(record.statement);
  for (const word of taskWords) {
    for (const sWord of statementWords) {
      if (sWord === word || sWord.includes(word) || word.includes(sWord)) {
        matchedWords.push(word);
        break;
      }
    }
  }

  const score = matchedTags.length * 2 + matchedWords.length;
  if (score === 0) {
    return { score: 0, reason: '' };
  }

  const reasons: string[] = [];
  if (matchedTags.length > 0) {
    reasons.push(`tag match: ${matchedTags.join(', ')}`);
  }
  if (matchedWords.length > 0) {
    reasons.push(`word match: ${matchedWords.join(', ')}`);
  }

  return {
    score,
    reason: `Lexical selection: ${reasons.join('; ')}.`,
  };
}

function extractWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

// ─── Formatters ─────────────────────────────────────────────

export function formatContextAsJson(pack: ContextPack): string {
  return JSON.stringify(pack, null, 2);
}

export function formatContextAsMarkdown(pack: ContextPack): string {
  const lines: string[] = [];

  lines.push('# Context Pack');
  lines.push('');
  lines.push(`**Task:** ${pack.taskDescription}`);
  lines.push(`**Strategy:** ${pack.selectionStrategy}`);
  lines.push(`**Generated:** ${pack.generatedAt}`);
  lines.push('');

  if (pack.selected.length > 0) {
    lines.push('## Selected Memories');
    lines.push('');
    for (const sel of pack.selected) {
      lines.push(`### ${sel.memoryId}`);
      lines.push('');
      lines.push(`- **Statement:** ${sel.statement}`);
      lines.push(`- **Status:** ${sel.verificationStatus}`);
      lines.push(`- **Confidence:** ${sel.confidence}`);
      lines.push(`- **Audit:** ${sel.auditOutcome}`);
      lines.push(`- **Reason:** ${sel.reason}`);
      lines.push(`- **Tags:** ${sel.tags.join(', ')}`);
      lines.push('');
    }
  }

  if (pack.excluded.length > 0) {
    lines.push('## Excluded Memories');
    lines.push('');
    for (const excl of pack.excluded) {
      lines.push(`- **${excl.memoryId}:** ${excl.reason}`);
    }
    lines.push('');
  }

  if (pack.warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const warning of pack.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
