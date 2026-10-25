/**
 * Dashboard memory inspector: "What does the agent remember, and how sure is it?"
 *
 * A fixed, safe fixture project and its remembered claims. The dashboard shows the
 * inspection before and after the real repository observer runs, so a visitor can watch
 * Tamhees notice which memories the project now contradicts. Pure: no file access.
 */

import { observeRecords, observationToEvidence, type Observation, type RepositoryFacts, type SkippedClaim } from '../core/observe.js';
import { inspectRecords, type InspectionReport } from '../core/quick.js';
import { CURRENT_SCHEMA_VERSION, type MemoryRecord } from '../core/types.js';

export const INSPECTOR_DEMO_NOW = '2026-10-25T09:00:00.000Z';
const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (days: number): string => new Date(Date.parse(INSPECTOR_DEMO_NOW) - days * DAY_MS).toISOString();
const ahead = (days: number): string => new Date(Date.parse(INSPECTOR_DEMO_NOW) + days * DAY_MS).toISOString();

/** What the fixture project looks like today (display copy of the facts below). */
export const INSPECTOR_REPOSITORY = {
  name: 'shop-web (safe fixture project)',
  files: ['package.json', 'pnpm-lock.yaml', 'supabase/config.toml', 'tsconfig.json', 'src/payments/webhook.ts'],
  packageManager: 'pnpm@9.1.0',
  dependencies: ['@supabase/supabase-js', 'react', 'vite', 'vitest', 'typescript'],
  scripts: ['build', 'dev', 'test'],
} as const;

const FACTS: RepositoryFacts = {
  files: new Set(['package.json', 'pnpm-lock.yaml', 'supabase/config.toml', 'tsconfig.json']),
  dependencies: new Map(INSPECTOR_REPOSITORY.dependencies.map((name) => [name, 'package.json'])),
  pyDependencies: new Map(),
  scripts: new Set(INSPECTOR_REPOSITORY.scripts),
  packageManager: 'pnpm',
  prismaProvider: null,
  composeImages: new Set(),
};

const PATHS = new Map([['src/payments/webhook.ts', true], ['src/auth/config.ts', false]]);

function memory(id: string, fields: Partial<MemoryRecord> & Pick<MemoryRecord, 'statement'>): MemoryRecord {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    scope: { kind: 'PROJECT' },
    kind: 'OBSERVATION',
    source: { type: 'REPOSITORY_STATE', reference: 'package.json (earlier session)' },
    verificationStatus: 'REPO_VERIFIED',
    confidence: 'HIGH',
    freshness: { lastVerified: ago(140), reviewAfter: ahead(40) },
    sensitivity: 'INTERNAL',
    actionPermission: 'MAY_ACT',
    relationships: {},
    tags: [],
    recheckMethod: 'Re-inspect the repository.',
    createdAt: ago(140),
    updatedAt: ago(140),
    ...fields,
  };
}

export const INSPECTOR_RECORDS: readonly MemoryRecord[] = [
  memory('DM-MEM-SHOP-001', { kind: 'DECISION', statement: 'The project uses SQLite for persistence.', tags: ['database'] }),
  memory('DM-MEM-SHOP-002', {
    statement: 'Unit tests run with Jest.',
    source: { type: 'AGENT_OBSERVATION', reference: 'test output (earlier session)', agent: 'coding-agent' },
    verificationStatus: 'OBSERVED', confidence: 'MEDIUM', actionPermission: 'ACT_WITH_CAUTION', tags: ['testing'],
  }),
  memory('DM-MEM-SHOP-003', {
    kind: 'CONVENTION', statement: 'Release builds use npm run build:legacy.', tags: ['release'],
    freshness: { lastVerified: ago(200), reviewAfter: ago(20) },
  }),
  memory('DM-MEM-SHOP-004', { statement: 'The storefront UI is built with React.', tags: ['frontend'] }),
  memory('DM-MEM-SHOP-005', {
    statement: 'The payment webhook handler lives in src/payments/webhook.ts.', tags: ['payments'],
    source: { type: 'REPOSITORY_STATE', reference: 'src/payments' },
  }),
  memory('DM-MEM-SHOP-006', {
    statement: 'Authentication settings live in src/auth/config.ts.', tags: ['auth'],
    source: { type: 'REPOSITORY_STATE', reference: 'src/auth' },
  }),
  memory('DM-MEM-SHOP-007', {
    kind: 'PREFERENCE', statement: 'The owner prefers purple interfaces for every product.', tags: ['design'],
    source: { type: 'AGENT_INFERENCE', reference: 'one earlier mockup', agent: 'coding-agent' },
    verificationStatus: 'INFERRED', confidence: 'HIGH', actionPermission: 'ASK_BEFORE_CHANGE',
    freshness: { lastVerified: ago(3), reviewAfter: ahead(27) },
  }),
  memory('DM-MEM-SHOP-008', {
    statement: 'We migrated from MySQL to Postgres last year.', tags: ['database', 'history'],
    source: { type: 'CONVERSATION_RECORD', reference: 'planning chat' }, verificationStatus: 'UNKNOWN',
    confidence: 'MEDIUM', actionPermission: 'ASK_BEFORE_CHANGE',
  }),
];

export interface InspectorView {
  readonly schemaVersion: '1.0.0';
  readonly repository: typeof INSPECTOR_REPOSITORY;
  readonly report: InspectionReport;
  readonly fixtureDisclaimer: string;
}

export interface InspectorObservation {
  readonly schemaVersion: '1.0.0';
  readonly observations: readonly Observation[];
  readonly unverifiable: readonly SkippedClaim[];
  readonly skipped: readonly SkippedClaim[];
  readonly report: InspectionReport;
}

export function getInspectorView(): InspectorView {
  return {
    schemaVersion: '1.0.0',
    repository: INSPECTOR_REPOSITORY,
    report: inspectRecords(INSPECTOR_RECORDS, [], INSPECTOR_DEMO_NOW),
    fixtureDisclaimer: 'Safe fixed fixture project. The inspection and observation run the same engine code as the tamhees inspect and tamhees observe commands.',
  };
}

export function runInspectorObservation(): InspectorObservation {
  const observed = observeRecords(INSPECTOR_RECORDS, FACTS, PATHS, INSPECTOR_DEMO_NOW);
  const evidence = observed.observations.map((item) => observationToEvidence(item, INSPECTOR_DEMO_NOW));
  return {
    schemaVersion: '1.0.0',
    observations: observed.observations,
    unverifiable: observed.unverifiable,
    skipped: observed.skipped,
    report: inspectRecords(INSPECTOR_RECORDS, evidence, INSPECTOR_DEMO_NOW),
  };
}
