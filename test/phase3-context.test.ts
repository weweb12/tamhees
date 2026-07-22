import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  compileContext, estimateSelectedMemoryTokens, estimateTextTokens,
  formatContextAsJson, formatContextAsMarkdown,
} from '../src/core/context.js';
import {
  CONTEXT_EXCLUSION_REASONS, CURRENT_SCHEMA_VERSION, DEFAULT_CONTEXT_MAX_TOKENS,
  MAX_CONTEXT_MAX_TOKENS, TOKEN_ESTIMATOR_NAME, TOKEN_ESTIMATOR_VERSION,
  fixedClock, type MemoryRecord,
} from '../src/core/types.js';
import { initGptbrain } from '../src/core/store.js';
import { validateContextPack } from '../src/core/validation.js';
import { STORAGE_DIR } from '../src/core/identity.js';

const execFileAsync = promisify(execFile);
const NOW = '2026-07-22T12:00:00.000Z';
const clock = fixedClock(NOW);
const CLI_PATH = resolve('dist/src/cli.js');

function memory(id: string, overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    kind: 'DECISION',
    statement: 'Retrieval guidance for local project memory.',
    source: { type: 'REPOSITORY_STATE', reference: 'docs/ARCHITECTURE.md' },
    verificationStatus: 'REPO_VERIFIED',
    confidence: 'HIGH',
    freshness: { lastVerified: NOW },
    sensitivity: 'INTERNAL',
    actionPermission: 'MAY_ACT',
    relationships: {},
    tags: ['retrieval'],
    recheckMethod: 'Inspect the current local repository.',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function ids(records: readonly MemoryRecord[], task = 'retrieval'): readonly string[] {
  return compileContext(task, records, clock).selected.map((item) => item.memoryId);
}

describe('Phase 3 deterministic ranking', () => {
  it('orders by relevance, authority, and freshness', () => {
    const relLow = memory('DM-MEM-P3-REL-B', { statement: 'Generic project guidance.' });
    const relHigh = memory('DM-MEM-P3-REL-A', {
      statement: 'Retrieval ranking explains retrieval.',
      tags: ['retrieval', 'ranking'],
    });
    assert.deepEqual(ids([relLow, relHigh], 'retrieval ranking'), [relHigh.id, relLow.id]);
    const testVerified = memory('DM-MEM-P3-AUTH-A', {
      source: { type: 'TEST_RESULT', reference: 'test/phase3-context.test.ts' },
      verificationStatus: 'TEST_VERIFIED',
    });
    const repoVerified = memory('DM-MEM-P3-AUTH-Z');
    assert.deepEqual(ids([testVerified, repoVerified]), [repoVerified.id, testVerified.id]);
    const old = memory('DM-MEM-P3-FRESH-A', { freshness: { lastVerified: '2026-05-20T12:00:00.000Z' } });
    const current = memory('DM-MEM-P3-FRESH-Z');
    assert.deepEqual(ids([old, current]), [current.id, old.id]);
  });

  it('counts each normalized tag and task or statement term at most once', () => {
    const record = memory('DM-MEM-P3-UNIQUE-TERMS', {
      statement: 'Retrieval retrieval RETRIEVAL guidance.',
      tags: ['retrieval', 'Retrieval', 'RETRIEVAL'],
    });
    const item = compileContext('retrieval retrieval RETRIEVAL', [record], clock).selected[0]!;
    assert.equal(item.ranking.relevance.matchedTagCount, 1);
    assert.equal(item.ranking.relevance.matchedWordCount, 1);
    assert.equal(item.ranking.relevance.score, 30);
  });
  it('uses ordinal ID tie-breaking and produces byte-equivalent output', () => {
    const z = memory('DM-MEM-P3-TIE-Z');
    const a = memory('DM-MEM-P3-TIE-A');
    assert.deepEqual(ids([z, a]), [a.id, z.id]);
    const first = formatContextAsJson(compileContext('retrieval', [z, a], clock, [], { maxTokens: 500 }));
    const second = formatContextAsJson(compileContext('retrieval', [a, z], clock, [], { maxTokens: 500 }));
    assert.equal(first, second);
  });

  it('ranks TRUST above RECHECK and warns for ASK_OWNER and RECHECK', () => {
    const recheck = memory('DM-MEM-P3-SAFE-A', { actionPermission: 'ACT_WITH_CAUTION' });
    const trust = memory('DM-MEM-P3-SAFE-Z');
    const ask = memory('DM-MEM-P3-ASK', { actionPermission: 'ASK_BEFORE_CHANGE' });
    const pack = compileContext('retrieval', [recheck, trust, ask], clock);
    assert.equal(pack.selected[0]!.memoryId, trust.id);
    assert.ok(pack.selected.find((item) => item.memoryId === recheck.id)!.ranking.safety.score
      < pack.selected[0]!.ranking.safety.score);
    assert.ok(pack.warnings.some((warning) => warning.includes(recheck.id) && warning.includes('RECHECK')));
    assert.ok(pack.warnings.some((warning) => warning.includes(ask.id) && warning.includes('ASK_OWNER')));
  });

  it('emits complete structured and plain-language explanations', () => {
    const item = compileContext('retrieval', [memory('DM-MEM-P3-EXPLAIN')], clock).selected[0]!;
    assert.ok(item.reason.length > 0 && item.estimatedTokens > 0);
    assert.equal(item.rank, 1);
    assert.equal(item.ranking.tieBreakerMemoryId, item.memoryId);
    assert.equal(item.ranking.totalScore,
      item.ranking.relevance.score + item.ranking.authority.score
      + item.ranking.freshness.score + item.ranking.safety.score);
  });
});

describe('Phase 3 exclusions and privacy', () => {
  it('controls all safety and relevance exclusion reasons', () => {
    const pack = compileContext('retrieval', [
      memory('DM-MEM-P3-BLOCKED', { actionPermission: 'MUST_NOT_ACT' }),
      memory('DM-MEM-P3-REVOKED', { verificationStatus: 'REVOKED' }),
      memory('DM-MEM-P3-CONFLICTED', { verificationStatus: 'CONFLICTED' }),
      memory('DM-MEM-P3-EXPIRED', { freshness: { lastVerified: NOW, expiresAfter: '2026-07-22T11:00:00.000Z' } }),
      memory('DM-MEM-P3-REDACTED', { sensitivity: 'SECRET', statement: 'Restricted placeholder.' }),
      memory('DM-MEM-P3-IRRELEVANT', { statement: 'Compiler note.', tags: ['compiler'] }),
    ], clock);
    const reasons = [...new Map(pack.excluded.map((item) => [item.memoryId, item.reasonCode])).values()].sort();
    assert.deepEqual(reasons, ['blocked', 'conflicted', 'expired', 'irrelevant', 'redacted', 'revoked'].sort());
    for (const item of pack.excluded) {
      assert.ok(CONTEXT_EXCLUSION_REASONS.includes(item.reasonCode));
      assert.ok(item.reason.length > 0);
    }
  });

  it('does not let high confidence override blocked permission', () => {
    const pack = compileContext('retrieval', [
      memory('DM-MEM-P3-HIGH-BLOCK', { confidence: 'HIGH', actionPermission: 'MUST_NOT_ACT' }),
    ], clock);
    assert.equal(pack.selected.length, 0);
    assert.equal(pack.excluded[0]!.reasonCode, 'blocked');
  });

  it('redacts secret-like task input and prevents retrieval influence', () => {
    const fakeSecret = 'api_key=dm_example_secret_9988776655';
    const record = memory('DM-MEM-P3-TASK-SECRET', {
      statement: 'dm_example_secret_9988776655 deployment note.',
      tags: ['deployment'],
    });
    const pack = compileContext('deployment ' + fakeSecret, [record], clock);
    const output = JSON.stringify(pack);
    assert.ok(pack.taskDescription.startsWith('[REDACTED'));
    assert.equal(pack.selected.length, 0);
    assert.ok(!output.includes(fakeSecret) && !output.includes('9988776655'));
  });

  it('redacts SENSITIVE and secret-like record content everywhere', () => {
    const raw = 'Private launch detail for northwind.';
    const sensitive = memory('DM-MEM-P3-SENSITIVE', {
      statement: raw,
      sensitivity: 'SENSITIVE',
      tags: ['retrieval', 'northwind-private'],
    });
    const fakeSecret = 'api_key=dm_example_secret_2233445566';
    const secretLike = memory('DM-MEM-P3-RECORD-SECRET', { statement: fakeSecret });
    const pack = compileContext('retrieval northwind', [sensitive, secretLike], clock);
    const output = JSON.stringify(pack);
    assert.equal(pack.selected[0]!.statement, '[REDACTED — SENSITIVE content]');
    assert.deepEqual(pack.selected[0]!.tags, ['redacted']);
    assert.equal(pack.excluded.find((item) => item.memoryId === secretLike.id)!.reasonCode, 'redacted');
    assert.ok(!output.includes(raw) && !output.includes('northwind-private') && !output.includes(fakeSecret));
  });
});

describe('Phase 3 hard budget', () => {
  it('uses deterministic UTF-8-byte estimates including multibyte text', () => {
    assert.deepEqual(
      ['abcd', 'abcde', 'é', '😀', '😀a'].map(estimateTextTokens),
      [1, 2, 1, 1, 2],
    );
    assert.equal(estimateTextTokens('😀a'), estimateTextTokens('😀a'));
  });

  it('exactly meets a budget and reports estimator metadata and arithmetic', () => {
    const record = memory('DM-MEM-P3-BUDGET-EXACT');
    const exact = compileContext('retrieval', [record], clock).selected[0]!.estimatedTokens;
    const pack = compileContext('retrieval', [record], clock, [], { maxTokens: exact });
    assert.equal(pack.selected.length, 1);
    assert.deepEqual(
      [pack.budget.estimatedTokensUsed, pack.budget.estimatedTokensRemaining, pack.budget.compliant],
      [exact, 0, true],
    );
    assert.deepEqual(pack.budget.estimator, { name: TOKEN_ESTIMATOR_NAME, version: TOKEN_ESTIMATOR_VERSION });
  });

  it('returns a valid explained empty pack one token below a full unit', () => {
    const record = memory('DM-MEM-P3-BUDGET-BELOW');
    const required = compileContext('retrieval', [record], clock).selected[0]!.estimatedTokens;
    const pack = compileContext('retrieval', [record], clock, [], { maxTokens: required - 1 });
    assert.equal(pack.selected.length, 0);
    assert.equal(pack.excluded[0]!.reasonCode, 'over-budget');
    assert.ok(pack.excluded[0]!.reason.includes('never truncated'));
    assert.ok(pack.warnings.some((warning) => warning.includes('No memory records fit')));
    assert.equal(validateContextPack(pack).valid, true);
  });

  it('selects deterministic prefixes for multiple budgets and marks lower ranks over-budget', () => {
    const records = [
      memory('DM-MEM-P3-MULTI-A', { statement: 'Retrieval ranking alpha.', tags: ['retrieval', 'ranking'] }),
      memory('DM-MEM-P3-MULTI-B', { statement: 'Retrieval beta.' }),
      memory('DM-MEM-P3-MULTI-C', { statement: 'Retrieval gamma.' }),
    ];
    const full = compileContext('retrieval ranking', records, clock, [], { maxTokens: 10000 });
    const one = full.selected[0]!.estimatedTokens;
    const two = one + full.selected[1]!.estimatedTokens;
    const small = compileContext('retrieval ranking', records, clock, [], { maxTokens: one });
    assert.equal(small.selected.length, 1);
    assert.ok(small.excluded.slice(-2).every((item) => item.reasonCode === 'over-budget'));
    assert.equal(compileContext('retrieval ranking', records, clock, [], { maxTokens: two }).selected.length, 2);
    assert.equal(full.selected.length, 3);
    assert.ok(small.budget.estimatedTokensUsed <= small.budget.maxTokens);
  });

  it('reports canonical contributions and never truncates a long statement', () => {
    const statement = 'Retrieval ' + 'x'.repeat(12000);
    const pack = compileContext('retrieval', [
      memory('DM-MEM-P3-LONG', { statement }),
      memory('DM-MEM-P3-ESTIMATE'),
    ], clock, [], { maxTokens: 10000 });
    for (const item of pack.selected) {
      assert.equal(item.estimatedTokens, estimateSelectedMemoryTokens(item));
    }
    assert.equal(pack.budget.estimatedTokensUsed,
      pack.selected.reduce((sum, item) => sum + item.estimatedTokens, 0));
    assert.equal(pack.selected.find((item) => item.memoryId === 'DM-MEM-P3-LONG')!.statement, statement);
  });

  it('rejects invalid programmatic budgets and uses the safe default', () => {
    const record = memory('DM-MEM-P3-BUDGET-INVALID');
    for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_CONTEXT_MAX_TOKENS + 1]) {
      assert.throws(() => compileContext('retrieval', [record], clock, [], { maxTokens: value }), RangeError);
    }
    assert.equal(compileContext('retrieval', [record], clock).budget.maxTokens, DEFAULT_CONTEXT_MAX_TOKENS);
  });
});

describe('Phase 3 context contract', () => {
  it('validates JSON and formats ranking, budget, and exclusion diagnostics', () => {
    const selected = memory('DM-MEM-P3-FORMAT');
    const irrelevant = memory('DM-MEM-P3-FORMAT-X', { tags: ['compiler'], statement: 'Compiler note.' });
    const pack = compileContext('retrieval', [selected, irrelevant], clock);
    assert.equal(validateContextPack(JSON.parse(formatContextAsJson(pack))).valid, true);
    const markdown = formatContextAsMarkdown(pack);
    for (const marker of ['## Budget', '## Selected Memories', '## Excluded Memories', 'Rank score', TOKEN_ESTIMATOR_NAME]) {
      assert.ok(markdown.includes(marker));
    }
  });

  it('rejects malformed budget metadata and arithmetic', () => {
    const valid = clone(compileContext('retrieval', [memory('DM-MEM-P3-VALID-BUDGET')], clock));
    const pack = { ...valid, budget: { ...valid.budget, estimatedTokensUsed: 999999, compliant: false } };
    const issues = validateContextPack(pack).issues;
    assert.ok(issues.some((item) => item.code === 'INVALID_ARITHMETIC' || item.code === 'BUDGET_VIOLATION'));
  });

  it('rejects drift in every documented ranking component and unsafe selected outcomes', () => {
    const valid = clone(compileContext('retrieval', [memory('DM-MEM-P3-FORMULA')], clock));

    const relevance = clone(valid) as unknown as { selected: Array<{ ranking: { relevance: { score: number }; totalScore: number } }> };
    relevance.selected[0]!.ranking.relevance.score += 1;
    relevance.selected[0]!.ranking.totalScore += 1;
    assert.ok(validateContextPack(relevance).issues.some((item) => item.field.endsWith('relevance.score') && item.code === 'INVALID_ARITHMETIC'));

    const authority = clone(valid) as unknown as { selected: Array<{ ranking: { authority: { score: number }; totalScore: number } }> };
    authority.selected[0]!.ranking.authority.score += 1;
    authority.selected[0]!.ranking.totalScore += 1;
    assert.ok(validateContextPack(authority).issues.some((item) => item.field.endsWith('authority.score') && item.code === 'INVALID_ARITHMETIC'));

    const freshness = clone(valid) as unknown as { selected: Array<{ ranking: { freshness: { ageDays: number } } }> };
    freshness.selected[0]!.ranking.freshness.ageDays += 1;
    assert.ok(validateContextPack(freshness).issues.some((item) => item.field.endsWith('freshness.ageDays') && item.code === 'INVALID_ARITHMETIC'));

    const safety = clone(valid) as unknown as { selected: Array<{ ranking: { safety: { score: number }; totalScore: number } }> };
    safety.selected[0]!.ranking.safety.score += 1;
    safety.selected[0]!.ranking.totalScore += 1;
    assert.ok(validateContextPack(safety).issues.some((item) => item.field.endsWith('safety.score') && item.code === 'INVALID_ARITHMETIC'));

    const blocked = clone(valid) as unknown as { selected: Array<{ auditOutcome: string; ranking: { safety: { auditOutcome: string; score: number }; totalScore: number } }> };
    blocked.selected[0]!.auditOutcome = 'BLOCK_ACTION';
    blocked.selected[0]!.ranking.safety.auditOutcome = 'BLOCK_ACTION';
    blocked.selected[0]!.ranking.totalScore -= blocked.selected[0]!.ranking.safety.score;
    blocked.selected[0]!.ranking.safety.score = 0;
    assert.ok(validateContextPack(blocked).issues.some((item) => item.code === 'UNSAFE_SELECTION'));
  });

  it('recomputes each canonical payload estimate instead of trusting reported token counts', () => {
    const valid = clone(compileContext('retrieval', [memory('DM-MEM-P3-ESTIMATE-VALIDATION')], clock));
    const underreported = {
      ...valid,
      selected: valid.selected.map((item) => ({ ...item, estimatedTokens: 1 })),
      budget: {
        ...valid.budget,
        estimatedTokensUsed: 1,
        estimatedTokensRemaining: valid.budget.maxTokens - 1,
        compliant: true,
      },
    };
    const result = validateContextPack(underreported);
    assert.ok(result.issues.some((item) => item.field.endsWith('estimatedTokens') && item.code === 'INVALID_ARITHMETIC'));
  });
  it('rejects score-order and ordinal tie-break drift', () => {
    const high = memory('DM-MEM-P3-ORDER-HIGH', { tags: ['retrieval', 'ranking'] });
    const low = memory('DM-MEM-P3-ORDER-LOW');
    const scoreOrder = clone(compileContext('retrieval ranking', [low, high], clock)) as unknown as { selected: Array<{ rank: number }> };
    scoreOrder.selected.reverse();
    scoreOrder.selected.forEach((item, index) => { item.rank = index + 1; });
    assert.ok(validateContextPack(scoreOrder).issues.some((item) => item.code === 'INVALID_RANK'));

    const tieA = memory('DM-MEM-P3-ORDER-A');
    const tieB = memory('DM-MEM-P3-ORDER-B');
    const tieOrder = clone(compileContext('retrieval', [tieA, tieB], clock)) as unknown as { selected: Array<{ rank: number }> };
    tieOrder.selected.reverse();
    tieOrder.selected.forEach((item, index) => { item.rank = index + 1; });
    assert.ok(validateContextPack(tieOrder).issues.some((item) => item.code === 'INVALID_RANK'));
  });

  it('rejects duplicate IDs and selected/excluded overlap', () => {
    const validDuplicate = clone(compileContext('retrieval', [memory('DM-MEM-P3-DUP')], clock));
    const original = validDuplicate.selected[0]!;
    const duplicate = { ...original, rank: 2 };
    const duplicatePack = {
      ...validDuplicate,
      selected: [...validDuplicate.selected, duplicate],
      budget: {
        ...validDuplicate.budget,
        estimatedTokensUsed: validDuplicate.budget.estimatedTokensUsed + duplicate.estimatedTokens,
        estimatedTokensRemaining: validDuplicate.budget.estimatedTokensRemaining - duplicate.estimatedTokens,
      },
    };
    assert.ok(validateContextPack(duplicatePack).issues.some((item) => item.code === 'DUPLICATE_ID'));
    const validOverlap = clone(compileContext('retrieval', [memory('DM-MEM-P3-OVERLAP')], clock));
    const overlapPack = {
      ...validOverlap,
      excluded: [...validOverlap.excluded, {
        memoryId: validOverlap.selected[0]!.memoryId,
        reasonCode: 'demoted',
        reason: 'Synthetic validation fixture.',
      }],
    };
    assert.ok(validateContextPack(overlapPack).issues.some((item) => item.code === 'ID_OVERLAP'));
  });

  it('rejects unknown fields and unsupported reasons without echoing raw names', () => {
    const rawField = 'api_key_dm_example_secret_3344556677';
    const unknown = clone(compileContext('retrieval', [memory('DM-MEM-P3-UNKNOWN')], clock)) as unknown as Record<string, unknown>;
    unknown[rawField] = true;
    const unknownResult = validateContextPack(unknown);
    assert.ok(unknownResult.issues.some((item) => item.code === 'UNKNOWN_FIELD'));
    assert.ok(!JSON.stringify(unknownResult).includes(rawField));
    const controlled = clone(compileContext('unrelated', [memory('DM-MEM-P3-CONTROLLED')], clock));
    (controlled.excluded[0] as unknown as { reasonCode: string }).reasonCode = 'arbitrary';
    assert.equal(validateContextPack(controlled).valid, false);
  });
});

describe('Phase 3 CLI and ephemerality', () => {
  let projectDir: string;
  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'doubtful-memory-phase3-'));
    assert.equal((await initGptbrain(projectDir, clock)).success, true);
  });
  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('prints valid default JSON and small-budget Markdown', async () => {
    const json = await execFileAsync('node', [CLI_PATH, 'context', '--task', 'project'], { cwd: projectDir });
    const parsed = JSON.parse(json.stdout) as { budget: { maxTokens: number } };
    assert.equal(validateContextPack(parsed).valid, true);
    assert.equal(parsed.budget.maxTokens, DEFAULT_CONTEXT_MAX_TOKENS);
    const markdown = await execFileAsync(
      'node', [CLI_PATH, 'context', '--task', 'project', '--max-tokens', '1', '--format', 'markdown'],
      { cwd: projectDir },
    );
    assert.ok(markdown.stdout.includes('Maximum:** 1 estimated tokens'));
  });

  it('rejects all required invalid budget argument classes with exit 2', async () => {
    const cases = [
      ['context', '--task', 'project', '--max-tokens', '5', '--max-tokens', '6'],
      ['context', '--task', 'project', '--max-tokens'],
      ['context', '--task', 'project', '--max-tokens', '1.5'],
      ['context', '--task', 'project', '--max-tokens', '0'],
      ['context', '--task', 'project', '--max-tokens', '-1'],
      ['context', '--task', 'project', '--max-tokens', 'NaN'],
      ['context', '--task', 'project', '--max-tokens', String(MAX_CONTEXT_MAX_TOKENS + 1)],
      ['context', '--task', 'project', '--unknown', '1'],
    ];
    for (const cliArgs of cases) {
      await assert.rejects(
        execFileAsync('node', [CLI_PATH, ...cliArgs], { cwd: projectDir }),
        (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === 2,
      );
    }
  });

  it('does not persist context or alter storage', async () => {
    const storage = join(projectDir, STORAGE_DIR);
    const before = (await readdir(storage, { recursive: true })).sort();
    await execFileAsync('node', [CLI_PATH, 'context', '--task', 'project', '--max-tokens', '10'], { cwd: projectDir });
    const after = (await readdir(storage, { recursive: true })).sort();
    assert.deepEqual(after, before);
    assert.ok(!after.some((path) => path.toLowerCase().includes('context')));
  });

  it('contains no network API usage in context or CLI code', async () => {
    const sources = [
      await readFile(resolve('src/core/context.ts'), 'utf8'),
      await readFile(resolve('src/cli.ts'), 'utf8'),
    ].join('\n');
    for (const forbidden of ['node:http', 'node:https', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'axios']) {
      assert.ok(!sources.includes(forbidden), 'Unexpected network marker: ' + forbidden);
    }
  });
});
