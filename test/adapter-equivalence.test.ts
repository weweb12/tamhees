import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { getAdapter } from '../src/adapters/registry.js';
import { CURRENT_SCHEMA_VERSION, fixedClock, type LifecycleFinalizationInput, type UpdateCandidate } from '../src/core/types.js';

const OPENED = '2026-07-22T12:00:00.000Z';
const COMPLETED = '2026-07-22T13:00:00.000Z';
const roots: string[] = [];
afterEach(async () => {
  while (roots.length > 0) await rm(roots.pop()!, { recursive: true, force: true });
});

describe('Mutating cross-adapter equivalence', () => {
  it('produces equivalent mutations, indexes, archives, lifecycle states, and safe audit references', async () => {
    const snapshots: string[] = [];
    for (const name of ['codex', 'antigravity', 'claude', 'generic', 'mcp'] as const) {
      const parent = await mkdtemp(join(tmpdir(), `dm-equivalence-${name}-`));
      roots.push(parent);
      const project = join(parent, 'identical-project');
      await mkdir(project);
      const adapter = getAdapter(name);
      const initialized = await (await import('../src/core/store.js')).initTamhees(project, fixedClock(OPENED));
      assert.equal(initialized.success, true);
      const begin = await adapter.begin(
        project,
        'adapter lifecycle observation',
        { maxTokens: 128 },
        { clock: fixedClock(OPENED), idGenerator: () => 'lc-cross-adapter' },
      );
      assert.equal(begin.success, true);
      const finalization = input();
      const finalized = await adapter.finalize(project, finalization, { clock: fixedClock(COMPLETED) });
      assert.equal(finalized.success, true);
      assert.equal(finalized.dispositions[0]!.disposition, 'APPLIED');
      snapshots.push(JSON.stringify({
        begin: {
          selected: begin.contextPack!.selected,
          excluded: begin.contextPack!.excluded,
          warnings: begin.contextPack!.warnings,
          budget: begin.contextPack!.budget,
          auditReferences: begin.auditReferences,
        },
        finalized,
        records: await jsonFiles(join(project, '.tamhees', 'memories', 'records')),
        indexes: await jsonFiles(join(project, '.tamhees', 'memories'), ['index.json']),
        archives: await tree(join(project, '.tamhees', 'archive')),
        episodes: await jsonFiles(join(project, '.tamhees', 'episodes')),
        audits: normalizeRandomEventIds(await readFile(join(project, '.tamhees', 'audits', 'history.jsonl'), 'utf8')),
      }));
    }
    assert.equal(new Set(snapshots).size, 1);
  });
});

function input(): LifecycleFinalizationInput {
  const proposal: UpdateCandidate = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    action: 'CREATE',
    proposedRecord: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: 'DM-MEM-CROSS-ADAPTER',
      scope: { kind: 'PROJECT' },
      kind: 'OBSERVATION',
      statement: 'A bounded adapter lifecycle observation.',
      source: { type: 'AGENT_INFERENCE', reference: 'controlled adapter proposal', agent: 'equivalence-agent' },
      verificationStatus: 'UNKNOWN',
      confidence: 'LOW',
      freshness: { lastVerified: OPENED },
      sensitivity: 'INTERNAL',
      actionPermission: 'ACT_WITH_CAUTION',
      relationships: {},
      tags: ['adapter', 'lifecycle'],
      recheckMethod: 'Inspect canonical local state.',
      createdAt: OPENED,
      updatedAt: OPENED,
    },
    evidence: [],
    proposedBy: 'equivalence-agent',
    authorityLevel: 'INFERRED',
    requiresOwnerApproval: false,
    reason: 'Record a bounded non-authoritative adapter observation.',
    timestamp: OPENED,
  };
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    lifecycleId: 'lc-cross-adapter',
    proposer: { type: 'AGENT', id: 'equivalence-agent' },
    proposedUpdates: [proposal],
    reason: 'Finalize equivalent adapter work.',
  };
}

async function jsonFiles(directory: string, only?: readonly string[]): Promise<Record<string, unknown>> {
  const names = only ?? (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  return Object.fromEntries(await Promise.all(names.map(async (name) => [
    name,
    JSON.parse(await readFile(join(directory, name), 'utf8')) as unknown,
  ])));
}

async function tree(directory: string): Promise<readonly string[]> {
  return (await readdir(directory, { recursive: true })).map(String).sort();
}

function normalizeRandomEventIds(value: string): string {
  return value.replace(/evt-[a-f0-9]{16}/g, 'evt-<random>');
}
