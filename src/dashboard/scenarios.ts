import { AUDIT_RULES, auditRecord } from '../core/audit.js';
import { compileContext } from '../core/context.js';
import { memoryForOutput } from '../core/privacy.js';
import {
  CURRENT_SCHEMA_VERSION,
  fixedClock,
  type AuditOutcome,
  type ContextPack,
  type EvidenceRecord,
  type MemoryRecord,
} from '../core/types.js';

export const DASHBOARD_DEMO_NOW = '2026-07-24T09:00:00.000Z';
export const DASHBOARD_SCENARIO_IDS = [
  'architecture-conflict',
  'stale-memory',
  'revoked-memory',
  'agent-inference',
  'secret-redaction',
  'context-budget',
  'supported-current-fact',
] as const;

export type DashboardScenarioId = (typeof DASHBOARD_SCENARIO_IDS)[number];

interface DashboardScenarioDefinition {
  readonly id: DashboardScenarioId;
  readonly title: string;
  readonly shortTitle: string;
  readonly concept: string;
  readonly summary: string;
  readonly task: string;
  readonly primaryMemoryId: string;
  readonly records: readonly MemoryRecord[];
  readonly evidence: readonly EvidenceRecord[];
  readonly defaultMaxTokens: number;
}

export interface DashboardScenarioSummary {
  readonly id: DashboardScenarioId;
  readonly title: string;
  readonly shortTitle: string;
  readonly concept: string;
  readonly summary: string;
  readonly expectedOutcome: AuditOutcome;
  readonly defaultMaxTokens: number;
}

export interface DashboardEvidenceView {
  readonly id: string;
  readonly type: EvidenceRecord['type'];
  readonly relationship: EvidenceRecord['relationship'];
  readonly summary: string;
}

export interface DashboardMemoryView {
  readonly id: string;
  readonly kind: MemoryRecord['kind'];
  readonly statement: string;
  readonly sourceType: MemoryRecord['source']['type'];
  readonly sourceReference: string;
  readonly verificationStatus: MemoryRecord['verificationStatus'];
  readonly confidence: MemoryRecord['confidence'];
  readonly sensitivity: MemoryRecord['sensitivity'];
  readonly actionPermission: MemoryRecord['actionPermission'];
  readonly lastVerified: string;
  readonly tags: readonly string[];
}

export interface DashboardContextView {
  readonly selected: ContextPack['selected'];
  readonly excluded: ContextPack['excluded'];
  readonly warnings: ContextPack['warnings'];
  readonly budget: ContextPack['budget'];
}

export interface DashboardScenarioResult {
  readonly schemaVersion: '1.0.0';
  readonly scenario: {
    readonly id: DashboardScenarioId;
    readonly title: string;
    readonly concept: string;
    readonly summary: string;
    readonly safeFixture: true;
  };
  readonly outcome: AuditOutcome;
  readonly explanation: string;
  readonly triggeredRuleIds: readonly string[];
  readonly ruleTrace: readonly {
    readonly id: string;
    readonly description: string;
  }[];
  readonly evidenceConsidered: readonly string[];
  readonly evidence: readonly DashboardEvidenceView[];
  readonly memories: readonly DashboardMemoryView[];
  readonly permissionConsequence: string;
  readonly recommendedNextStep: string;
  readonly context: DashboardContextView;
  readonly deterministicAt: typeof DASHBOARD_DEMO_NOW;
  readonly fixtureDisclaimer: string;
}

const FIXTURE_DISCLAIMER =
  'This scenario uses safe deterministic fixture data and the same audit and context rules as the local engine.';

const TRUST_DESCRIPTION = 'Supported current records may be trusted within their recorded permission.';
const RULE_DESCRIPTIONS = new Map([
  ...AUDIT_RULES.map((rule) => [rule.id, rule.description] as const),
  ['DM-RULE-TRUST-001', TRUST_DESCRIPTION] as const,
]);

function memory(
  id: string,
  statement: string,
  overrides: Partial<MemoryRecord> = {},
): MemoryRecord {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    kind: 'DECISION',
    statement,
    source: { type: 'REPOSITORY_STATE', reference: 'Safe deterministic dashboard fixture' },
    verificationStatus: 'REPO_VERIFIED',
    confidence: 'HIGH',
    freshness: { lastVerified: '2026-07-20T09:00:00.000Z' },
    sensitivity: 'INTERNAL',
    actionPermission: 'MAY_ACT',
    relationships: {},
    tags: ['dashboard-demo'],
    createdAt: '2026-07-20T09:00:00.000Z',
    updatedAt: '2026-07-20T09:00:00.000Z',
    ...overrides,
  };
}

function evidence(
  id: string,
  memoryId: string,
  content: string,
  overrides: Partial<EvidenceRecord> = {},
): EvidenceRecord {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    type: 'REPOSITORY_STATE',
    source: 'Safe deterministic dashboard fixture',
    content,
    relationship: 'SUPPORTS',
    memoryIds: [memoryId],
    collectedAt: '2026-07-24T08:30:00.000Z',
    collectedBy: 'dashboard-fixture',
    ...overrides,
  };
}

const architectureMemory = memory(
  'DM-MEM-DEMO-001',
  'The project uses SQLite for local persistence.',
  {
    source: { type: 'OWNER_INSTRUCTION', reference: 'Initial architecture decision' },
    verificationStatus: 'OWNER_CONFIRMED',
    actionPermission: 'ASK_BEFORE_CHANGE',
    tags: ['database', 'sqlite', 'persistence'],
    freshness: { lastVerified: '2026-01-12T09:00:00.000Z' },
  },
);

const staleMemory = memory(
  'DM-MEM-DEMO-002',
  'The release build uses the legacy packaging command.',
  {
    kind: 'CONVENTION',
    freshness: {
      lastVerified: '2025-10-01T09:00:00.000Z',
      reviewAfter: '2026-01-01T09:00:00.000Z',
      expiresAfter: '2026-04-01T09:00:00.000Z',
    },
    tags: ['release', 'build', 'packaging'],
    recheckMethod: 'Inspect the current package scripts before preparing a release.',
  },
);

const revokedMemory = memory(
  'DM-MEM-DEMO-003',
  'Use the retired deployment workflow for release packaging.',
  {
    source: { type: 'OWNER_INSTRUCTION', reference: 'Superseded release instruction' },
    verificationStatus: 'REVOKED',
    actionPermission: 'MUST_NOT_ACT',
    relationships: { supersededBy: 'DM-MEM-DEMO-007' },
    tags: ['release', 'deployment', 'workflow'],
  },
);

const inferenceMemory = memory(
  'DM-MEM-DEMO-004',
  'The owner prefers purple interfaces for every product.',
  {
    kind: 'PREFERENCE',
    source: {
      type: 'AGENT_INFERENCE',
      reference: 'Inferred from a prior design discussion',
      agent: 'safe-demo-agent',
    },
    verificationStatus: 'INFERRED',
    confidence: 'HIGH',
    actionPermission: 'ASK_BEFORE_CHANGE',
    tags: ['interface', 'design', 'preference'],
    recheckMethod: 'Ask the owner before replacing the application design system.',
  },
);

const secretMemory = memory(
  'DM-MEM-DEMO-005',
  'api_key=dm_fake_key_DO_NOT_USE_123456789',
  {
    kind: 'OBSERVATION',
    source: { type: 'AGENT_OBSERVATION', reference: 'Obviously fake privacy fixture' },
    verificationStatus: 'OBSERVED',
    sensitivity: 'SECRET',
    actionPermission: 'FORGET_OR_REDACT',
    tags: ['credential', 'privacy'],
  },
);

const budgetRecords: readonly MemoryRecord[] = [
  memory(
    'DM-MEM-DEMO-006',
    'Database adapter changes must preserve the local-only runtime boundary.',
    {
      kind: 'CONSTRAINT',
      tags: ['database', 'adapter', 'local'],
    },
  ),
  memory(
    'DM-MEM-DEMO-007',
    'The current database adapter is selected through deterministic repository configuration.',
    {
      kind: 'OBSERVATION',
      verificationStatus: 'TEST_VERIFIED',
      source: { type: 'TEST_RESULT', reference: 'Safe deterministic adapter test' },
      tags: ['database', 'adapter', 'configuration'],
    },
  ),
  memory(
    'DM-MEM-DEMO-008',
    'Database migrations require an explicit review of persistence compatibility before release.',
    {
      kind: 'REQUIREMENT',
      verificationStatus: 'OWNER_CONFIRMED',
      source: { type: 'OWNER_INSTRUCTION', reference: 'Safe fixture owner constraint' },
      actionPermission: 'ASK_BEFORE_CHANGE',
      tags: ['database', 'migration', 'release'],
      relationships: { supportedBy: ['DM-EVID-DEMO-008'] },
    },
  ),
  memory(
    'DM-MEM-DEMO-009',
    'Navigation labels use sentence case.',
    {
      kind: 'CONVENTION',
      tags: ['navigation', 'labels'],
    },
  ),
];

const supportedMemory = memory(
  'DM-MEM-DEMO-010',
  'The dashboard binds only to the local loopback interface.',
  {
    kind: 'CONSTRAINT',
    verificationStatus: 'TEST_VERIFIED',
    source: { type: 'TEST_RESULT', reference: 'Safe dashboard server test' },
    tags: ['dashboard', 'loopback', 'local'],
  },
);

const SCENARIOS: readonly DashboardScenarioDefinition[] = [
  {
    id: 'architecture-conflict',
    shortTitle: 'Repository conflict',
    title: 'The database decision no longer matches reality',
    concept: 'Conflicting repository evidence',
    summary: 'Memory says SQLite while current repository evidence points to Supabase.',
    task: 'Change the database persistence adapter.',
    primaryMemoryId: architectureMemory.id,
    records: [architectureMemory],
    evidence: [
      evidence('DM-EVID-DEMO-001', architectureMemory.id, 'The initial owner decision selected SQLite.', {
        type: 'OWNER_INSTRUCTION',
        source: 'Safe fixture owner decision',
      }),
      evidence('DM-EVID-DEMO-002', architectureMemory.id, 'Current package metadata includes a Supabase client.', {
        relationship: 'CONTRADICTS',
      }),
      evidence('DM-EVID-DEMO-003', architectureMemory.id, 'Current configuration points to Supabase.', {
        relationship: 'CONTRADICTS',
      }),
      evidence('DM-EVID-DEMO-004', architectureMemory.id, 'No current owner approval for the migration is recorded.', {
        type: 'DOCUMENT_REFERENCE',
        relationship: 'NEUTRAL',
      }),
    ],
    defaultMaxTokens: 240,
  },
  {
    id: 'stale-memory',
    shortTitle: 'Stale claim',
    title: 'A technical claim has passed its review window',
    concept: 'Stale memory',
    summary: 'A previously useful build instruction is now expired and requires re-verification.',
    task: 'Prepare the current release build.',
    primaryMemoryId: staleMemory.id,
    records: [staleMemory],
    evidence: [
      evidence('DM-EVID-DEMO-005', staleMemory.id, 'The old command was observed in historical package metadata.', {
        type: 'DOCUMENT_REFERENCE',
      }),
    ],
    defaultMaxTokens: 240,
  },
  {
    id: 'revoked-memory',
    shortTitle: 'Revoked memory',
    title: 'A superseded instruction cannot authorize action',
    concept: 'Revocation and supersession',
    summary: 'The old release workflow remains auditable but is no longer active truth.',
    task: 'Prepare the release deployment workflow.',
    primaryMemoryId: revokedMemory.id,
    records: [revokedMemory],
    evidence: [
      evidence('DM-EVID-DEMO-006', revokedMemory.id, 'A newer release workflow supersedes this instruction.', {
        type: 'OWNER_INSTRUCTION',
        source: 'Safe fixture superseding instruction',
        relationship: 'CONTRADICTS',
      }),
    ],
    defaultMaxTokens: 240,
  },
  {
    id: 'agent-inference',
    shortTitle: 'Agent inference',
    title: 'High confidence does not create owner authority',
    concept: 'Agent inference without owner authority',
    summary: 'An inferred visual preference cannot authorize a material redesign.',
    task: 'Replace the interface design system.',
    primaryMemoryId: inferenceMemory.id,
    records: [inferenceMemory],
    evidence: [
      evidence('DM-EVID-DEMO-007', inferenceMemory.id, 'An agent observed violet in one prior mockup.', {
        type: 'AGENT_OBSERVATION',
        source: 'Safe fixture observation',
        relationship: 'NEUTRAL',
      }),
    ],
    defaultMaxTokens: 240,
  },
  {
    id: 'secret-redaction',
    shortTitle: 'Privacy boundary',
    title: 'Secret-like content is withheld before context',
    concept: 'Secret-like content requiring redaction',
    summary: 'An obviously fake credential-shaped value triggers the privacy-first rule.',
    task: 'Review credential privacy handling.',
    primaryMemoryId: secretMemory.id,
    records: [secretMemory],
    evidence: [],
    defaultMaxTokens: 240,
  },
  {
    id: 'context-budget',
    shortTitle: 'Hard budget',
    title: 'Relevant memory competes for a constrained context budget',
    concept: 'Budgeted context selection',
    summary: 'The engine ranks safe relevant memories and explains which complete records do not fit.',
    task: 'Change the project database adapter.',
    primaryMemoryId: budgetRecords[0]!.id,
    records: budgetRecords,
    evidence: [
      evidence('DM-EVID-DEMO-008', 'DM-MEM-DEMO-008', 'The owner requires migration review.', {
        type: 'OWNER_INSTRUCTION',
        source: 'Safe fixture owner requirement',
      }),
    ],
    defaultMaxTokens: 110,
  },
  {
    id: 'supported-current-fact',
    shortTitle: 'Supported fact',
    title: 'Current test evidence supports limited trust',
    concept: 'Safe current memory',
    summary: 'A current test-verified local constraint may be used within its recorded permission.',
    task: 'Start the local dashboard.',
    primaryMemoryId: supportedMemory.id,
    records: [supportedMemory],
    evidence: [
      evidence('DM-EVID-DEMO-009', supportedMemory.id, 'The server test confirms loopback-only binding.', {
        type: 'TEST_RESULT',
        source: 'Safe fixture test result',
      }),
    ],
    defaultMaxTokens: 240,
  },
] as const;

const SCENARIOS_BY_ID = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));

export function isDashboardScenarioId(value: string): value is DashboardScenarioId {
  return (DASHBOARD_SCENARIO_IDS as readonly string[]).includes(value);
}

export function listDashboardScenarios(): readonly DashboardScenarioSummary[] {
  return SCENARIOS.map((scenario) => ({
    id: scenario.id,
    title: scenario.title,
    shortTitle: scenario.shortTitle,
    concept: scenario.concept,
    summary: scenario.summary,
    expectedOutcome: determineOutcome(scenario),
    defaultMaxTokens: scenario.defaultMaxTokens,
  }));
}

export function runDashboardScenario(
  scenarioId: DashboardScenarioId,
  maxTokens?: number,
): DashboardScenarioResult {
  const scenario = SCENARIOS_BY_ID.get(scenarioId);
  if (scenario === undefined) {
    throw new Error('Unknown dashboard scenario.');
  }
  const primary = scenario.records.find((record) => record.id === scenario.primaryMemoryId);
  if (primary === undefined) {
    throw new Error('Dashboard scenario is invalid.');
  }

  const finding = auditRecord(primary, scenario.evidence, DASHBOARD_DEMO_NOW);
  const outcome = finding?.outcome ?? 'TRUST';
  const triggeredRuleIds = [finding?.ruleId ?? 'DM-RULE-TRUST-001'];
  const pack = compileContext(
    scenario.task,
    scenario.records,
    fixedClock(DASHBOARD_DEMO_NOW),
    scenario.evidence,
    { maxTokens: maxTokens ?? scenario.defaultMaxTokens },
  );

  return {
    schemaVersion: '1.0.0',
    scenario: {
      id: scenario.id,
      title: scenario.title,
      concept: scenario.concept,
      summary: scenario.summary,
      safeFixture: true,
    },
    outcome,
    explanation: finding?.summary
      ?? 'Current evidence supports limited trust within the recorded permission.',
    triggeredRuleIds,
    ruleTrace: triggeredRuleIds.map((id) => ({
      id,
      description: RULE_DESCRIPTIONS.get(id) ?? 'Canonical engine rule applied.',
    })),
    evidenceConsidered: finding?.evidenceExamined ?? scenario.evidence.map((item) => item.id).sort(),
    evidence: scenario.evidence.map((item) => ({
      id: item.id,
      type: item.type,
      relationship: item.relationship,
      summary: item.content,
    })),
    memories: scenario.records.map((record) => {
      const safe = memoryForOutput(record);
      return {
        id: safe.id,
        kind: safe.kind,
        statement: safe.statement,
        sourceType: safe.source.type,
        sourceReference: safe.source.reference,
        verificationStatus: safe.verificationStatus,
        confidence: safe.confidence,
        sensitivity: safe.sensitivity,
        actionPermission: safe.actionPermission,
        lastVerified: safe.freshness.lastVerified,
        tags: safe.tags,
      };
    }),
    permissionConsequence: finding?.permissionConsequence
      ?? 'The record may be used only within its recorded action permission.',
    recommendedNextStep: finding?.recommendedNextStep
      ?? 'Proceed within the recorded permission and recheck when freshness requires it.',
    context: {
      selected: pack.selected,
      excluded: pack.excluded,
      warnings: pack.warnings,
      budget: pack.budget,
    },
    deterministicAt: DASHBOARD_DEMO_NOW,
    fixtureDisclaimer: FIXTURE_DISCLAIMER,
  };
}

function determineOutcome(scenario: DashboardScenarioDefinition): AuditOutcome {
  const primary = scenario.records.find((record) => record.id === scenario.primaryMemoryId);
  if (primary === undefined) return 'RECHECK';
  return auditRecord(primary, scenario.evidence, DASHBOARD_DEMO_NOW)?.outcome ?? 'TRUST';
}
