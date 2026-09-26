import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { getAdapter } from '../src/adapters/registry.js';
import { compileContext } from '../src/core/context.js';
import { initTamhees } from '../src/core/store.js';
import {
  CURRENT_SCHEMA_VERSION,
  fixedClock,
  type MemoryRecord,
} from '../src/core/types.js';
import { validateContextPack } from '../src/core/validation.js';
import { McpSession } from '../src/mcp/protocol.js';
import { createMcpTools, MCP_TOOL_NAMES } from '../src/mcp/tools.js';

const NOW = '2026-07-22T12:00:00.000Z';
const clock = fixedClock(NOW);
const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) await rm(roots.pop()!, { recursive: true, force: true });
});

function memory(id: string, statement: string, overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    scope: { kind: 'PROJECT' },
    kind: 'DECISION',
    statement,
    source: { type: 'REPOSITORY_STATE', reference: 'owner verification fixture' },
    verificationStatus: 'REPO_VERIFIED',
    confidence: 'HIGH',
    freshness: { lastVerified: NOW },
    sensitivity: 'INTERNAL',
    actionPermission: 'MAY_ACT',
    relationships: {},
    tags: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('Owner verification: positive relevance eligibility', () => {
  it('excludes unrelated owner-confirmed, fresh TRUST, and repository-verified records', () => {
    const pack = compileContext('quantum horticulture', [
      memory('DM-REL-OWNER', 'Release approval policy.', {
        source: { type: 'OWNER_INSTRUCTION', reference: 'owner direction' },
        verificationStatus: 'OWNER_CONFIRMED',
      }),
      memory('DM-REL-FRESH', 'Current compiler configuration.'),
      memory('DM-REL-REPO', 'Repository adapter registry.'),
    ], clock);
    assert.deepEqual(pack.selected, []);
    assert.deepEqual(pack.excluded.map((item) => item.reasonCode), ['irrelevant', 'irrelevant', 'irrelevant']);
    assert.equal(pack.budget.estimatedTokensUsed, 0);
    assert.equal(pack.budget.estimatedTokensRemaining, pack.budget.maxTokens);
    assert.equal(validateContextPack(pack).valid, true);
  });

  it('selects a relevant lower-authority record over unrelated higher-authority records', () => {
    const pack = compileContext('quantum horticulture', [
      memory('DM-REL-LOW', 'Quantum horticulture field notes.', {
        source: { type: 'AGENT_INFERENCE', reference: 'local inference' },
        verificationStatus: 'INFERRED',
        confidence: 'LOW',
        actionPermission: 'ACT_WITH_CAUTION',
      }),
      memory('DM-REL-HIGH-A', 'Owner release policy.', {
        source: { type: 'OWNER_INSTRUCTION', reference: 'owner direction' },
        verificationStatus: 'OWNER_CONFIRMED',
      }),
      memory('DM-REL-HIGH-B', 'Repository compiler policy.'),
    ], clock);
    assert.deepEqual(pack.selected.map((item) => item.memoryId), ['DM-REL-LOW']);
    assert.ok(pack.selected[0]!.ranking.relevance.score > 0);
    assert.deepEqual(pack.excluded.map((item) => item.memoryId), ['DM-REL-HIGH-A', 'DM-REL-HIGH-B']);
  });

  it('matches Unicode and case variants while counting duplicate normalized tags once', () => {
    const pack = compileContext('تحقق ذاكرة RETRIEVAL', [
      memory('DM-REL-UNICODE', 'تحقق ذاكرة المشروع.', { tags: ['Retrieval', 'RETRIEVAL', 'retrieval'] }),
    ], clock);
    assert.equal(pack.selected.length, 1);
    assert.equal(pack.selected[0]!.ranking.relevance.matchedTagCount, 1);
    assert.equal(pack.selected[0]!.ranking.relevance.matchedWordCount, 2);
  });

  it('does not treat common words or substrings as task relevance', () => {
    const pack = compileContext('use the project cat', [
      memory('DM-REL-COMMON', 'This project uses a compiler.', { tags: ['project'] }),
      memory('DM-REL-SUBSTRING', 'Concatenate release artifacts.', { tags: ['catalogue'] }),
    ], clock);
    assert.deepEqual(pack.selected, []);
    assert.ok(pack.excluded.every((item) => item.reasonCode === 'irrelevant'));
  });

  it('returns an explained valid empty pack without spending budget when all records are irrelevant', () => {
    const pack = compileContext('quantum horticulture', [
      memory('DM-REL-EMPTY-A', 'TypeScript compiler configuration.'),
      memory('DM-REL-EMPTY-B', 'Release upload instructions.'),
    ], clock, [], { maxTokens: 17 });
    assert.equal(pack.selected.length, 0);
    assert.equal(pack.budget.estimatedTokensUsed, 0);
    assert.equal(pack.budget.estimatedTokensRemaining, 17);
    assert.ok(pack.warnings.some((warning) => warning.includes('No memory records fit')));
    assert.ok(pack.excluded.every((item) => item.reason.includes('No lexical or tag match')));
    assert.equal(validateContextPack(pack).valid, true);
  });

  it('rejects a context pack that declares a selected zero-relevance record', () => {
    const pack = structuredClone(compileContext('retrieval', [
      memory('DM-REL-VALIDATE', 'Retrieval guidance.', { tags: ['retrieval'] }),
    ], clock));
    const selected = pack.selected[0]!;
    (selected.ranking.relevance as { score: number; matchedTagCount: number; matchedWordCount: number }).score = 0;
    (selected.ranking.relevance as { score: number; matchedTagCount: number; matchedWordCount: number }).matchedTagCount = 0;
    (selected.ranking.relevance as { score: number; matchedTagCount: number; matchedWordCount: number }).matchedWordCount = 0;
    (selected.ranking as { totalScore: number }).totalScore =
      selected.ranking.authority.score + selected.ranking.freshness.score + selected.ranking.safety.score;
    const result = validateContextPack(pack);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.code === 'UNSAFE_SELECTION' && issue.field.endsWith('relevance.score')));
  });

  it('preserves empty irrelevant retrieval through every shared adapter', async () => {
    for (const name of ['codex', 'antigravity', 'claude', 'generic', 'mcp'] as const) {
      const project = await mkdtemp(join(tmpdir(), `dm-rel-${name}-`));
      roots.push(project);
      assert.equal((await initTamhees(project, clock)).success, true);
      const result = await getAdapter(name).begin(
        project,
        'quantum horticulture',
        { maxTokens: 64 },
        { clock, idGenerator: () => `lc-${name}` },
      );
      assert.equal(result.success, true);
      assert.deepEqual(result.contextPack!.selected, []);
      assert.equal(result.contextPack!.budget.estimatedTokensUsed, 0);
    }
  });

  it('preserves empty irrelevant retrieval through the MCP begin tool', async () => {
    const project = await mkdtemp(join(tmpdir(), 'dm-rel-mcp-'));
    roots.push(project);
    assert.equal((await initTamhees(project, clock)).success, true);
    const session = new McpSession(createMcpTools(project));
    const init = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'owner-verification', version: '1.0.0' },
      },
    });
    await session.receiveLine(init);
    await session.receiveLine(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }));
    const response = JSON.parse((await session.receiveLine(JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: MCP_TOOL_NAMES[1],
        arguments: { task: 'quantum horticulture', maxTokens: 64 },
      },
    })))!) as { result: { structuredContent: { contextPack: { selected: unknown[]; budget: { estimatedTokensUsed: number } } } } };
    assert.deepEqual(response.result.structuredContent.contextPack.selected, []);
    assert.equal(response.result.structuredContent.contextPack.budget.estimatedTokensUsed, 0);
  });
});
