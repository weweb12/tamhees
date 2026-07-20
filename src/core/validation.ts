/**
 * Doubtful Memory — Runtime Validation
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
