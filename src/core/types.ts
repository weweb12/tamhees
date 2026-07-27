/**
 * Tamhees — Core Type Definitions
 *
 * Defines the canonical data model for memory records, evidence,
 * audit events, context packs, and controlled vocabularies.
 *
 * These types follow docs/PROTOCOL_SPECIFICATION.md.
 * Runtime validation is in validation.ts — TypeScript types alone
 * do not enforce constraints at runtime.
 */

// Re-export identity constants so existing consumers continue to work
export { CURRENT_SCHEMA_VERSION, ENGINE_VERSION } from './identity.js';

// ─── Controlled vocabularies ────────────────────────────────

export const VERIFICATION_STATUSES = [
  'OWNER_CONFIRMED',
  'REPO_VERIFIED',
  'TEST_VERIFIED',
  'OBSERVED',
  'INFERRED',
  'UNKNOWN',
  'CONFLICTED',
  'REVOKED',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const CONFIDENCE_VALUES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type Confidence = (typeof CONFIDENCE_VALUES)[number];

export const SENSITIVITY_VALUES = [
  'PUBLIC',
  'INTERNAL',
  'SENSITIVE',
  'SECRET',
] as const;
export type Sensitivity = (typeof SENSITIVITY_VALUES)[number];

export const ACTION_PERMISSIONS = [
  'MAY_ACT',
  'ACT_WITH_CAUTION',
  'ASK_BEFORE_CHANGE',
  'MUST_NOT_ACT',
  'FORGET_OR_REDACT',
] as const;
export type ActionPermission = (typeof ACTION_PERMISSIONS)[number];

export const MEMORY_KINDS = [
  'DECISION',
  'OBSERVATION',
  'CONSTRAINT',
  'PREFERENCE',
  'CONVENTION',
  'REQUIREMENT',
  'ASSUMPTION',
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const SOURCE_TYPES = [
  'OWNER_INSTRUCTION',
  'REPOSITORY_STATE',
  'TEST_RESULT',
  'AGENT_OBSERVATION',
  'AGENT_INFERENCE',
  'DOCUMENT_REFERENCE',
  'CONVERSATION_RECORD',
  'SYSTEM_OBSERVATION',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const AUDIT_OUTCOMES = [
  'TRUST',
  'RECHECK',
  'ASK_OWNER',
  'BLOCK_ACTION',
  'FORGET_OR_REDACT',
] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export const EVIDENCE_RELATIONSHIPS = [
  'SUPPORTS',
  'CONTRADICTS',
  'NEUTRAL',
] as const;
export type EvidenceRelationship = (typeof EVIDENCE_RELATIONSHIPS)[number];

export const EVIDENCE_TYPES = [
  'OWNER_INSTRUCTION',
  'REPOSITORY_STATE',
  'TEST_RESULT',
  'AGENT_OBSERVATION',
  'DOCUMENT_REFERENCE',
  'CONVERSATION_RECORD',
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const UPDATE_ACTIONS = ['CREATE', 'UPDATE', 'REVOKE', 'REDACT'] as const;
export type UpdateAction = (typeof UPDATE_ACTIONS)[number];

export const CONTEXT_EXCLUSION_REASONS = [
  'irrelevant',
  'revoked',
  'conflicted',
  'redacted',
  'blocked',
  'expired',
  'demoted',
  'over-budget',
] as const;
export type ContextExclusionReason = (typeof CONTEXT_EXCLUSION_REASONS)[number];

export const FRESHNESS_RANK_STATES = [
  'CURRENT',
  'DUE',
  'EXPIRED',
  'CONDITIONAL',
] as const;
export type FreshnessRankState = (typeof FRESHNESS_RANK_STATES)[number];

export const DEFAULT_CONTEXT_MAX_TOKENS = 2048;
export const MIN_CONTEXT_MAX_TOKENS = 1;
export const MAX_CONTEXT_MAX_TOKENS = 1_000_000;
export const TOKEN_ESTIMATOR_NAME = 'utf8-bytes-ceil-div-4';
export const TOKEN_ESTIMATOR_VERSION = '1.0.0';
export const CONTEXT_BUDGET_SCOPE = 'selected-memory-agent-payload';

export const LIFECYCLE_STATUSES = [
  'OPEN',
  'FINALIZING',
  'COMPLETED',
  'COMPLETED_WITH_HELD_ITEMS',
  'FAILED',
] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const LIFECYCLE_PROPOSER_TYPES = ['AGENT', 'TOOL', 'OWNER'] as const;
export type LifecycleProposerType = (typeof LIFECYCLE_PROPOSER_TYPES)[number];

export const FINALIZATION_DISPOSITIONS = [
  'APPLIED',
  'HELD_FOR_OWNER',
  'REJECTED',
  'NO_CHANGE',
] as const;
export type FinalizationDisposition = (typeof FINALIZATION_DISPOSITIONS)[number];

export const LIFECYCLE_REASON_CODES = [
  'AUTHORIZED',
  'OWNER_CONFIRMATION_REQUIRED',
  'INSUFFICIENT_AUTHORITY',
  'INVALID_CANDIDATE',
  'MISSING_ARTIFACT',
  'STALE_UPDATE',
  'NO_MATERIAL_CHANGE',
  'PRIVACY_REDACTION',
  'MUTATION_FAILED',
] as const;
export type LifecycleReasonCode = (typeof LIFECYCLE_REASON_CODES)[number];
// ─── Memory record ──────────────────────────────────────────

export interface MemorySource {
  readonly type: SourceType;
  readonly reference: string;
  readonly agent?: string | undefined;
}

export interface Freshness {
  readonly lastVerified: string; // ISO-8601
  readonly reviewAfter?: string | undefined; // ISO-8601 or condition
  readonly expiresAfter?: string | undefined; // ISO-8601
}

export interface Relationships {
  readonly supersedes?: string | undefined;
  readonly supersededBy?: string | undefined;
  readonly conflictsWith?: readonly string[] | undefined;
  readonly supportedBy?: readonly string[] | undefined;
  readonly relatedTo?: readonly string[] | undefined;
}

export interface MemoryRecord {
  readonly schemaVersion: string;
  readonly id: string;
  readonly kind: MemoryKind;
  readonly statement: string;
  readonly source: MemorySource;
  readonly verificationStatus: VerificationStatus;
  readonly confidence: Confidence;
  readonly freshness: Freshness;
  readonly sensitivity: Sensitivity;
  readonly actionPermission: ActionPermission;
  readonly relationships: Relationships;
  readonly tags: readonly string[];
  readonly recheckMethod?: string | undefined;
  readonly notes?: string | undefined;
  readonly createdAt: string; // ISO-8601
  readonly updatedAt: string; // ISO-8601
}

// ─── Validation ─────────────────────────────────────────────

export interface ValidationIssue {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

// ─── Audit ──────────────────────────────────────────────────

export interface AuditFinding {
  readonly ruleId: string;
  readonly recordId: string;
  readonly outcome: AuditOutcome;
  readonly summary: string;
  readonly evidenceExamined: readonly string[];
  readonly permissionConsequence: string;
  readonly recommendedNextStep: string;
}

export interface AuditRunResult {
  readonly overallOutcome: AuditOutcome;
  readonly findings: readonly AuditFinding[];
  readonly recordsAudited: number;
  readonly rulesApplied: readonly string[];
  readonly implementedRuleCount: number;
  readonly timestamp: string; // ISO-8601
}

export interface AuditEvent {
  readonly schemaVersion: string;
  readonly eventId: string;
  readonly timestamp: string;
  readonly memoryId: string;
  readonly outcome: AuditOutcome;
  readonly triggeredRules: readonly string[];
  readonly evidenceExamined?: readonly string[] | undefined;
  readonly explanation: string;
  readonly permissionConsequence: string;
  readonly recommendedAction: string;
  readonly auditor: string;
  readonly engineVersion: string;
}

// ─── Evidence ───────────────────────────────────────────────

export interface EvidenceRecord {
  readonly schemaVersion: string;
  readonly id: string;
  readonly type: EvidenceType;
  readonly source: string;
  readonly content: string;
  readonly relationship: EvidenceRelationship;
  readonly memoryIds: readonly string[];
  readonly collectedAt: string;
  readonly collectedBy: string;
  readonly notes?: string | undefined;
}

// ─── Controlled memory updates ──────────────────────────────

export interface UpdateCandidate {
  readonly schemaVersion: string;
  readonly action: UpdateAction;
  readonly memoryId?: string | undefined;
  readonly proposedRecord?: MemoryRecord | undefined;
  readonly evidence: readonly string[];
  readonly proposedBy: string;
  readonly authorityLevel: VerificationStatus;
  readonly requiresOwnerApproval: boolean;
  readonly reason: string;
  readonly supersededBy?: string | undefined;
  readonly timestamp: string;
}

export interface MutationResult {
  readonly success: boolean;
  readonly action: UpdateAction;
  readonly memoryId: string | null;
  readonly record: MemoryRecord | null;
  readonly archivePath: string | null;
  readonly errors: readonly ValidationIssue[];
}

// ─── Context pack ───────────────────────────────────────────

export interface ContextRelevanceRank {
  readonly score: number;
  readonly matchedTagCount: number;
  readonly matchedWordCount: number;
}

export interface ContextAuthorityRank {
  readonly score: number;
  readonly verificationStatus: VerificationStatus;
}

export interface ContextFreshnessRank {
  readonly score: number;
  readonly state: FreshnessRankState;
  readonly ageDays: number;
  readonly lastVerified: string;
}

export interface ContextSafetyRank {
  readonly score: number;
  readonly auditOutcome: AuditOutcome;
  readonly eligible: boolean;
}

export interface ContextRanking {
  readonly relevance: ContextRelevanceRank;
  readonly authority: ContextAuthorityRank;
  readonly freshness: ContextFreshnessRank;
  readonly safety: ContextSafetyRank;
  readonly totalScore: number;
  readonly tieBreakerMemoryId: string;
}

export interface ContextSelection {
  readonly memoryId: string;
  readonly statement: string;
  readonly reason: string;
  readonly auditOutcome: AuditOutcome;
  readonly verificationStatus: VerificationStatus;
  readonly confidence: Confidence;
  readonly tags: readonly string[];
  readonly rank: number;
  readonly ranking: ContextRanking;
  readonly estimatedTokens: number;
}

export interface ContextExclusion {
  readonly memoryId: string;
  readonly reasonCode: ContextExclusionReason;
  readonly reason: string;
}

export interface ContextBudgetEstimator {
  readonly name: string;
  readonly version: string;
}

export interface ContextBudget {
  readonly maxTokens: number;
  readonly estimatedTokensUsed: number;
  readonly estimatedTokensRemaining: number;
  readonly compliant: boolean;
  readonly estimator: ContextBudgetEstimator;
  readonly scope: string;
}

export interface ContextPack {
  readonly schemaVersion: string;
  readonly taskDescription: string;
  readonly selectionStrategy: string;
  readonly selected: readonly ContextSelection[];
  readonly excluded: readonly ContextExclusion[];
  readonly warnings: readonly string[];
  readonly budget: ContextBudget;
  readonly generatedAt: string; // ISO-8601
}

// ─── Store artifacts ────────────────────────────────────────

export interface LifecycleProposer {
  readonly type: LifecycleProposerType;
  readonly id: string;
}

export interface LifecycleFinalizationInput {
  readonly schemaVersion: string;
  readonly lifecycleId: string;
  readonly proposer: LifecycleProposer;
  readonly proposedUpdates: readonly UpdateCandidate[];
  readonly reason?: string | undefined;
}

export interface LifecycleDispositionRecord {
  readonly proposalIndex: number;
  readonly action: UpdateAction;
  readonly memoryId: string | null;
  readonly disposition: FinalizationDisposition;
  readonly reasonCode: LifecycleReasonCode;
  readonly explanation: string;
  readonly triggeredRules: readonly string[];
  readonly storageChanged: boolean;
  readonly auditReferences: readonly string[];
  readonly recommendedAction: string;
}

export interface LifecycleFinalizationMetadata {
  readonly fingerprint: string;
  readonly proposer: LifecycleProposer;
  readonly startedAt: string;
  readonly completedAt?: string | undefined;
  readonly dispositions: readonly LifecycleDispositionRecord[];
}

export interface LifecycleMetadata {
  readonly schemaVersion: string;
  readonly lifecycleId: string;
  readonly status: LifecycleStatus;
  readonly openedAt: string;
  readonly updatedAt: string;
  readonly selectedMemoryIds: readonly string[];
  readonly exclusionReasonCodes: readonly ContextExclusionReason[];
  readonly budget: ContextBudget;
  readonly auditReferences: readonly string[];
  readonly finalization?: LifecycleFinalizationMetadata | undefined;
  readonly failureCode?: string | undefined;
  readonly recoveryGuidance?: string | undefined;
}

export interface LifecycleBeginResult {
  readonly success: boolean;
  readonly lifecycleId: string | null;
  readonly status: LifecycleStatus | null;
  readonly openedAt: string | null;
  readonly contextPack: ContextPack | null;
  readonly auditReferences: readonly string[];
  readonly errors: readonly ValidationIssue[];
}

export interface LifecycleFinalizeResult {
  readonly success: boolean;
  readonly lifecycleId: string | null;
  readonly status: LifecycleStatus | null;
  readonly dispositions: readonly LifecycleDispositionRecord[];
  readonly storageChanged: boolean;
  readonly auditReferences: readonly string[];
  readonly recommendedAction: string;
  readonly completedAt: string | null;
  readonly alreadyFinalized: boolean;
  readonly errors: readonly ValidationIssue[];
}

export interface TamheesConfig {
  readonly schemaVersion: string;
  readonly projectName: string;
  readonly createdAt: string;
}

export interface TamheesState {
  readonly schemaVersion: string;
  readonly lastOperation: string;
  readonly lastOperationAt: string;
}

export interface MemoryIndexEntry {
  readonly id: string;
  readonly kind: MemoryKind;
  readonly tags: readonly string[];
  readonly verificationStatus: VerificationStatus;
  readonly updatedAt: string;
}

export interface MemoryIndex {
  readonly schemaVersion: string;
  readonly entries: readonly MemoryIndexEntry[];
  readonly lastRebuilt: string;
}

// ─── Clock abstraction ──────────────────────────────────────

export type Clock = () => string; // returns ISO-8601 datetime

export function systemClock(): string {
  return new Date().toISOString();
}

export function fixedClock(iso: string): Clock {
  return () => iso;
}
