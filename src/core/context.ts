import { normalizeLegacyMemory, scopeMatches, validTaskScope } from './scope.js';
/**
 * Tamhees — deterministic Phase 3 context compiler.
 *
 * Retrieval is lexical/tag based. It is not semantic retrieval. Eligible
 * records are ranked by relevance, authority, freshness, and audit safety,
 * then selected as a highest-ranked prefix within a hard estimated-token
 * budget. Context packs are returned only and are never persisted here.
 */

import {
  CONTEXT_BUDGET_SCOPE,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_CONTEXT_MAX_TOKENS,
  MAX_CONTEXT_MAX_TOKENS,
  MIN_CONTEXT_MAX_TOKENS,
  TOKEN_ESTIMATOR_NAME,
  TOKEN_ESTIMATOR_VERSION,
  type AuditFinding,
  type AuditOutcome,
  type Clock,
  type ContextExclusion,
  type ContextExclusionReason,
  type ContextPack,
  type ContextRanking,
  type ContextSelection,
  type EvidenceRecord,
  type FreshnessRankState,
  type MemoryRecord,
  type VerificationStatus,
} from './types.js';
import { auditRecord } from './audit.js';
import { memoryForOutput, scanMemoryRecord, scanSecretLikeText } from './privacy.js';

export {
  CONTEXT_BUDGET_SCOPE,
  DEFAULT_CONTEXT_MAX_TOKENS,
  MAX_CONTEXT_MAX_TOKENS,
  MIN_CONTEXT_MAX_TOKENS,
  TOKEN_ESTIMATOR_NAME,
  TOKEN_ESTIMATOR_VERSION,
} from './types.js';

const SELECTION_STRATEGY =
  'Phase 3 deterministic audit-aware lexical/tag ranking. Eligible records require at least one exact normalized non-common task-term or tag match, then are scored by relevance, authority, freshness, and audit safety; memory ID is the final ordinal tie-breaker; a highest-ranked prefix is selected within the hard estimated-token budget.';
const DAY_MS = 86_400_000;
const COMMON_TASK_TERMS = new Set([
  'and', 'are', 'but', 'for', 'from', 'has', 'have', 'into', 'not', 'project',
  'that', 'the', 'their', 'then', 'this', 'use', 'using', 'was', 'were', 'with',
]);

export interface ContextCompileOptions {
  readonly scope?: import('./types.js').TaskScope;
  readonly maxTokens?: number | undefined;
}

interface RelevanceResult {
  readonly score: number;
  readonly matchedTagCount: number;
  readonly matchedWordCount: number;
  readonly explanation: string;
}

interface FreshnessResult {
  readonly score: number;
  readonly state: FreshnessRankState;
  readonly ageDays: number;
}

interface RankedCandidate {
  readonly record: MemoryRecord;
  readonly safeRecord: MemoryRecord;
  readonly outcome: AuditOutcome;
  readonly finding: AuditFinding | null;
  readonly ranking: ContextRanking;
  readonly relevanceExplanation: string;
}

/**
 * Compile an ephemeral context pack for a task.
 *
 * The budget applies only to the canonical selected-memory agent payload:
 * memoryId, redacted statement, auditOutcome, verificationStatus, confidence,
 * and output-safe tags. Ranking diagnostics, exclusions, warnings, and budget
 * metadata remain available but are outside the hard payload budget.
 */
export function compileContext(
  taskDescription: string,
  records: readonly MemoryRecord[],
  clock: Clock,
  evidence: readonly EvidenceRecord[] = [],
  options: ContextCompileOptions = {},
): ContextPack {
  const maxTokens = options.maxTokens ?? DEFAULT_CONTEXT_MAX_TOKENS;
  assertContextBudget(maxTokens);
  const taskScope = options.scope ?? {};
  if (!validTaskScope(taskScope)) throw new Error('Invalid task scope.');

  const taskScan = scanSecretLikeText([taskDescription]);
  const safeTaskDescription = taskScan.secretLike
    ? '[REDACTED — task description contained secret-like content]'
    : taskDescription;
  const taskWords = taskScan.secretLike ? [] : extractWords(taskDescription);
  const warnings: string[] = [];
  const excluded: ContextExclusion[] = [];
  const candidates: RankedCandidate[] = [];
  const generatedAt = clock();

  if (taskScan.secretLike) {
    warnings.push(`Task description was redacted because it matched: ${taskScan.patternIds.join(', ')}.`);
  }

  const sortedRecords = records.map(normalizeLegacyMemory).sort((left, right) => compareOrdinal(left.id, right.id));

  for (const record of sortedRecords) {
    const secretScan = scanMemoryRecord(record);
    if (record.sensitivity === 'SECRET' || record.actionPermission === 'FORGET_OR_REDACT' || secretScan.secretLike) {
      excluded.push(exclusion(record.id, 'redacted', 'Privacy policy prevents this record from appearing in context.'));
      continue;
    }
    if (record.verificationStatus === 'REVOKED' || record.relationships.supersededBy !== undefined) {
      excluded.push(exclusion(record.id, 'revoked', 'The record is revoked or superseded and cannot be served.'));
      continue;
    }

    const finding = auditRecord(record, evidence, generatedAt);
    const outcome = finding?.outcome ?? 'TRUST';
    if (outcome === 'FORGET_OR_REDACT') {
      excluded.push(exclusion(record.id, 'redacted', 'Audit policy requires forgetting or redaction.'));
      continue;
    }
    if (finding?.ruleId === 'DM-RULE-CONFLICT-001') {
      warnings.push(`Record ${record.id} is conflicted and was excluded.`);
      excluded.push(exclusion(record.id, 'conflicted', 'A material conflict prevents this record from being served.'));
      continue;
    }
    if (finding?.ruleId === 'DM-RULE-REVOKE-001') {
      excluded.push(exclusion(record.id, 'revoked', 'Audit policy identifies the record as revoked or superseded.'));
      continue;
    }
    if (finding?.ruleId === 'DM-RULE-FRESH-001') {
      excluded.push(exclusion(record.id, 'expired', 'The record is expired and must be re-verified before retrieval.'));
      continue;
    }
    if (outcome === 'BLOCK_ACTION') {
      warnings.push(`Record ${record.id} has a BLOCK_ACTION finding and was excluded.`);
      excluded.push(exclusion(record.id, 'blocked', 'blocked: audit policy blocks use of this record.'));
      continue;
    }

    if (!scopeMatches(record.scope, taskScope)) {
      excluded.push(exclusion(record.id, 'out-of-scope', 'Memory scope does not apply to the requested task.'));
      continue;
    }
    const safeRecord = memoryForOutput(record);
    const relevance = computeRelevance(taskWords, record, record.sensitivity !== 'SENSITIVE');
    if (relevance.score === 0) {
      excluded.push(exclusion(record.id, 'irrelevant', 'No lexical or tag match exists for the task description.'));
      continue;
    }

    const freshness = computeFreshness(record, generatedAt);
    const authorityScore = authorityScoreFor(record.verificationStatus);
    const safetyScore = safetyScoreFor(outcome);
    const ranking: ContextRanking = {
      relevance: {
        score: relevance.score,
        matchedTagCount: relevance.matchedTagCount,
        matchedWordCount: relevance.matchedWordCount,
      },
      authority: {
        score: authorityScore,
        verificationStatus: record.verificationStatus,
      },
      freshness: {
        score: freshness.score,
        state: freshness.state,
        ageDays: freshness.ageDays,
        lastVerified: record.freshness.lastVerified,
      },
      safety: {
        score: safetyScore,
        auditOutcome: outcome,
        eligible: true,
      },
      totalScore: relevance.score + authorityScore + freshness.score + safetyScore,
      tieBreakerMemoryId: record.id,
    };
    candidates.push({ record, safeRecord, outcome, finding, ranking, relevanceExplanation: relevance.explanation });
  }

  candidates.sort((left, right) => {
    const scoreDifference = right.ranking.totalScore - left.ranking.totalScore;
    return scoreDifference !== 0
      ? scoreDifference
      : compareOrdinal(left.record.id, right.record.id);
  });

  const selected: ContextSelection[] = [];
  let estimatedTokensUsed = 0;
  let budgetExhausted = false;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    const rank = index + 1;
    const reason = selectionReason(candidate) + ' Scope: ' + JSON.stringify(candidate.safeRecord.scope) + '.';
    const selectedWithoutEstimate = {
      scope: candidate.safeRecord.scope,
      memoryId: candidate.record.id,
      statement: candidate.safeRecord.statement,
      reason,
      auditOutcome: candidate.outcome,
      verificationStatus: candidate.record.verificationStatus,
      confidence: candidate.record.confidence,
      tags: [...candidate.safeRecord.tags],
      rank,
      ranking: candidate.ranking,
    };
    const estimatedTokens = estimateSelectedMemoryTokens(selectedWithoutEstimate);

    if (budgetExhausted || estimatedTokensUsed + estimatedTokens > maxTokens) {
      budgetExhausted = true;
      excluded.push(exclusion(
        candidate.record.id,
        'over-budget',
        `The record ranked ${rank} but its complete ${estimatedTokens}-token estimated payload would exceed the ${maxTokens}-token budget; statements are never truncated.`,
      ));
      continue;
    }

    const selection: ContextSelection = { ...selectedWithoutEstimate, estimatedTokens };
    selected.push(selection);
    estimatedTokensUsed += estimatedTokens;
    if (candidate.outcome === 'ASK_OWNER') {
      warnings.push(`Record ${candidate.record.id} is included with an ASK_OWNER warning and ranking penalty.`);
    } else if (candidate.outcome === 'RECHECK') {
      warnings.push(`Record ${candidate.record.id} is included with a RECHECK warning and ranking penalty.`);
    }
  }

  if (selected.length === 0) {
    warnings.push('No memory records fit the safety, relevance, and budget requirements for this task.');
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    taskDescription: safeTaskDescription,
    selectionStrategy: SELECTION_STRATEGY,
    selected,
    excluded,
    warnings,
    budget: {
      maxTokens,
      estimatedTokensUsed,
      estimatedTokensRemaining: maxTokens - estimatedTokensUsed,
      compliant: estimatedTokensUsed <= maxTokens,
      estimator: { name: TOKEN_ESTIMATOR_NAME, version: TOKEN_ESTIMATOR_VERSION },
      scope: CONTEXT_BUDGET_SCOPE,
    },
    generatedAt,
  };
}

export function estimateTextTokens(text: string): number {
  return Math.max(1, Math.ceil(Buffer.byteLength(text, 'utf8') / 4));
}

export function estimateSelectedMemoryTokens(
  selection: Pick<ContextSelection, 'memoryId' | 'statement' | 'auditOutcome' | 'verificationStatus' | 'confidence' | 'tags'> & { readonly scope?: import('./types.js').MemoryScope },
): number {
  const canonicalAgentPayload = JSON.stringify({
    memoryId: selection.memoryId,
    statement: selection.statement,
    auditOutcome: selection.auditOutcome,
    verificationStatus: selection.verificationStatus,
    confidence: selection.confidence,
    tags: selection.tags,
    ...(selection.scope?.kind === 'RESTRICTED' ? { scope: selection.scope } : {}),
  });
  return estimateTextTokens(canonicalAgentPayload);
}

function assertContextBudget(maxTokens: number): void {
  if (!Number.isSafeInteger(maxTokens) || maxTokens < MIN_CONTEXT_MAX_TOKENS || maxTokens > MAX_CONTEXT_MAX_TOKENS) {
    throw new RangeError(`Context budget must be an integer from ${MIN_CONTEXT_MAX_TOKENS} through ${MAX_CONTEXT_MAX_TOKENS}.`);
  }
}

function exclusion(memoryId: string, reasonCode: ContextExclusionReason, reason: string): ContextExclusion {
  return { memoryId, reasonCode, reason };
}

function selectionReason(candidate: RankedCandidate): string {
  const auditExplanation = candidate.finding?.summary ?? 'Audit outcome is TRUST.';
  return `${candidate.relevanceExplanation} Authority score ${candidate.ranking.authority.score}; freshness score ${candidate.ranking.freshness.score}; safety score ${candidate.ranking.safety.score}. ${auditExplanation}`;
}

function computeRelevance(
  taskWords: readonly string[],
  record: MemoryRecord,
  includeStatement: boolean,
): RelevanceResult {
  if (taskWords.length === 0) {
    return { score: 0, matchedTagCount: 0, matchedWordCount: 0, explanation: 'No safe task terms were available.' };
  }

  let matchedTagCount = 0;
  let matchedWordCount = 0;
  const normalizedTags = [...new Set(record.tags.map(normalizeTerm))]
    .filter((tag) => tag.length > 2 && !COMMON_TASK_TERMS.has(tag))
    .sort(compareOrdinal);
  for (const normalizedTag of normalizedTags) {
    if (taskWords.some((word) => termsMatch(normalizedTag, word))) matchedTagCount += 1;
  }
  if (includeStatement) {
    const statementWords = extractWords(record.statement);
    for (const word of taskWords) {
      if (statementWords.some((statementWord) => termsMatch(statementWord, word))) matchedWordCount += 1;
    }
  }

  const score = matchedTagCount * 20 + matchedWordCount * 10;
  const explanation = record.sensitivity === 'SENSITIVE'
    ? `Lexical relevance score ${score} from ${matchedTagCount} output-safe metadata match(es); sensitive values are withheld.`
    : `Lexical relevance score ${score} from ${matchedTagCount} tag match(es) and ${matchedWordCount} statement-word match(es).`;
  return { score, matchedTagCount, matchedWordCount, explanation };
}

function extractWords(text: string): string[] {
  const words = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/u)
    .map(normalizeTerm)
    .filter((word) => word.length > 2 && !COMMON_TASK_TERMS.has(word));
  return [...new Set(words)].sort(compareOrdinal);
}

function termsMatch(left: string, right: string): boolean {
  return left === right;
}

function normalizeTerm(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

function authorityScoreFor(status: VerificationStatus): number {
  switch (status) {
    case 'OWNER_CONFIRMED': return 50;
    case 'REPO_VERIFIED': return 40;
    case 'TEST_VERIFIED': return 35;
    case 'OBSERVED': return 25;
    case 'INFERRED': return 10;
    case 'UNKNOWN':
    case 'CONFLICTED':
    case 'REVOKED':
      return 0;
  }
}

function safetyScoreFor(outcome: AuditOutcome): number {
  switch (outcome) {
    case 'TRUST': return 30;
    case 'ASK_OWNER': return 10;
    case 'RECHECK': return 0;
    case 'BLOCK_ACTION':
    case 'FORGET_OR_REDACT':
      return 0;
  }
}

function computeFreshness(record: MemoryRecord, now: string): FreshnessResult {
  const nowMs = Date.parse(now);
  const lastVerifiedMs = Date.parse(record.freshness.lastVerified);
  const ageDays = Number.isFinite(nowMs) && Number.isFinite(lastVerifiedMs)
    ? Math.max(0, Math.floor((nowMs - lastVerifiedMs) / DAY_MS))
    : 0;
  let score = ageDays <= 7 ? 20 : ageDays <= 30 ? 15 : ageDays <= 90 ? 10 : ageDays <= 365 ? 5 : 0;
  let state: FreshnessRankState = 'CURRENT';

  const expiresMs = record.freshness.expiresAfter === undefined
    ? Number.NaN
    : Date.parse(record.freshness.expiresAfter);
  if (Number.isFinite(expiresMs) && Number.isFinite(nowMs) && expiresMs <= nowMs) {
    return { score: 0, state: 'EXPIRED', ageDays };
  }
  if (record.freshness.reviewAfter !== undefined) {
    const reviewMs = Date.parse(record.freshness.reviewAfter);
    if (!Number.isFinite(reviewMs)) {
      state = 'CONDITIONAL';
      score = Math.max(0, score - 10);
    } else if (Number.isFinite(nowMs) && reviewMs <= nowMs) {
      state = 'DUE';
      score = Math.max(0, score - 10);
    }
  }
  return { score, state, ageDays };
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function formatContextAsJson(pack: ContextPack): string {
  return JSON.stringify(pack, null, 2);
}

export function formatContextAsMarkdown(pack: ContextPack): string {
  const lines: string[] = [
    '# Context Pack',
    '',
    `**Task:** ${pack.taskDescription}`,
    `**Strategy:** ${pack.selectionStrategy}`,
    `**Generated:** ${pack.generatedAt}`,
    '',
    '## Budget',
    '',
    `- **Maximum:** ${pack.budget.maxTokens} estimated tokens`,
    `- **Used:** ${pack.budget.estimatedTokensUsed} estimated tokens`,
    `- **Remaining:** ${pack.budget.estimatedTokensRemaining} estimated tokens`,
    `- **Compliant:** ${pack.budget.compliant}`,
    `- **Estimator:** ${pack.budget.estimator.name} v${pack.budget.estimator.version}`,
    `- **Scope:** ${pack.budget.scope}`,
    '',
  ];

  if (pack.selected.length > 0) {
    lines.push('## Selected Memories', '');
    for (const selection of pack.selected) {
      lines.push(
        `### ${selection.rank}. ${selection.memoryId}`,
        '',
        `- **Statement:** ${selection.statement}`,
        `- **Status:** ${selection.verificationStatus}`,
        `- **Confidence:** ${selection.confidence}`,
        `- **Audit:** ${selection.auditOutcome}`,
        `- **Estimated contribution:** ${selection.estimatedTokens} tokens`,
        `- **Rank score:** ${selection.ranking.totalScore}`,
        `- **Relevance:** ${selection.ranking.relevance.score}`,
        `- **Authority:** ${selection.ranking.authority.score}`,
        `- **Freshness:** ${selection.ranking.freshness.score} (${selection.ranking.freshness.state})`,
        `- **Safety:** ${selection.ranking.safety.score}`,
        `- **Reason:** ${selection.reason}`,
        `- **Tags:** ${selection.tags.join(', ')}`,
        '',
      );
    }
  }

  if (pack.excluded.length > 0) {
    lines.push('## Excluded Memories', '');
    for (const item of pack.excluded) {
      lines.push(`- **${item.memoryId}** [${item.reasonCode}]: ${item.reason}`);
    }
    lines.push('');
  }

  if (pack.warnings.length > 0) {
    lines.push('## Warnings', '');
    for (const warning of pack.warnings) lines.push(`- ${warning}`);
    lines.push('');
  }

  return lines.join('\n');
}
