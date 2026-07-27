/**
 * Tamhees — Runtime Validation
 *
 * Deterministic runtime validation for memory records and controlled artifacts.
 * TypeScript types alone do not enforce constraints at runtime.
 * This module validates data from disk, user input, and API boundaries.
 *
 * Does not depend on any external validation library.
 */

import {
  CURRENT_SCHEMA_VERSION,
  VERIFICATION_STATUSES,
  CONFIDENCE_VALUES,
  SENSITIVITY_VALUES,
  ACTION_PERMISSIONS,
  MEMORY_KINDS,
  SOURCE_TYPES,
  AUDIT_OUTCOMES,
  EVIDENCE_RELATIONSHIPS,
  EVIDENCE_TYPES,
  UPDATE_ACTIONS,
  CONTEXT_EXCLUSION_REASONS,
  FRESHNESS_RANK_STATES,
  CONTEXT_BUDGET_SCOPE,
  MAX_CONTEXT_MAX_TOKENS,
  MIN_CONTEXT_MAX_TOKENS,
  TOKEN_ESTIMATOR_NAME,
  TOKEN_ESTIMATOR_VERSION,
  LIFECYCLE_STATUSES,
  LIFECYCLE_PROPOSER_TYPES,
  FINALIZATION_DISPOSITIONS,
  LIFECYCLE_REASON_CODES,
  type ContextPack,
  type EvidenceRecord,
  type MemoryRecord,
  type UpdateCandidate,
  type ValidationIssue,
  type ValidationResult,
} from './types.js';

// ─── Helpers ────────────────────────────────────────────────

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => isNonEmptyString(v));
}

const SAFE_ARTIFACT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isSafeArtifactId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ARTIFACT_ID.test(value);
}

function addUnknownFieldIssues(
  object: Record<string, unknown>,
  allowed: readonly string[],
  prefix: string,
  issues: ValidationIssue[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(object)) {
    if (!allowedSet.has(key)) {
      issues.push({
        field: prefix ? `${prefix}.${key}` : key,
        code: 'UNKNOWN_FIELD',
        message: `Unknown field "${key}" is not allowed in this controlled artifact.`,
      });
    }
  }
}

const ISO_8601_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/;

export function isIso8601(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = value.match(ISO_8601_PATTERN);
  if (!match) return false;

  const year = parseInt(match[1] as string, 10);
  const month = parseInt(match[2] as string, 10);
  const day = parseInt(match[3] as string, 10);
  const hour = parseInt(match[4] as string, 10);
  const min = parseInt(match[5] as string, 10);
  const sec = parseInt(match[6] as string, 10);

  if (month < 1 || month > 12) return false;
  if (hour > 23 || min > 59 || sec > 59) return false;

  const date = new Date(Date.UTC(year, month - 1, day, hour, min, sec));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === min &&
    date.getUTCSeconds() === sec
  );
}

function isInVocabulary<T extends string>(
  value: unknown,
  vocabulary: readonly T[],
): value is T {
  return typeof value === 'string' && (vocabulary as readonly string[]).includes(value);
}

// ─── Config and State validation ────────────────────────────

export function validateConfig(data: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isObject(data)) {
    issues.push({ field: '', code: 'INVALID_ROOT', message: 'config.json must be a non-null object.' });
    return { valid: false, issues };
  }
  addUnknownFieldIssues(data, ['schemaVersion', 'projectName', 'createdAt'], '', issues);
  if (!isNonEmptyString(data['schemaVersion'])) {
    issues.push({ field: 'schemaVersion', code: 'MISSING_REQUIRED', message: 'schemaVersion is required.' });
  } else if (data['schemaVersion'] !== CURRENT_SCHEMA_VERSION) {
    issues.push({ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA', message: `Unsupported schema version "${data['schemaVersion']}". Expected "${CURRENT_SCHEMA_VERSION}". Migration may be required. The file was preserved.` });
  }
  if (!isNonEmptyString(data['projectName'])) {
    issues.push({ field: 'projectName', code: 'MISSING_REQUIRED', message: 'projectName is required.' });
  }
  if (!isIso8601(data['createdAt'])) {
    issues.push({ field: 'createdAt', code: 'MISSING_REQUIRED', message: 'createdAt is required and must be ISO-8601 format.' });
  }
  return { valid: issues.length === 0, issues };
}

export function validateState(data: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isObject(data)) {
    issues.push({ field: '', code: 'INVALID_ROOT', message: 'state.json must be a non-null object.' });
    return { valid: false, issues };
  }
  addUnknownFieldIssues(data, ['schemaVersion', 'lastOperation', 'lastOperationAt'], '', issues);
  if (!isNonEmptyString(data['schemaVersion'])) {
    issues.push({ field: 'schemaVersion', code: 'MISSING_REQUIRED', message: 'schemaVersion is required.' });
  } else if (data['schemaVersion'] !== CURRENT_SCHEMA_VERSION) {
    issues.push({ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA', message: `Unsupported schema version "${data['schemaVersion']}". Expected "${CURRENT_SCHEMA_VERSION}". Migration may be required. The file was preserved.` });
  }
  if (!isNonEmptyString(data['lastOperation'])) {
    issues.push({ field: 'lastOperation', code: 'MISSING_REQUIRED', message: 'lastOperation is required.' });
  }
  if (!isIso8601(data['lastOperationAt'])) {
    issues.push({ field: 'lastOperationAt', code: 'MISSING_REQUIRED', message: 'lastOperationAt is required and must be ISO-8601 format.' });
  }
  return { valid: issues.length === 0, issues };
}

// ─── Memory index validation ────────────────────────────────

export function validateMemoryIndex(data: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isObject(data)) {
    issues.push({ field: '', code: 'INVALID_ROOT', message: 'index.json must be a non-null object.' });
    return { valid: false, issues };
  }
  addUnknownFieldIssues(data, ['schemaVersion', 'entries', 'lastRebuilt'], '', issues);
  if (!isNonEmptyString(data['schemaVersion'])) {
    issues.push({ field: 'schemaVersion', code: 'MISSING_REQUIRED', message: 'schemaVersion is required.' });
  } else if (data['schemaVersion'] !== CURRENT_SCHEMA_VERSION) {
    issues.push({ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA', message: `Unsupported schema version "${data['schemaVersion']}". Expected "${CURRENT_SCHEMA_VERSION}". Migration may be required. The file was preserved.` });
  }
  if (!isIso8601(data['lastRebuilt'])) {
    issues.push({ field: 'lastRebuilt', code: 'MISSING_REQUIRED', message: 'lastRebuilt is required and must be ISO-8601 format.' });
  }
  if (!Array.isArray(data['entries'])) {
    issues.push({ field: 'entries', code: 'MISSING_REQUIRED', message: 'entries is required and must be an array.' });
  } else {
    data['entries'].forEach((entry, i) => {
      if (!isObject(entry)) {
        issues.push({ field: `entries[${i}]`, code: 'INVALID_TYPE', message: 'Index entry must be an object.' });
        return;
      }
      addUnknownFieldIssues(entry, ['id', 'kind', 'tags', 'verificationStatus', 'updatedAt'], `entries[${i}]`, issues);
      if (!isSafeArtifactId(entry['id'])) {
        issues.push({ field: `entries[${i}].id`, code: 'UNSAFE_ID', message: 'id must be a safe artifact identifier on index entry.' });
      }
      if (!isInVocabulary(entry['kind'], MEMORY_KINDS)) {
        issues.push({ field: `entries[${i}].kind`, code: 'INVALID_VOCABULARY', message: `kind must be a valid memory kind on index entry.` });
      }
      if (!isNonEmptyStringArray(entry['tags'])) {
        issues.push({ field: `entries[${i}].tags`, code: 'INVALID_TYPE', message: 'tags must be a non-empty-string array on index entry.' });
      }
      if (!isInVocabulary(entry['verificationStatus'], VERIFICATION_STATUSES)) {
        issues.push({ field: `entries[${i}].verificationStatus`, code: 'INVALID_VOCABULARY', message: `verificationStatus must be a valid status on index entry.` });
      }
      if (!isIso8601(entry['updatedAt'])) {
        issues.push({ field: `entries[${i}].updatedAt`, code: 'INVALID_TYPE', message: 'updatedAt must be a valid ISO-8601 string on index entry.' });
      }
    });
    const ids = data['entries']
      .filter((entry): entry is Record<string, unknown> => isObject(entry) && isSafeArtifactId(entry['id']))
      .map((entry) => entry['id'] as string);
    if (new Set(ids).size !== ids.length) {
      issues.push({ field: 'entries', code: 'DUPLICATE_ID', message: 'index entries must not contain duplicate IDs.' });
    }
  }
  return { valid: issues.length === 0, issues };
}

// ─── Memory record validation ───────────────────────────────

export function validateMemoryRecord(data: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isObject(data)) {
    issues.push({
      field: '',
      code: 'INVALID_ROOT',
      message: 'Memory record must be a non-null object.',
    });
    return { valid: false, issues };
  }

  addUnknownFieldIssues(
    data,
    ['schemaVersion', 'id', 'kind', 'statement', 'source', 'verificationStatus', 'confidence', 'freshness', 'sensitivity', 'actionPermission', 'relationships', 'tags', 'recheckMethod', 'notes', 'createdAt', 'updatedAt'],
    '',
    issues,
  );

  // schemaVersion
  if (!isNonEmptyString(data['schemaVersion'])) {
    issues.push({
      field: 'schemaVersion',
      code: 'MISSING_REQUIRED',
      message: 'schemaVersion is required and must be a non-empty string.',
    });
  } else if (data['schemaVersion'] !== CURRENT_SCHEMA_VERSION) {
    issues.push({
      field: 'schemaVersion',
      code: 'UNSUPPORTED_SCHEMA',
      message: `Unsupported schema version "${data['schemaVersion']}". Expected "${CURRENT_SCHEMA_VERSION}". Schema migration may be required.`,
    });
  }

  // id
  if (!isSafeArtifactId(data['id'])) {
    issues.push({
      field: 'id',
      code: isNonEmptyString(data['id']) ? 'UNSAFE_ID' : 'MISSING_REQUIRED',
      message: 'id is required and must use only letters, numbers, dots, underscores, or hyphens (maximum 128 characters).',
    });
  }

  // kind
  if (!isInVocabulary(data['kind'], MEMORY_KINDS)) {
    issues.push({
      field: 'kind',
      code: isNonEmptyString(data['kind'])
        ? 'INVALID_VOCABULARY'
        : 'MISSING_REQUIRED',
      message: isNonEmptyString(data['kind'])
        ? `Unknown kind "${data['kind']}". Allowed: ${MEMORY_KINDS.join(', ')}.`
        : `kind is required. Allowed: ${MEMORY_KINDS.join(', ')}.`,
    });
  }

  // statement
  if (!isNonEmptyString(data['statement'])) {
    issues.push({
      field: 'statement',
      code: 'MISSING_REQUIRED',
      message: 'statement is required and must be a non-empty string.',
    });
  }

  // source
  if (!isObject(data['source'])) {
    issues.push({
      field: 'source',
      code: 'MISSING_REQUIRED',
      message: 'source is required and must be an object.',
    });
  } else {
    const source = data['source'];
    addUnknownFieldIssues(source, ['type', 'reference', 'agent'], 'source', issues);
    if (!isInVocabulary(source['type'], SOURCE_TYPES)) {
      issues.push({
        field: 'source.type',
        code: isNonEmptyString(source['type'])
          ? 'INVALID_VOCABULARY'
          : 'MISSING_REQUIRED',
        message: isNonEmptyString(source['type'])
          ? `Unknown source type "${source['type']}". Allowed: ${SOURCE_TYPES.join(', ')}.`
          : `source.type is required. Allowed: ${SOURCE_TYPES.join(', ')}.`,
      });
    }
    if (!isNonEmptyString(source['reference'])) {
      issues.push({
        field: 'source.reference',
        code: 'MISSING_REQUIRED',
        message: 'source.reference is required and must be a non-empty string.',
      });
    }
    if (source['agent'] !== undefined && !isNonEmptyString(source['agent'])) {
      issues.push({
        field: 'source.agent',
        code: 'INVALID_TYPE',
        message: 'source.agent must be a non-empty string if present.',
      });
    }
  }

  // verificationStatus
  if (!isInVocabulary(data['verificationStatus'], VERIFICATION_STATUSES)) {
    issues.push({
      field: 'verificationStatus',
      code: isNonEmptyString(data['verificationStatus'])
        ? 'INVALID_VOCABULARY'
        : 'MISSING_REQUIRED',
      message: isNonEmptyString(data['verificationStatus'])
        ? `Unknown verification status "${data['verificationStatus']}". Allowed: ${VERIFICATION_STATUSES.join(', ')}.`
        : `verificationStatus is required. Allowed: ${VERIFICATION_STATUSES.join(', ')}.`,
    });
  }

  // confidence
  if (!isInVocabulary(data['confidence'], CONFIDENCE_VALUES)) {
    issues.push({
      field: 'confidence',
      code: isNonEmptyString(data['confidence'])
        ? 'INVALID_VOCABULARY'
        : 'MISSING_REQUIRED',
      message: isNonEmptyString(data['confidence'])
        ? `Unknown confidence "${data['confidence']}". Allowed: ${CONFIDENCE_VALUES.join(', ')}.`
        : `confidence is required. Allowed: ${CONFIDENCE_VALUES.join(', ')}.`,
    });
  }

  // freshness
  if (!isObject(data['freshness'])) {
    issues.push({
      field: 'freshness',
      code: 'MISSING_REQUIRED',
      message: 'freshness is required and must be an object.',
    });
  } else {
    const freshness = data['freshness'];
    addUnknownFieldIssues(freshness, ['lastVerified', 'reviewAfter', 'expiresAfter'], 'freshness', issues);
    if (!isIso8601(freshness['lastVerified'])) {
      issues.push({
        field: 'freshness.lastVerified',
        code: 'MISSING_REQUIRED',
        message: 'freshness.lastVerified is required and must be ISO-8601 format (e.g., 2026-01-01T00:00:00Z).',
      });
    }
    if (freshness['reviewAfter'] !== undefined && typeof freshness['reviewAfter'] !== 'string') {
      issues.push({
        field: 'freshness.reviewAfter',
        code: 'INVALID_TYPE',
        message: 'freshness.reviewAfter must be a string if present.',
      });
    }
    if (freshness['expiresAfter'] !== undefined && !isIso8601(freshness['expiresAfter'])) {
      issues.push({
        field: 'freshness.expiresAfter',
        code: 'INVALID_TYPE',
        message: 'freshness.expiresAfter must be an ISO-8601 UTC timestamp if present.',
      });
    }
  }

  // sensitivity
  if (!isInVocabulary(data['sensitivity'], SENSITIVITY_VALUES)) {
    issues.push({
      field: 'sensitivity',
      code: isNonEmptyString(data['sensitivity'])
        ? 'INVALID_VOCABULARY'
        : 'MISSING_REQUIRED',
      message: isNonEmptyString(data['sensitivity'])
        ? `Unknown sensitivity "${data['sensitivity']}". Allowed: ${SENSITIVITY_VALUES.join(', ')}.`
        : `sensitivity is required. Allowed: ${SENSITIVITY_VALUES.join(', ')}.`,
    });
  }

  // actionPermission
  if (!isInVocabulary(data['actionPermission'], ACTION_PERMISSIONS)) {
    issues.push({
      field: 'actionPermission',
      code: isNonEmptyString(data['actionPermission'])
        ? 'INVALID_VOCABULARY'
        : 'MISSING_REQUIRED',
      message: isNonEmptyString(data['actionPermission'])
        ? `Unknown action permission "${data['actionPermission']}". Allowed: ${ACTION_PERMISSIONS.join(', ')}.`
        : `actionPermission is required. Allowed: ${ACTION_PERMISSIONS.join(', ')}.`,
    });
  }

  // relationships
  if (!isObject(data['relationships'])) {
    issues.push({
      field: 'relationships',
      code: 'MISSING_REQUIRED',
      message: 'relationships is required and must be an object (may be empty: {}).',
    });
  } else {
    const rels = data['relationships'];
    addUnknownFieldIssues(rels, ['supersedes', 'supersededBy', 'conflictsWith', 'supportedBy', 'relatedTo'], 'relationships', issues);
    if (rels['supersedes'] !== undefined && !isSafeArtifactId(rels['supersedes'])) {
      issues.push({
        field: 'relationships.supersedes',
        code: 'INVALID_TYPE',
        message: 'relationships.supersedes must be a safe memory ID if present.',
      });
    }
    if (rels['supersededBy'] !== undefined && !isSafeArtifactId(rels['supersededBy'])) {
      issues.push({
        field: 'relationships.supersededBy',
        code: 'INVALID_TYPE',
        message: 'relationships.supersededBy must be a safe memory ID if present.',
      });
    }
    if (rels['conflictsWith'] !== undefined && !isStringArray(rels['conflictsWith'])) {
      issues.push({
        field: 'relationships.conflictsWith',
        code: 'INVALID_TYPE',
        message: 'relationships.conflictsWith must be an array of strings if present.',
      });
    }
    if (rels['supportedBy'] !== undefined && !isStringArray(rels['supportedBy'])) {
      issues.push({
        field: 'relationships.supportedBy',
        code: 'INVALID_TYPE',
        message: 'relationships.supportedBy must be an array of strings if present.',
      });
    }
    if (rels['relatedTo'] !== undefined && !isStringArray(rels['relatedTo'])) {
      issues.push({
        field: 'relationships.relatedTo',
        code: 'INVALID_TYPE',
        message: 'relationships.relatedTo must be an array of strings if present.',
      });
    }
    for (const key of ['conflictsWith', 'supportedBy', 'relatedTo'] as const) {
      const values = rels[key];
      if (isStringArray(values)) {
        if (values.some((id) => !isSafeArtifactId(id))) {
          issues.push({ field: `relationships.${key}`, code: 'UNSAFE_ID', message: `relationships.${key} must contain only safe artifact IDs.` });
        }
        if (new Set(values).size !== values.length) {
          issues.push({ field: `relationships.${key}`, code: 'DUPLICATE_ID', message: `relationships.${key} must not contain duplicates.` });
        }
      }
    }
    const recordId = isSafeArtifactId(data['id']) ? data['id'] : null;
    if (recordId !== null) {
      if (rels['supersedes'] === recordId || rels['supersededBy'] === recordId) {
        issues.push({ field: 'relationships', code: 'SELF_REFERENCE', message: 'A memory cannot supersede or be superseded by itself.' });
      }
      if (isStringArray(rels['conflictsWith']) && rels['conflictsWith'].includes(recordId)) {
        issues.push({ field: 'relationships.conflictsWith', code: 'SELF_REFERENCE', message: 'A memory cannot conflict with itself.' });
      }
    }
  }

  // tags
  if (!isNonEmptyStringArray(data['tags'])) {
    issues.push({
      field: 'tags',
      code: 'MISSING_REQUIRED',
      message: 'tags is required and must be an array of non-empty strings.',
    });
  }
  if (isNonEmptyStringArray(data['tags']) && new Set(data['tags']).size !== data['tags'].length) {
    issues.push({ field: 'tags', code: 'DUPLICATE_VALUE', message: 'tags must not contain duplicates.' });
  }

  // recheckMethod
  if (data['recheckMethod'] !== undefined && typeof data['recheckMethod'] !== 'string') {
    issues.push({
      field: 'recheckMethod',
      code: 'INVALID_TYPE',
      message: 'recheckMethod must be a string if present.',
    });
  }

  // notes
  if (data['notes'] !== undefined && typeof data['notes'] !== 'string') {
    issues.push({
      field: 'notes',
      code: 'INVALID_TYPE',
      message: 'notes must be a string if present.',
    });
  }

  // createdAt
  if (!isIso8601(data['createdAt'])) {
    issues.push({
      field: 'createdAt',
      code: 'MISSING_REQUIRED',
      message: 'createdAt is required and must be ISO-8601 format.',
    });
  }

  // updatedAt
  if (!isIso8601(data['updatedAt'])) {
    issues.push({
      field: 'updatedAt',
      code: 'MISSING_REQUIRED',
      message: 'updatedAt is required and must be ISO-8601 format.',
    });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Type-narrowing guard: validates data and returns it typed as MemoryRecord.
 * Returns null if validation fails.
 */
export function asValidMemoryRecord(data: unknown): MemoryRecord | null {
  const result = validateMemoryRecord(data);
  if (!result.valid) return null;
  return data as MemoryRecord;
}

// ─── Audit event validation ─────────────────────────────────

export function validateAuditEvent(data: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isObject(data)) {
    issues.push({ field: '', code: 'INVALID_ROOT', message: 'Audit event must be a non-null object.' });
    return { valid: false, issues };
  }

  addUnknownFieldIssues(
    data,
    ['schemaVersion', 'eventId', 'timestamp', 'memoryId', 'outcome', 'triggeredRules', 'evidenceExamined', 'explanation', 'permissionConsequence', 'recommendedAction', 'auditor', 'engineVersion'],
    '',
    issues,
  );

  if (data['schemaVersion'] !== CURRENT_SCHEMA_VERSION) {
    issues.push({ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA', message: `Unsupported schema version "${data['schemaVersion']}". Expected "${CURRENT_SCHEMA_VERSION}". Migration may be required. The file was preserved.` });
  }

  if (!isNonEmptyString(data['eventId'])) {
    issues.push({ field: 'eventId', code: 'MISSING_REQUIRED', message: 'eventId is required.' });
  }

  if (!isIso8601(data['timestamp'])) {
    issues.push({ field: 'timestamp', code: 'MISSING_REQUIRED', message: 'timestamp is required and must be ISO-8601 format.' });
  }

  if (!isNonEmptyString(data['memoryId'])) {
    issues.push({ field: 'memoryId', code: 'MISSING_REQUIRED', message: 'memoryId is required.' });
  }

  if (!isInVocabulary(data['outcome'], AUDIT_OUTCOMES)) {
    issues.push({ field: 'outcome', code: 'INVALID_VOCABULARY', message: `outcome must be one of: ${AUDIT_OUTCOMES.join(', ')}.` });
  }

  if (!isStringArray(data['triggeredRules'])) {
    issues.push({ field: 'triggeredRules', code: 'MISSING_REQUIRED', message: 'triggeredRules must be an array of strings.' });
  }

  if (data['evidenceExamined'] !== undefined && !isNonEmptyStringArray(data['evidenceExamined'])) {
    issues.push({ field: 'evidenceExamined', code: 'INVALID_TYPE', message: 'evidenceExamined must be an array of non-empty evidence IDs if present.' });
  }

  if (!isNonEmptyString(data['explanation'])) {
    issues.push({ field: 'explanation', code: 'MISSING_REQUIRED', message: 'explanation is required.' });
  }

  if (!isNonEmptyString(data['permissionConsequence'])) {
    issues.push({ field: 'permissionConsequence', code: 'MISSING_REQUIRED', message: 'permissionConsequence is required.' });
  }

  if (!isNonEmptyString(data['recommendedAction'])) {
    issues.push({ field: 'recommendedAction', code: 'MISSING_REQUIRED', message: 'recommendedAction is required.' });
  }

  if (!isNonEmptyString(data['auditor'])) {
    issues.push({ field: 'auditor', code: 'MISSING_REQUIRED', message: 'auditor is required.' });
  }

  if (!isNonEmptyString(data['engineVersion'])) {
    issues.push({ field: 'engineVersion', code: 'MISSING_REQUIRED', message: 'engineVersion is required.' });
  }

  return { valid: issues.length === 0, issues };
}

// ─── Evidence validation ───────────────────────────────────

export function validateEvidenceRecord(data: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isObject(data)) {
    return {
      valid: false,
      issues: [{ field: '', code: 'INVALID_ROOT', message: 'Evidence record must be a non-null object.' }],
    };
  }

  addUnknownFieldIssues(
    data,
    ['schemaVersion', 'id', 'type', 'source', 'content', 'relationship', 'memoryIds', 'collectedAt', 'collectedBy', 'notes'],
    '',
    issues,
  );

  if (data['schemaVersion'] !== CURRENT_SCHEMA_VERSION) {
    issues.push({ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA', message: `Unsupported schema version "${data['schemaVersion']}". Expected "${CURRENT_SCHEMA_VERSION}". Migration may be required.` });
  }
  if (!isSafeArtifactId(data['id'])) {
    issues.push({ field: 'id', code: 'UNSAFE_ID', message: 'Evidence id must be a safe artifact identifier.' });
  }
  if (!isInVocabulary(data['type'], EVIDENCE_TYPES)) {
    issues.push({ field: 'type', code: 'INVALID_VOCABULARY', message: `type must be one of: ${EVIDENCE_TYPES.join(', ')}.` });
  }
  if (!isNonEmptyString(data['source'])) {
    issues.push({ field: 'source', code: 'MISSING_REQUIRED', message: 'source is required.' });
  }
  if (!isNonEmptyString(data['content'])) {
    issues.push({ field: 'content', code: 'MISSING_REQUIRED', message: 'content is required.' });
  }
  if (!isInVocabulary(data['relationship'], EVIDENCE_RELATIONSHIPS)) {
    issues.push({ field: 'relationship', code: 'INVALID_VOCABULARY', message: `relationship must be one of: ${EVIDENCE_RELATIONSHIPS.join(', ')}.` });
  }
  if (!isNonEmptyStringArray(data['memoryIds']) || data['memoryIds'].length === 0) {
    issues.push({ field: 'memoryIds', code: 'MISSING_REQUIRED', message: 'memoryIds must contain at least one memory ID.' });
  } else {
    const ids = data['memoryIds'];
    if (ids.some((id) => !isSafeArtifactId(id))) {
      issues.push({ field: 'memoryIds', code: 'UNSAFE_ID', message: 'Every memoryIds entry must be a safe artifact identifier.' });
    }
    if (new Set(ids).size !== ids.length) {
      issues.push({ field: 'memoryIds', code: 'DUPLICATE_ID', message: 'memoryIds must not contain duplicates.' });
    }
  }
  if (!isIso8601(data['collectedAt'])) {
    issues.push({ field: 'collectedAt', code: 'INVALID_TIMESTAMP', message: 'collectedAt must be an ISO-8601 UTC timestamp.' });
  }
  if (!isNonEmptyString(data['collectedBy'])) {
    issues.push({ field: 'collectedBy', code: 'MISSING_REQUIRED', message: 'collectedBy is required.' });
  }
  if (data['notes'] !== undefined && typeof data['notes'] !== 'string') {
    issues.push({ field: 'notes', code: 'INVALID_TYPE', message: 'notes must be a string if present.' });
  }

  return { valid: issues.length === 0, issues };
}

export function asValidEvidenceRecord(data: unknown): EvidenceRecord | null {
  return validateEvidenceRecord(data).valid ? data as EvidenceRecord : null;
}

// ─── Update-candidate validation ────────────────────────────

export function validateUpdateCandidate(data: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isObject(data)) {
    return {
      valid: false,
      issues: [{ field: '', code: 'INVALID_ROOT', message: 'Update candidate must be a non-null object.' }],
    };
  }

  addUnknownFieldIssues(
    data,
    ['schemaVersion', 'action', 'memoryId', 'proposedRecord', 'evidence', 'proposedBy', 'authorityLevel', 'requiresOwnerApproval', 'reason', 'supersededBy', 'timestamp'],
    '',
    issues,
  );

  if (data['schemaVersion'] !== CURRENT_SCHEMA_VERSION) {
    issues.push({ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA', message: `Unsupported schema version "${data['schemaVersion']}". Expected "${CURRENT_SCHEMA_VERSION}".` });
  }
  if (!isInVocabulary(data['action'], UPDATE_ACTIONS)) {
    issues.push({ field: 'action', code: 'INVALID_VOCABULARY', message: `action must be one of: ${UPDATE_ACTIONS.join(', ')}.` });
  }
  if (!isNonEmptyStringArray(data['evidence'])) {
    issues.push({ field: 'evidence', code: 'INVALID_TYPE', message: 'evidence must be an array of non-empty evidence IDs.' });
  } else if (data['evidence'].some((id) => !isSafeArtifactId(id))) {
    issues.push({ field: 'evidence', code: 'UNSAFE_ID', message: 'Every evidence entry must be a safe artifact identifier.' });
  } else if (new Set(data['evidence']).size !== data['evidence'].length) {
    issues.push({ field: 'evidence', code: 'DUPLICATE_ID', message: 'evidence must not contain duplicate IDs.' });
  }
  if (!isNonEmptyString(data['proposedBy'])) {
    issues.push({ field: 'proposedBy', code: 'MISSING_REQUIRED', message: 'proposedBy is required.' });
  }
  if (!isInVocabulary(data['authorityLevel'], VERIFICATION_STATUSES)) {
    issues.push({ field: 'authorityLevel', code: 'INVALID_VOCABULARY', message: `authorityLevel must be one of: ${VERIFICATION_STATUSES.join(', ')}.` });
  }
  if (typeof data['requiresOwnerApproval'] !== 'boolean') {
    issues.push({ field: 'requiresOwnerApproval', code: 'INVALID_TYPE', message: 'requiresOwnerApproval must be a boolean.' });
  }
  if (!isNonEmptyString(data['reason'])) {
    issues.push({ field: 'reason', code: 'MISSING_REQUIRED', message: 'reason is required for auditability.' });
  }
  if (!isIso8601(data['timestamp'])) {
    issues.push({ field: 'timestamp', code: 'INVALID_TIMESTAMP', message: 'timestamp must be an ISO-8601 UTC timestamp.' });
  }
  if (data['supersededBy'] !== undefined && !isSafeArtifactId(data['supersededBy'])) {
    issues.push({ field: 'supersededBy', code: 'UNSAFE_ID', message: 'supersededBy must be a safe artifact identifier if present.' });
  }

  const action = data['action'];
  if (action === 'CREATE') {
    if (data['memoryId'] !== undefined) {
      issues.push({ field: 'memoryId', code: 'UNEXPECTED_FIELD', message: 'memoryId must be omitted for CREATE; proposedRecord.id is canonical.' });
    }
    const recordValidation = validateMemoryRecord(data['proposedRecord']);
    for (const issue of recordValidation.issues) {
      issues.push({ ...issue, field: `proposedRecord${issue.field ? `.${issue.field}` : ''}` });
    }
  } else if (action === 'UPDATE') {
    if (!isSafeArtifactId(data['memoryId'])) {
      issues.push({ field: 'memoryId', code: 'MISSING_REQUIRED', message: 'memoryId is required for UPDATE.' });
    }
    const recordValidation = validateMemoryRecord(data['proposedRecord']);
    for (const issue of recordValidation.issues) {
      issues.push({ ...issue, field: `proposedRecord${issue.field ? `.${issue.field}` : ''}` });
    }
    if (isObject(data['proposedRecord']) && isSafeArtifactId(data['memoryId']) && data['proposedRecord']['id'] !== data['memoryId']) {
      issues.push({ field: 'proposedRecord.id', code: 'ID_MISMATCH', message: 'proposedRecord.id must match memoryId for UPDATE.' });
    }
  } else if (action === 'REVOKE' || action === 'REDACT') {
    if (!isSafeArtifactId(data['memoryId'])) {
      issues.push({ field: 'memoryId', code: 'MISSING_REQUIRED', message: `memoryId is required for ${action}.` });
    }
    if (data['proposedRecord'] !== undefined) {
      issues.push({ field: 'proposedRecord', code: 'UNEXPECTED_FIELD', message: `proposedRecord must be omitted for ${action}.` });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function asValidUpdateCandidate(data: unknown): UpdateCandidate | null {
  return validateUpdateCandidate(data).valid ? data as UpdateCandidate : null;
}

// ─── Context-pack validation ───────────────────────────────

function addContextUnknownFieldIssues(
  object: Record<string, unknown>,
  allowed: readonly string[],
  prefix: string,
  issues: ValidationIssue[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(object)) {
    if (!allowedSet.has(key)) {
      issues.push({
        field: prefix ? `${prefix}.<unknown>` : '<unknown>',
        code: 'UNKNOWN_FIELD',
        message: 'An unknown field is not allowed in the context pack. Raw field names are not echoed.',
      });
    }
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function validateContextPack(data: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isObject(data)) {
    return {
      valid: false,
      issues: [{ field: '', code: 'INVALID_ROOT', message: 'Context pack must be a non-null object.' }],
    };
  }

  addContextUnknownFieldIssues(
    data,
    ['schemaVersion', 'taskDescription', 'selectionStrategy', 'selected', 'excluded', 'warnings', 'budget', 'generatedAt'],
    '',
    issues,
  );
  if (data['schemaVersion'] !== CURRENT_SCHEMA_VERSION) {
    issues.push({ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA', message: 'Context-pack schema version is unsupported.' });
  }
  if (!isNonEmptyString(data['taskDescription'])) {
    issues.push({ field: 'taskDescription', code: 'MISSING_REQUIRED', message: 'taskDescription is required.' });
  }
  if (!isNonEmptyString(data['selectionStrategy'])) {
    issues.push({ field: 'selectionStrategy', code: 'MISSING_REQUIRED', message: 'selectionStrategy is required.' });
  }
  if (!isIso8601(data['generatedAt'])) {
    issues.push({ field: 'generatedAt', code: 'INVALID_TIMESTAMP', message: 'generatedAt must be an ISO-8601 UTC timestamp.' });
  }
  if (!isStringArray(data['warnings'])) {
    issues.push({ field: 'warnings', code: 'INVALID_TYPE', message: 'warnings must be an array of strings.' });
  }

  const selectedIds: string[] = [];
  let selectedTokenSum = 0;
  if (!Array.isArray(data['selected'])) {
    issues.push({ field: 'selected', code: 'INVALID_TYPE', message: 'selected must be an array.' });
  } else {
    data['selected'].forEach((item, index) => {
      const prefix = `selected[${index}]`;
      if (!isObject(item)) {
        issues.push({ field: prefix, code: 'INVALID_TYPE', message: 'Selected entry must be an object.' });
        return;
      }
      addContextUnknownFieldIssues(
        item,
        ['memoryId', 'statement', 'reason', 'auditOutcome', 'verificationStatus', 'confidence', 'tags', 'rank', 'ranking', 'estimatedTokens'],
        prefix,
        issues,
      );
      if (!isSafeArtifactId(item['memoryId'])) {
        issues.push({ field: `${prefix}.memoryId`, code: 'UNSAFE_ID', message: 'memoryId must be a safe artifact ID.' });
      } else {
        selectedIds.push(item['memoryId']);
      }
      if (!isNonEmptyString(item['statement'])) {
        issues.push({ field: `${prefix}.statement`, code: 'MISSING_REQUIRED', message: 'statement is required.' });
      }
      if (!isNonEmptyString(item['reason'])) {
        issues.push({ field: `${prefix}.reason`, code: 'MISSING_REQUIRED', message: 'reason is required.' });
      }
      if (!isInVocabulary(item['auditOutcome'], AUDIT_OUTCOMES)) {
        issues.push({ field: `${prefix}.auditOutcome`, code: 'INVALID_VOCABULARY', message: 'auditOutcome is invalid.' });
      } else if (item['auditOutcome'] === 'BLOCK_ACTION' || item['auditOutcome'] === 'FORGET_OR_REDACT') {
        issues.push({ field: `${prefix}.auditOutcome`, code: 'UNSAFE_SELECTION', message: 'Blocked or privacy-prohibited audit outcomes cannot appear in selected context.' });
      }
      if (!isInVocabulary(item['verificationStatus'], VERIFICATION_STATUSES)) {
        issues.push({ field: `${prefix}.verificationStatus`, code: 'INVALID_VOCABULARY', message: 'verificationStatus is invalid.' });
      }
      if (!isInVocabulary(item['confidence'], CONFIDENCE_VALUES)) {
        issues.push({ field: `${prefix}.confidence`, code: 'INVALID_VOCABULARY', message: 'confidence is invalid.' });
      }
      if (!isStringArray(item['tags'])) {
        issues.push({ field: `${prefix}.tags`, code: 'INVALID_TYPE', message: 'tags must be an array of strings.' });
      }
      if (!isPositiveInteger(item['rank']) || item['rank'] !== index + 1) {
        issues.push({ field: `${prefix}.rank`, code: 'INVALID_RANK', message: 'rank must be the one-based selected order.' });
      }
      if (!isPositiveInteger(item['estimatedTokens'])) {
        issues.push({ field: `${prefix}.estimatedTokens`, code: 'INVALID_NUMBER', message: 'estimatedTokens must be a positive safe integer.' });
      } else {
        selectedTokenSum += item['estimatedTokens'];
      }
      const canonicalEstimate = estimateContextSelectionTokens(item);
      if (canonicalEstimate !== null && item['estimatedTokens'] !== canonicalEstimate) {
        issues.push({ field: `${prefix}.estimatedTokens`, code: 'INVALID_ARITHMETIC', message: 'estimatedTokens must equal the canonical selected-memory payload estimate.' });
      }
      validateContextRanking(item['ranking'], item, prefix, data['generatedAt'], issues);
    });
    for (let index = 1; index < data['selected'].length; index += 1) {
      const previous = data['selected'][index - 1];
      const current = data['selected'][index];
      if (!isObject(previous) || !isObject(current)) continue;
      const previousRanking = previous['ranking'];
      const currentRanking = current['ranking'];
      if (
        !isObject(previousRanking)
        || !isObject(currentRanking)
        || !isNonNegativeInteger(previousRanking['totalScore'])
        || !isNonNegativeInteger(currentRanking['totalScore'])
        || !isSafeArtifactId(previous['memoryId'])
        || !isSafeArtifactId(current['memoryId'])
      ) continue;
      const scoreOrderInvalid = previousRanking['totalScore'] < currentRanking['totalScore'];
      const tieOrderInvalid = previousRanking['totalScore'] === currentRanking['totalScore']
        && previous['memoryId'] > current['memoryId'];
      if (scoreOrderInvalid || tieOrderInvalid) {
        issues.push({
          field: `selected[${index}].rank`,
          code: 'INVALID_RANK',
          message: 'Selected entries must be ordered by descending total score and then ascending ordinal memory ID.',
        });
      }
    }
  }

  const excludedIds: string[] = [];
  if (!Array.isArray(data['excluded'])) {
    issues.push({ field: 'excluded', code: 'INVALID_TYPE', message: 'excluded must be an array.' });
  } else {
    data['excluded'].forEach((item, index) => {
      const prefix = `excluded[${index}]`;
      if (!isObject(item)) {
        issues.push({ field: prefix, code: 'INVALID_TYPE', message: 'Excluded entry must be an object.' });
        return;
      }
      addContextUnknownFieldIssues(item, ['memoryId', 'reasonCode', 'reason'], prefix, issues);
      if (!isSafeArtifactId(item['memoryId'])) {
        issues.push({ field: `${prefix}.memoryId`, code: 'UNSAFE_ID', message: 'memoryId must be a safe artifact ID.' });
      } else {
        excludedIds.push(item['memoryId']);
      }
      if (!isInVocabulary(item['reasonCode'], CONTEXT_EXCLUSION_REASONS)) {
        issues.push({ field: `${prefix}.reasonCode`, code: 'INVALID_VOCABULARY', message: 'reasonCode is not an allowed exclusion reason.' });
      }
      if (!isNonEmptyString(item['reason'])) {
        issues.push({ field: `${prefix}.reason`, code: 'MISSING_REQUIRED', message: 'reason is required.' });
      }
    });
  }

  validateContextBudget(data['budget'], selectedTokenSum, issues);
  if (new Set(selectedIds).size !== selectedIds.length) {
    issues.push({ field: 'selected', code: 'DUPLICATE_ID', message: 'selected must not contain duplicate memory IDs.' });
  }
  if (new Set(excludedIds).size !== excludedIds.length) {
    issues.push({ field: 'excluded', code: 'DUPLICATE_ID', message: 'excluded must not contain duplicate memory IDs.' });
  }
  const excludedSet = new Set(excludedIds);
  if (selectedIds.some((id) => excludedSet.has(id))) {
    issues.push({ field: 'selected', code: 'ID_OVERLAP', message: 'A memory ID cannot appear in both selected and excluded.' });
  }

  return { valid: issues.length === 0, issues };
}

function validateContextRanking(
  value: unknown,
  selected: Record<string, unknown>,
  prefix: string,
  generatedAt: unknown,
  issues: ValidationIssue[],
): void {
  if (!isObject(value)) {
    issues.push({ field: `${prefix}.ranking`, code: 'INVALID_TYPE', message: 'ranking must be an object.' });
    return;
  }
  addContextUnknownFieldIssues(value, ['relevance', 'authority', 'freshness', 'safety', 'totalScore', 'tieBreakerMemoryId'], `${prefix}.ranking`, issues);
  const componentScores: number[] = [];

  const relevance = value['relevance'];
  if (!isObject(relevance)) {
    issues.push({ field: `${prefix}.ranking.relevance`, code: 'INVALID_TYPE', message: 'relevance ranking must be an object.' });
  } else {
    addContextUnknownFieldIssues(relevance, ['score', 'matchedTagCount', 'matchedWordCount'], `${prefix}.ranking.relevance`, issues);
    for (const key of ['score', 'matchedTagCount', 'matchedWordCount'] as const) {
      if (!isNonNegativeInteger(relevance[key])) {
        issues.push({ field: `${prefix}.ranking.relevance.${key}`, code: 'INVALID_NUMBER', message: `${key} must be a non-negative safe integer.` });
      }
    }
    if (isNonNegativeInteger(relevance['score'])) {
      componentScores.push(relevance['score']);
      if (relevance['score'] === 0) {
        issues.push({ field: `${prefix}.ranking.relevance.score`, code: 'UNSAFE_SELECTION', message: 'Selected context must have positive task relevance.' });
      }
      if (
        isNonNegativeInteger(relevance['matchedTagCount'])
        && isNonNegativeInteger(relevance['matchedWordCount'])
        && relevance['score'] !== relevance['matchedTagCount'] * 20 + relevance['matchedWordCount'] * 10
      ) {
        issues.push({ field: `${prefix}.ranking.relevance.score`, code: 'INVALID_ARITHMETIC', message: 'Relevance score must equal the documented unique-tag and unique-word formula.' });
      }
    }
  }

  const authority = value['authority'];
  if (!isObject(authority)) {
    issues.push({ field: `${prefix}.ranking.authority`, code: 'INVALID_TYPE', message: 'authority ranking must be an object.' });
  } else {
    addContextUnknownFieldIssues(authority, ['score', 'verificationStatus'], `${prefix}.ranking.authority`, issues);
    if (!isNonNegativeInteger(authority['score'])) {
      issues.push({ field: `${prefix}.ranking.authority.score`, code: 'INVALID_NUMBER', message: 'authority score must be a non-negative safe integer.' });
    } else {
      componentScores.push(authority['score']);
    }
    if (!isInVocabulary(authority['verificationStatus'], VERIFICATION_STATUSES) || authority['verificationStatus'] !== selected['verificationStatus']) {
      issues.push({ field: `${prefix}.ranking.authority.verificationStatus`, code: 'INCONSISTENT_VALUE', message: 'Authority verification status must match the selected entry.' });
    } else if (isNonNegativeInteger(authority['score']) && authority['score'] !== expectedAuthorityScore(authority['verificationStatus'])) {
      issues.push({ field: `${prefix}.ranking.authority.score`, code: 'INVALID_ARITHMETIC', message: 'Authority score must match the documented verification-status weight.' });
    }
  }

  const freshness = value['freshness'];
  if (!isObject(freshness)) {
    issues.push({ field: `${prefix}.ranking.freshness`, code: 'INVALID_TYPE', message: 'freshness ranking must be an object.' });
  } else {
    addContextUnknownFieldIssues(freshness, ['score', 'state', 'ageDays', 'lastVerified'], `${prefix}.ranking.freshness`, issues);
    if (!isNonNegativeInteger(freshness['score'])) {
      issues.push({ field: `${prefix}.ranking.freshness.score`, code: 'INVALID_NUMBER', message: 'freshness score must be a non-negative safe integer.' });
    } else {
      componentScores.push(freshness['score']);
    }
    if (!isInVocabulary(freshness['state'], FRESHNESS_RANK_STATES)) {
      issues.push({ field: `${prefix}.ranking.freshness.state`, code: 'INVALID_VOCABULARY', message: 'freshness state is invalid.' });
    }
    if (!isNonNegativeInteger(freshness['ageDays'])) {
      issues.push({ field: `${prefix}.ranking.freshness.ageDays`, code: 'INVALID_NUMBER', message: 'ageDays must be a non-negative safe integer.' });
    }
    if (!isIso8601(freshness['lastVerified'])) {
      issues.push({ field: `${prefix}.ranking.freshness.lastVerified`, code: 'INVALID_TIMESTAMP', message: 'lastVerified must be ISO-8601.' });
    }
    if (
      isIso8601(generatedAt)
      && isIso8601(freshness['lastVerified'])
      && isNonNegativeInteger(freshness['ageDays'])
      && isInVocabulary(freshness['state'], FRESHNESS_RANK_STATES)
      && isNonNegativeInteger(freshness['score'])
    ) {
      const expectedAgeDays = Math.max(0, Math.floor((Date.parse(generatedAt) - Date.parse(freshness['lastVerified'])) / 86_400_000));
      if (freshness['ageDays'] !== expectedAgeDays) {
        issues.push({ field: `${prefix}.ranking.freshness.ageDays`, code: 'INVALID_ARITHMETIC', message: 'ageDays must be derived from generatedAt and lastVerified using complete UTC 24-hour intervals.' });
      }
      if (freshness['state'] === 'EXPIRED') {
        issues.push({ field: `${prefix}.ranking.freshness.state`, code: 'UNSAFE_SELECTION', message: 'Expired memory cannot appear in selected context.' });
      }
      if (freshness['score'] !== expectedFreshnessScore(expectedAgeDays, freshness['state'])) {
        issues.push({ field: `${prefix}.ranking.freshness.score`, code: 'INVALID_ARITHMETIC', message: 'Freshness score must match the documented age band and state penalty.' });
      }
    }
  }

  const safety = value['safety'];
  if (!isObject(safety)) {
    issues.push({ field: `${prefix}.ranking.safety`, code: 'INVALID_TYPE', message: 'safety ranking must be an object.' });
  } else {
    addContextUnknownFieldIssues(safety, ['score', 'auditOutcome', 'eligible'], `${prefix}.ranking.safety`, issues);
    if (!isNonNegativeInteger(safety['score'])) {
      issues.push({ field: `${prefix}.ranking.safety.score`, code: 'INVALID_NUMBER', message: 'safety score must be a non-negative safe integer.' });
    } else {
      componentScores.push(safety['score']);
    }
    if (!isInVocabulary(safety['auditOutcome'], AUDIT_OUTCOMES) || safety['auditOutcome'] !== selected['auditOutcome']) {
      issues.push({ field: `${prefix}.ranking.safety.auditOutcome`, code: 'INCONSISTENT_VALUE', message: 'Safety audit outcome must match the selected entry.' });
    } else if (isNonNegativeInteger(safety['score']) && safety['score'] !== expectedSafetyScore(safety['auditOutcome'])) {
      issues.push({ field: `${prefix}.ranking.safety.score`, code: 'INVALID_ARITHMETIC', message: 'Safety score must match the documented audit-outcome weight.' });
    }
    if (safety['eligible'] !== true) {
      issues.push({ field: `${prefix}.ranking.safety.eligible`, code: 'INCONSISTENT_VALUE', message: 'Selected entries must be safety eligible.' });
    }
  }

  if (!isNonNegativeInteger(value['totalScore'])) {
    issues.push({ field: `${prefix}.ranking.totalScore`, code: 'INVALID_NUMBER', message: 'totalScore must be a non-negative safe integer.' });
  } else if (componentScores.length === 4 && value['totalScore'] !== componentScores.reduce((sum, score) => sum + score, 0)) {
    issues.push({ field: `${prefix}.ranking.totalScore`, code: 'INVALID_ARITHMETIC', message: 'totalScore must equal the ranking component sum.' });
  }
  if (!isSafeArtifactId(value['tieBreakerMemoryId']) || value['tieBreakerMemoryId'] !== selected['memoryId']) {
    issues.push({ field: `${prefix}.ranking.tieBreakerMemoryId`, code: 'INCONSISTENT_VALUE', message: 'tieBreakerMemoryId must match memoryId.' });
  }
}

function expectedAuthorityScore(status: (typeof VERIFICATION_STATUSES)[number]): number {
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

function expectedSafetyScore(outcome: (typeof AUDIT_OUTCOMES)[number]): number {
  switch (outcome) {
    case 'TRUST': return 30;
    case 'ASK_OWNER': return 10;
    case 'RECHECK':
    case 'BLOCK_ACTION':
    case 'FORGET_OR_REDACT':
      return 0;
  }
}

function expectedFreshnessScore(ageDays: number, state: (typeof FRESHNESS_RANK_STATES)[number]): number {
  const base = ageDays <= 7 ? 20 : ageDays <= 30 ? 15 : ageDays <= 90 ? 10 : ageDays <= 365 ? 5 : 0;
  if (state === 'EXPIRED') return 0;
  return state === 'DUE' || state === 'CONDITIONAL' ? Math.max(0, base - 10) : base;
}

function estimateContextSelectionTokens(value: Record<string, unknown>): number | null {
  const memoryId = value['memoryId'];
  const statement = value['statement'];
  const auditOutcome = value['auditOutcome'];
  const verificationStatus = value['verificationStatus'];
  const confidence = value['confidence'];
  const tags = value['tags'];
  if (
    !isSafeArtifactId(memoryId)
    || !isNonEmptyString(statement)
    || !isInVocabulary(auditOutcome, AUDIT_OUTCOMES)
    || !isInVocabulary(verificationStatus, VERIFICATION_STATUSES)
    || !isInVocabulary(confidence, CONFIDENCE_VALUES)
    || !isStringArray(tags)
  ) {
    return null;
  }
  const payload = JSON.stringify({ memoryId, statement, auditOutcome, verificationStatus, confidence, tags });
  return Math.max(1, Math.ceil(Buffer.byteLength(payload, 'utf8') / 4));
}

function validateContextBudget(value: unknown, selectedTokenSum: number, issues: ValidationIssue[]): void {
  if (!isObject(value)) {
    issues.push({ field: 'budget', code: 'INVALID_TYPE', message: 'budget must be an object.' });
    return;
  }
  addContextUnknownFieldIssues(
    value,
    ['maxTokens', 'estimatedTokensUsed', 'estimatedTokensRemaining', 'compliant', 'estimator', 'scope'],
    'budget',
    issues,
  );
  const maxTokens = value['maxTokens'];
  const used = value['estimatedTokensUsed'];
  const remaining = value['estimatedTokensRemaining'];
  if (!isPositiveInteger(maxTokens) || maxTokens < MIN_CONTEXT_MAX_TOKENS || maxTokens > MAX_CONTEXT_MAX_TOKENS) {
    issues.push({ field: 'budget.maxTokens', code: 'INVALID_NUMBER', message: 'maxTokens is outside the accepted positive-integer range.' });
  }
  if (!isNonNegativeInteger(used)) {
    issues.push({ field: 'budget.estimatedTokensUsed', code: 'INVALID_NUMBER', message: 'estimatedTokensUsed must be a non-negative safe integer.' });
  }
  if (!isNonNegativeInteger(remaining)) {
    issues.push({ field: 'budget.estimatedTokensRemaining', code: 'INVALID_NUMBER', message: 'estimatedTokensRemaining must be a non-negative safe integer.' });
  }
  if (typeof value['compliant'] !== 'boolean') {
    issues.push({ field: 'budget.compliant', code: 'INVALID_TYPE', message: 'compliant must be a boolean.' });
  }
  if (isPositiveInteger(maxTokens) && isNonNegativeInteger(used) && isNonNegativeInteger(remaining)) {
    if (used !== selectedTokenSum) {
      issues.push({ field: 'budget.estimatedTokensUsed', code: 'INVALID_ARITHMETIC', message: 'estimatedTokensUsed must equal the selected contribution sum.' });
    }
    if (remaining !== maxTokens - used || used > maxTokens || value['compliant'] !== true) {
      issues.push({ field: 'budget', code: 'BUDGET_VIOLATION', message: 'Budget arithmetic or compliance is invalid.' });
    }
  }

  const estimator = value['estimator'];
  if (!isObject(estimator)) {
    issues.push({ field: 'budget.estimator', code: 'INVALID_TYPE', message: 'estimator must be an object.' });
  } else {
    addContextUnknownFieldIssues(estimator, ['name', 'version'], 'budget.estimator', issues);
    if (estimator['name'] !== TOKEN_ESTIMATOR_NAME) {
      issues.push({ field: 'budget.estimator.name', code: 'INVALID_VOCABULARY', message: 'Estimator name is unsupported.' });
    }
    if (estimator['version'] !== TOKEN_ESTIMATOR_VERSION) {
      issues.push({ field: 'budget.estimator.version', code: 'INVALID_VOCABULARY', message: 'Estimator version is unsupported.' });
    }
  }
  if (value['scope'] !== CONTEXT_BUDGET_SCOPE) {
    issues.push({ field: 'budget.scope', code: 'INVALID_VOCABULARY', message: 'Budget scope is unsupported.' });
  }
}

export function asValidContextPack(data: unknown): ContextPack | null {
  return validateContextPack(data).valid ? data as ContextPack : null;
}

// --- Phase 4 controlled lifecycle validation ---
function addLifecycleUnknownFieldIssues(object: Record<string, unknown>, allowed: readonly string[], prefix: string, issues: ValidationIssue[]): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(object)) if (!allowedSet.has(key)) issues.push({
    field: prefix ? `${prefix}.<unknown>` : '<unknown>', code: 'UNKNOWN_FIELD',
    message: 'An unknown field is not allowed in a lifecycle artifact. Raw field names are not echoed.',
  });
}

export function validateLifecycleFinalizationInput(data: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isObject(data)) return { valid: false, issues: [{ field: '', code: 'INVALID_ROOT', message: 'Lifecycle finalization must be a non-null object.' }] };
  addLifecycleUnknownFieldIssues(data, ['schemaVersion', 'lifecycleId', 'proposer', 'proposedUpdates', 'reason'], '', issues);
  if (data['schemaVersion'] !== CURRENT_SCHEMA_VERSION) issues.push({ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA', message: 'Lifecycle schema version is unsupported.' });
  if (!isSafeArtifactId(data['lifecycleId'])) issues.push({ field: 'lifecycleId', code: 'UNSAFE_ID', message: 'lifecycleId must be a safe artifact identifier.' });
  validateLifecycleProposer(data['proposer'], 'proposer', issues);
  if (!Array.isArray(data['proposedUpdates'])) {
    issues.push({ field: 'proposedUpdates', code: 'INVALID_TYPE', message: 'proposedUpdates must be an array.' });
  } else {
    const fingerprints = new Set<string>();
    const targets = new Set<string>();
    data['proposedUpdates'].forEach((candidate, index) => {
      const result = validateUpdateCandidate(candidate);
      for (const problem of result.issues) issues.push({ ...problem, field: `proposedUpdates[${index}]${problem.field ? `.${problem.field}` : ''}` });
      const fingerprint = JSON.stringify(candidate);
      if (fingerprints.has(fingerprint)) issues.push({ field: `proposedUpdates[${index}]`, code: 'DUPLICATE_PROPOSAL', message: 'Exact duplicate proposals are not allowed.' });
      fingerprints.add(fingerprint);
      if (isObject(candidate)) {
        const proposed = candidate['proposedRecord'];
        const target = typeof candidate['memoryId'] === 'string' ? candidate['memoryId'] : isObject(proposed) && typeof proposed['id'] === 'string' ? proposed['id'] : null;
        if (target && targets.has(target)) issues.push({ field: `proposedUpdates[${index}]`, code: 'AMBIGUOUS_TARGET', message: 'A lifecycle may contain only one proposal per target memory.' });
        if (target) targets.add(target);
      }
    });
  }
  if (data['reason'] !== undefined && !isNonEmptyString(data['reason'])) issues.push({ field: 'reason', code: 'INVALID_TYPE', message: 'reason must be a non-empty string if present.' });
  return { valid: issues.length === 0, issues };
}

function validateLifecycleProposer(value: unknown, prefix: string, issues: ValidationIssue[]): void {
  if (!isObject(value)) { issues.push({ field: prefix, code: 'INVALID_TYPE', message: 'proposer must be an object.' }); return; }
  addLifecycleUnknownFieldIssues(value, ['type', 'id'], prefix, issues);
  if (!isInVocabulary(value['type'], LIFECYCLE_PROPOSER_TYPES)) issues.push({ field: `${prefix}.type`, code: 'INVALID_VOCABULARY', message: 'proposer type is invalid.' });
  if (!isSafeArtifactId(value['id'])) issues.push({ field: `${prefix}.id`, code: 'UNSAFE_ID', message: 'proposer id must be a safe artifact identifier.' });
}

export function validateLifecycleMetadata(data: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isObject(data)) return { valid: false, issues: [{ field: '', code: 'INVALID_ROOT', message: 'Lifecycle metadata must be a non-null object.' }] };
  addLifecycleUnknownFieldIssues(data, ['schemaVersion','lifecycleId','status','openedAt','updatedAt','selectedMemoryIds','exclusionReasonCodes','budget','auditReferences','finalization','failureCode','recoveryGuidance'], '', issues);
  if (data['schemaVersion'] !== CURRENT_SCHEMA_VERSION) issues.push({ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA', message: 'Lifecycle schema version is unsupported.' });
  if (!isSafeArtifactId(data['lifecycleId'])) issues.push({ field: 'lifecycleId', code: 'UNSAFE_ID', message: 'lifecycleId must be safe.' });
  if (!isInVocabulary(data['status'], LIFECYCLE_STATUSES)) issues.push({ field: 'status', code: 'INVALID_VOCABULARY', message: 'Lifecycle status is invalid.' });
  if (!isIso8601(data['openedAt'])) issues.push({ field: 'openedAt', code: 'INVALID_TIMESTAMP', message: 'openedAt must be ISO-8601 UTC.' });
  if (!isIso8601(data['updatedAt'])) issues.push({ field: 'updatedAt', code: 'INVALID_TIMESTAMP', message: 'updatedAt must be ISO-8601 UTC.' });
  if (isIso8601(data['openedAt']) && isIso8601(data['updatedAt']) && Date.parse(data['updatedAt']) < Date.parse(data['openedAt'])) issues.push({ field: 'updatedAt', code: 'INVALID_TIMESTAMP_ORDER', message: 'updatedAt cannot precede openedAt.' });
  validateSafeUniqueArray(data['selectedMemoryIds'], 'selectedMemoryIds', issues);
  if (!Array.isArray(data['exclusionReasonCodes']) || !data['exclusionReasonCodes'].every((item) => isInVocabulary(item, CONTEXT_EXCLUSION_REASONS)) || new Set(data['exclusionReasonCodes']).size !== data['exclusionReasonCodes'].length) issues.push({ field: 'exclusionReasonCodes', code: 'INVALID_TYPE', message: 'exclusionReasonCodes must contain unique controlled values.' });
  validateLifecycleBudget(data['budget'], issues);
  validateSafeUniqueArray(data['auditReferences'], 'auditReferences', issues);
  if (Array.isArray(data['auditReferences']) && data['auditReferences'].length === 0) issues.push({ field: 'auditReferences', code: 'MISSING_REQUIRED', message: 'Lifecycle metadata requires at least one audit reference.' });
  const status = data['status'];
  if (status === 'OPEN' && (data['finalization'] !== undefined || data['failureCode'] !== undefined || data['recoveryGuidance'] !== undefined)) issues.push({ field: 'status', code: 'INVALID_STATE', message: 'OPEN metadata cannot contain finalization or failure state.' });
  if (status === 'FINALIZING' || status === 'COMPLETED' || status === 'COMPLETED_WITH_HELD_ITEMS' || status === 'FAILED') validateFinalizationMetadata(data['finalization'], status, data, issues);
  if (status === 'FAILED' && (!isNonEmptyString(data['failureCode']) || !isNonEmptyString(data['recoveryGuidance']))) issues.push({ field: 'failureCode', code: 'INVALID_STATE', message: 'FAILED metadata requires a failure code and recovery guidance.' });
  if (status !== 'FAILED' && (data['failureCode'] !== undefined || data['recoveryGuidance'] !== undefined)) issues.push({ field: 'failureCode', code: 'INVALID_STATE', message: 'Failure fields are allowed only in FAILED state.' });
  return { valid: issues.length === 0, issues };
}
function validateSafeUniqueArray(value: unknown, field: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value) || !value.every(isSafeArtifactId) || new Set(value).size !== value.length) issues.push({ field, code: 'INVALID_TYPE', message: `${field} must contain unique safe artifact identifiers.` });
}
function validateLifecycleBudget(value: unknown, issues: ValidationIssue[]): void {
  if (!isObject(value)) { issues.push({ field: 'budget', code: 'INVALID_TYPE', message: 'budget must be an object.' }); return; }
  addLifecycleUnknownFieldIssues(value, ['maxTokens','estimatedTokensUsed','estimatedTokensRemaining','compliant','estimator','scope'], 'budget', issues);
  const max = value['maxTokens'], used = value['estimatedTokensUsed'], remaining = value['estimatedTokensRemaining'];
  if (!isPositiveInteger(max) || (max as number) > MAX_CONTEXT_MAX_TOKENS) issues.push({ field: 'budget.maxTokens', code: 'INVALID_NUMBER', message: 'maxTokens is outside the supported range.' });
  if (!isNonNegativeInteger(used) || !isNonNegativeInteger(remaining)) issues.push({ field: 'budget', code: 'INVALID_NUMBER', message: 'Budget token values must be non-negative safe integers.' });
  if (typeof max === 'number' && typeof used === 'number' && typeof remaining === 'number' && max - used !== remaining) issues.push({ field: 'budget', code: 'INVALID_ARITHMETIC', message: 'Budget arithmetic is inconsistent.' });
  if (typeof value['compliant'] !== 'boolean' || (typeof max === 'number' && typeof used === 'number' && value['compliant'] !== (used <= max))) issues.push({ field: 'budget.compliant', code: 'INVALID_ARITHMETIC', message: 'Budget compliance is inconsistent.' });
  if (value['scope'] !== CONTEXT_BUDGET_SCOPE) issues.push({ field: 'budget.scope', code: 'INVALID_VOCABULARY', message: 'Budget scope is invalid.' });
  const estimator = value['estimator'];
  if (!isObject(estimator) || estimator['name'] !== TOKEN_ESTIMATOR_NAME || estimator['version'] !== TOKEN_ESTIMATOR_VERSION || Object.keys(estimator).some((key) => key !== 'name' && key !== 'version')) issues.push({ field: 'budget.estimator', code: 'INVALID_VALUE', message: 'Budget estimator metadata is invalid.' });
}
function validateFinalizationMetadata(value: unknown, status: unknown, metadata: Record<string, unknown>, issues: ValidationIssue[]): void {
  if (!isObject(value)) { issues.push({ field: 'finalization', code: 'INVALID_STATE', message: 'This lifecycle state requires finalization metadata.' }); return; }
  addLifecycleUnknownFieldIssues(value, ['fingerprint','proposer','startedAt','completedAt','dispositions'], 'finalization', issues);
  if (typeof value['fingerprint'] !== 'string' || !/^[a-f0-9]{64}$/.test(value['fingerprint'])) issues.push({ field: 'finalization.fingerprint', code: 'INVALID_VALUE', message: 'Finalization fingerprint must be SHA-256 hexadecimal.' });
  validateLifecycleProposer(value['proposer'], 'finalization.proposer', issues);
  if (!isIso8601(value['startedAt'])) issues.push({ field: 'finalization.startedAt', code: 'INVALID_TIMESTAMP', message: 'startedAt must be ISO-8601 UTC.' });
  const terminal = status === 'COMPLETED' || status === 'COMPLETED_WITH_HELD_ITEMS';
  if (terminal ? !isIso8601(value['completedAt']) : value['completedAt'] !== undefined) issues.push({ field: 'finalization.completedAt', code: 'INVALID_STATE', message: 'completedAt is required only for completed lifecycle states.' });
  if (!Array.isArray(value['dispositions'])) { issues.push({ field: 'finalization.dispositions', code: 'INVALID_TYPE', message: 'dispositions must be an array.' }); return; }
  if (isIso8601(value['startedAt']) && isIso8601(metadata['openedAt']) && Date.parse(value['startedAt']) < Date.parse(metadata['openedAt'])) issues.push({ field: 'finalization.startedAt', code: 'INVALID_TIMESTAMP_ORDER', message: 'startedAt cannot precede openedAt.' });
  if (isIso8601(value['startedAt']) && isIso8601(metadata['updatedAt']) && Date.parse(metadata['updatedAt']) < Date.parse(value['startedAt'])) issues.push({ field: 'updatedAt', code: 'INVALID_TIMESTAMP_ORDER', message: 'updatedAt cannot precede startedAt.' });
  if (terminal && isIso8601(value['completedAt']) && isIso8601(value['startedAt']) && Date.parse(value['completedAt']) < Date.parse(value['startedAt'])) issues.push({ field: 'finalization.completedAt', code: 'INVALID_TIMESTAMP_ORDER', message: 'completedAt cannot precede startedAt.' });
  if (terminal && isIso8601(value['completedAt']) && isIso8601(metadata['updatedAt']) && Date.parse(value['completedAt']) !== Date.parse(metadata['updatedAt'])) issues.push({ field: 'updatedAt', code: 'INVALID_TIMESTAMP_ORDER', message: 'Terminal updatedAt must equal completedAt.' });
  value['dispositions'].forEach((item,index) => validateDisposition(item,index,terminal,issues));
  if (status === 'COMPLETED' && value['dispositions'].some((item) => isObject(item) && item['disposition'] === 'HELD_FOR_OWNER')) issues.push({ field: 'status', code: 'INVALID_STATE', message: 'Held items require COMPLETED_WITH_HELD_ITEMS.' });
  if (status === 'COMPLETED_WITH_HELD_ITEMS' && !value['dispositions'].some((item) => isObject(item) && item['disposition'] === 'HELD_FOR_OWNER')) issues.push({ field: 'status', code: 'INVALID_STATE', message: 'COMPLETED_WITH_HELD_ITEMS requires a held disposition.' });
}
function validateDisposition(value: unknown, index: number, terminal: boolean, issues: ValidationIssue[]): void {
  const p=`finalization.dispositions[${index}]`;
  if (!isObject(value)) { issues.push({ field:p, code:'INVALID_TYPE', message:'Disposition must be an object.'}); return; }
  addLifecycleUnknownFieldIssues(value,['proposalIndex','action','memoryId','disposition','reasonCode','explanation','triggeredRules','storageChanged','auditReferences','recommendedAction'],p,issues);
  if (!isNonNegativeInteger(value['proposalIndex'])) issues.push({field:`${p}.proposalIndex`,code:'INVALID_NUMBER',message:'proposalIndex must be non-negative.'});
  else if (value['proposalIndex'] !== index) issues.push({field:p+'.proposalIndex',code:'INVALID_STATE',message:'proposalIndex must match its deterministic array position.'});
  if (!isInVocabulary(value['action'],UPDATE_ACTIONS)) issues.push({field:`${p}.action`,code:'INVALID_VOCABULARY',message:'action is invalid.'});
  if (value['memoryId'] !== null && !isSafeArtifactId(value['memoryId'])) issues.push({field:`${p}.memoryId`,code:'UNSAFE_ID',message:'memoryId must be null or safe.'});
  if (!isInVocabulary(value['disposition'],FINALIZATION_DISPOSITIONS)) issues.push({field:`${p}.disposition`,code:'INVALID_VOCABULARY',message:'disposition is invalid.'});
  if (!isInVocabulary(value['reasonCode'],LIFECYCLE_REASON_CODES)) issues.push({field:`${p}.reasonCode`,code:'INVALID_VOCABULARY',message:'reasonCode is invalid.'});
  if (!isNonEmptyString(value['explanation']) || !isNonEmptyString(value['recommendedAction'])) issues.push({field:p,code:'MISSING_REQUIRED',message:'Disposition explanations and recommended actions are required.'});
  if (!isNonEmptyStringArray(value['triggeredRules']) || new Set(value['triggeredRules']).size !== value['triggeredRules'].length) issues.push({field:`${p}.triggeredRules`,code:'INVALID_TYPE',message:'triggeredRules must contain unique non-empty strings.'});
  if (typeof value['storageChanged'] !== 'boolean') issues.push({field:`${p}.storageChanged`,code:'INVALID_TYPE',message:'storageChanged must be boolean.'});
  validateSafeUniqueArray(value['auditReferences'],`${p}.auditReferences`,issues);
  if (value['disposition'] !== 'APPLIED' && value['storageChanged'] === true) issues.push({field:p+'.storageChanged',code:'INVALID_STATE',message:'Only APPLIED dispositions may report a storage change.'});
  if (terminal && value['disposition'] === 'APPLIED' && value['storageChanged'] !== true) issues.push({field:p+'.storageChanged',code:'INVALID_STATE',message:'Terminal APPLIED dispositions must account for a completed storage change.'});
  if (terminal && Array.isArray(value['auditReferences']) && value['auditReferences'].length === 0) issues.push({field:p+'.auditReferences',code:'MISSING_REQUIRED',message:'Terminal dispositions require a finalization audit reference.'});
}