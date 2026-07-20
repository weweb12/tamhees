# Doubtful Memory — Protocol Specification

> **Status**: Memory, evidence, update-candidate, audit-event, controlled mutation, archive, and audit-precedence contracts are implemented in Phase 2. Retrieval budgets, lifecycle automation, migration, adapters, and dashboard behavior remain planned and are tracked in `docs/IMPLEMENTATION_ROADMAP.md`.

## Overview

The Doubtful Memory protocol defines how project memory is stored, verified, audited, and served. Every memory is a structured claim with evidence, authority, freshness, sensitivity, and permission metadata. The audit engine evaluates claims against deterministic rules and produces explainable outcomes.

---

## 1. Memory record schema

A memory record is the canonical unit of project memory.

```json
{
  "schemaVersion": "1.0.0",
  "id": "<memory-id>",
  "kind": "<OBSERVATION | REQUIREMENT | DECISION | ...>",
  "statement": "<plain-language statement of what is believed>",
  "source": {
    "type": "<source-type>",
    "reference": "<where evidence can be checked>",
    "agent": "<agent that created the record, if applicable>"
  },
  "verificationStatus": "<status-vocabulary-value>",
  "confidence": "<confidence-vocabulary-value>",
  "sensitivity": "<sensitivity-vocabulary-value>",
  "actionPermission": "<permission-vocabulary-value>",
  "freshness": {
    "lastVerified": "<ISO-8601 date>",
    "reviewAfter": "<ISO-8601 date or condition>",
    "expiresAfter": "<ISO-8601 date, optional>"
  },
  "relationships": {
    "supersedes": "<memory-id, optional>",
    "supersededBy": "<memory-id, optional>",
    "conflictsWith": ["<memory-id>"],
    "supportedBy": ["<evidence-id>"],
    "relatedTo": ["<memory-id>"]
  },
  "tags": ["<optional-tag>"],
  "recheckMethod": "<how to validate this statement, optional>",
  "notes": "<relevant limitations or context, optional>",
  "createdAt": "<ISO-8601 datetime>",
  "updatedAt": "<ISO-8601 datetime>"
}
```

### Required fields

- `schemaVersion`, `id`, `kind`, `statement`, `source`, `verificationStatus`, `confidence`, `sensitivity`, `actionPermission`, `freshness`, `relationships`, `tags`, `createdAt`, `updatedAt`

### Optional fields

- `freshness.reviewAfter`, `freshness.expiresAfter`, `relationships.*`, `recheckMethod`, `notes`, `source.agent`

---

## 2. Evidence schema

Evidence records support or contradict memory claims.

```json
{
  "schemaVersion": "1.0.0",
  "id": "<evidence-id>",
  "type": "<evidence-type>",
  "source": "<where the evidence was found>",
  "content": "<summary of the evidence>",
  "relationship": "SUPPORTS | CONTRADICTS | NEUTRAL",
  "memoryIds": ["<memory-id>"],
  "collectedAt": "<ISO-8601 datetime>",
  "collectedBy": "<agent or process>",
  "notes": "<optional context>"
}
```

### Evidence types

| Type | Meaning |
|------|---------|
| `OWNER_INSTRUCTION` | Direct owner statement or approval |
| `REPOSITORY_STATE` | Current file, config, or code state |
| `TEST_RESULT` | Output of an automated test |
| `AGENT_OBSERVATION` | Agent-observed fact during task execution |
| `DOCUMENT_REFERENCE` | External document or specification |
| `CONVERSATION_RECORD` | Owner conversation or approval record |

### Evidence storage rules

1. `content` is a privacy-safe summary, not a raw file dump, credential, or conversation transcript.
2. Evidence must reference at least one existing memory ID.
3. Evidence IDs are immutable; duplicate IDs are rejected rather than overwritten.
4. Common secret-like patterns are rejected before persistence without echoing the candidate value.
5. Evidence is data, not authority by itself. Owner promotion specifically requires supporting `OWNER_INSTRUCTION` evidence and the controlled mutation workflow.

---

## 3. Status vocabulary

Status describes the verification state of a memory record.

| Status | Meaning | Can produce TRUST? | Can authorize scope? |
|--------|---------|-------------------|---------------------|
| `OWNER_CONFIRMED` | Owner explicitly approved this information | Yes | Yes |
| `REPO_VERIFIED` | Verified against current repository evidence | Yes | No (implementation only) |
| `TEST_VERIFIED` | Verified by passing automated tests | Yes | No (behavior only) |
| `OBSERVED` | Directly observed by agent or process | Yes, with conditions | No |
| `INFERRED` | Derived by agent reasoning | Only with additional evidence | No |
| `UNKNOWN` | No verification evidence available | No | No |
| `CONFLICTED` | Contradictory evidence exists | No | No |
| `REVOKED` | Explicitly invalidated or superseded | No | No |

### Status transition rules

1. `INFERRED` → `OWNER_CONFIRMED`: Requires explicit owner evidence. Never automatic.
2. `INFERRED` → `OBSERVED`: Requires direct observation evidence.
3. `INFERRED` → `REPO_VERIFIED`: Requires current repository evidence.
4. `OWNER_CONFIRMED` → `CONFLICTED`: When current evidence contradicts the confirmed claim.
5. `OWNER_CONFIRMED` → `REVOKED`: Only when owner explicitly revokes.
6. Any → `REVOKED`: Preserves the record in archive with supersession reference.
7. `CONFLICTED` → Resolution: Requires owner intervention for scope decisions.

---

## 4. Confidence vocabulary

Confidence describes the assessed reliability of a claim.

| Value | Meaning |
|-------|---------|
| `HIGH` | Strong supporting evidence, recently verified |
| `MEDIUM` | Reasonable evidence but not recently verified or partially supported |
| `LOW` | Weak evidence, old, or based primarily on inference |

### Confidence rules

1. Confidence is separate from status and permission.
2. `HIGH` confidence cannot override a `CONFLICTED` status.
3. `LOW` confidence alone cannot authorize significant actions.
4. Confidence may decrease automatically when freshness expires.
5. Confidence may not increase without new supporting evidence.

---

## 5. Sensitivity vocabulary

Sensitivity classifies the retention and exposure handling of a record.

| Value | Meaning |
|-------|---------|
| `PUBLIC` | Safe for inclusion in any output |
| `INTERNAL` | Project-internal, not for public exposure |
| `SENSITIVE` | Requires redaction before external output |
| `SECRET` | Must not be retained in raw form; redact immediately |

### Sensitivity rules (implemented in Phase 2)

1. `SECRET` records trigger `FORGET_OR_REDACT`.
2. New memory and evidence candidates matching common secret patterns are rejected before persistence without echoing the candidate value.
3. `REDACT` replaces legacy raw content with a safe tombstone and never copies the raw value into archive or audit history.
4. New `SENSITIVE`, `SECRET`, or `FORGET_OR_REDACT` records may retain only explicitly redacted statement/source fields and the safe `redacted` tag.
5. Legacy `SENSITIVE` memory is defensively redacted in CLI and context output until a controlled `REDACT` operation removes it.
6. Pattern detection is defensive, not exhaustive; absence of a match does not prove content is safe.
7. No real secrets may appear in examples or tests.

---

## 6. Permission vocabulary

Permission controls what actions an agent may take based on a memory record.

| Value | Meaning |
|-------|---------|
| `MAY_ACT` | Agent may proceed based on this information |
| `ACT_WITH_CAUTION` | Agent may proceed but must verify related conditions |
| `ASK_BEFORE_CHANGE` | Agent must obtain owner approval before significant changes |
| `MUST_NOT_ACT` | Agent must not use this to authorize action |
| `FORGET_OR_REDACT` | Agent must not retain raw content |

### Permission rules

1. Permission is separate from confidence and status.
2. Missing permission defaults to `ASK_BEFORE_CHANGE`.
3. `MUST_NOT_ACT` cannot be overridden by confidence.
4. Permission interacts with status: `REVOKED` status forces `MUST_NOT_ACT` regardless of recorded permission.

---

## 7. Relationships

Memory records can reference other records and evidence.

| Relationship | Meaning |
|-------------|---------|
| `supersedes` | This record replaces the referenced record |
| `supersededBy` | This record has been replaced by the referenced record |
| `conflictsWith` | Evidence contradicts the referenced record |
| `supportedBy` | Evidence IDs that support this record |
| `relatedTo` | Informational relationship without authority implications |

### Relationship rules

1. When a record is superseded, the original is marked `REVOKED` with `supersededBy` set.
2. The superseding record sets `supersedes` to the original's ID.
3. The prior active state moves to archive while a revoked canonical tombstone remains addressable by ID.
4. `conflictsWith` relationships prevent either record from producing `TRUST`.

---

## 8. Authority rules

Authority determines what types of evidence can authorize different categories of decisions.

### Authority precedence

1. Applicable system and legal restrictions.
2. Explicit current owner instructions.
3. Verified current repository evidence.
4. Recorded owner-confirmed decisions.
5. Reliable observations and test results.
6. Inferences and historical context.

### Non-escalation rules

1. An AI inference can never become `OWNER_CONFIRMED` automatically.
2. Repository evidence can verify implementation state but cannot authorize: product scope, budget, privacy, publication, or external-service decisions.
3. Tests can verify behavior but cannot approve owner decisions.
4. Owner decisions require explicit owner evidence.
5. The system must never treat its own generated summary as independent supporting evidence.
6. The MCP update capability must enforce the same authority rules as the CLI.

---

## 9. Freshness rules (implemented in Phase 2)

Freshness determines whether a memory record may still be considered current.

### Rules

1. Every record has a `lastVerified` date.
2. If `reviewAfter` is set and the current date exceeds it, the record requires review.
3. If `expiresAfter` is set and the current date exceeds it, the record cannot produce `TRUST`.
4. Expired records automatically receive `RECHECK` audit outcome.
5. Conditional `reviewAfter` values that cannot be evaluated automatically produce `RECHECK`.
6. Automatic confidence degradation remains planned; Phase 2 does not silently rewrite confidence during an audit.
7. `lastVerified` may only be updated after actual verification against the stated source.

---

## 10. Audit outcomes (implemented)

The audit engine produces one primary outcome per evaluated record.

| Outcome | Meaning | Requires |
|---------|---------|----------|
| `TRUST` | Evidence supports use within recorded permission | Sufficient evidence, no conflict, not revoked, not expired, adequate authority |
| `RECHECK` | Record may be stale, incomplete, or insufficiently verified | Review before relying on it |
| `ASK_OWNER` | Human confirmation required | Owner decision needed |
| `BLOCK_ACTION` | Proposed action must not proceed | Conflict, revocation, or insufficient permission |
| `FORGET_OR_REDACT` | Raw content must not be retained | Secret or unnecessarily sensitive content detected |

### Outcome priority (highest to lowest)

1. `FORGET_OR_REDACT` — Privacy protection takes precedence.
2. `BLOCK_ACTION` — Safety blocking takes precedence over uncertainty.
3. `ASK_OWNER` — Owner escalation takes precedence over partial trust.
4. `RECHECK` — Uncertainty takes precedence over trust.
5. `TRUST` — Only when no higher-priority condition applies.

---

## 11. Rule precedence (implemented)

Audit rules are evaluated in defined order. Each rule has a stable identifier.

### Rule categories and stable Phase 2 identifiers

1. **Privacy**: `DM-RULE-PRIV-001`, `DM-RULE-PRIV-002`.
2. **Revocation**: `DM-RULE-REVOKE-001`.
3. **Conflict**: `DM-RULE-CONFLICT-001`.
4. **Authority**: `DM-RULE-AUTH-001` through `DM-RULE-AUTH-006`.
5. **Freshness**: `DM-RULE-FRESH-001`, `DM-RULE-FRESH-002`.
6. **Evidence**: `DM-RULE-EVID-001`, `DM-RULE-EVID-002`.
7. **Trust**: `DM-RULE-TRUST-001`.

Higher-category rules take precedence. Within each category, source order in `src/core/audit.ts` is the canonical deterministic order.

| Rule ID | Behavior |
|---------|----------|
| `DM-RULE-PRIV-001` | SECRET sensitivity requires forgetting or redaction. |
| `DM-RULE-PRIV-002` | FORGET_OR_REDACT permission prevents retention. |
| `DM-RULE-REVOKE-001` | Revoked or superseded memory cannot authorize action. |
| `DM-RULE-CONFLICT-001` | Declared or evidence-backed conflict blocks action. |
| `DM-RULE-AUTH-001` | Agent inference cannot become owner-confirmed automatically. |
| `DM-RULE-AUTH-002` | MUST_NOT_ACT permission blocks action. |
| `DM-RULE-AUTH-003` | ASK_BEFORE_CHANGE escalates to the owner. |
| `DM-RULE-AUTH-004` | OWNER_CONFIRMED requires stored supporting owner evidence during audit. |
| `DM-RULE-AUTH-005` | ACT_WITH_CAUTION requires recheck. |
| `DM-RULE-AUTH-006` | Controlled mutations must pass authority validation. |
| `DM-RULE-FRESH-001` | Expired memory requires re-verification. |
| `DM-RULE-FRESH-002` | Due or conditional review requires re-verification. |
| `DM-RULE-EVID-001` | Declared support IDs must exist and support the memory. |
| `DM-RULE-EVID-002` | Unknown, inferred, low-confidence, or unsupported memory requires recheck. |
| `DM-RULE-TRUST-001` | Current, sufficiently supported memory may be trusted within permission. |

### Rule storage

Audit rules are packaged in source code with stable IDs. They are not stored in an easily modified project configuration file that could silently change engine behavior.

---

## 12. Context-pack contract

A context pack is the output of the context compiler for a specific task.

```json
{
  "schemaVersion": "1.0.0",
  "taskDescription": "<what the task needs>",
  "selectionStrategy": "<Phase 2: audit-aware deterministic lexical/tag selection>",
  "selected": [
    {
      "memoryId": "<id>",
      "statement": "<the statement, redacted if sensitive>",
      "reason": "<why selected>",
      "auditOutcome": "<outcome>",
      "verificationStatus": "<status>",
      "confidence": "<confidence>",
      "tags": ["<tag>"]
    }
  ],
  "excluded": [
    {
      "memoryId": "<id>",
      "reason": "<why excluded: irrelevant | revoked | redacted>"
    }
  ],
  "warnings": ["<any audit warnings>"],
  "generatedAt": "<ISO-8601 datetime>"
}
```

### Phase 2 Context-pack fields
- The structure above is the implemented canonical structure.
- Retrieval uses deterministic lexical/tag filtering followed by the complete audit precedence chain.
- Blocked, revoked, redacted, or irrelevant records have explicit exclusion reasons.

### Later planned fields
- **Budget and Ranking (Phase 3+)**: Fields such as `budget.maxTokens`, `budget.estimatedTokens`, and `budget.compliant` are planned for future phases when semantic search and strict capacity enforcement are added.

### Context-pack rules

1. The pack explains every selection and exclusion decision.
2. Context packs are ephemeral by default — not permanently cached.
3. Generated context is returned in memory/stdout or stored temporarily under Git-ignored runtime storage.
4. Sensitive material is redacted before inclusion.
5. No real secrets appear in context output.
6. Phase 3 adds a hard configured budget that must never be exceeded.

---

## 13. Update-candidate contract

When the engine or an adapter proposes a memory update:

```json
{
  "schemaVersion": "1.0.0",
  "action": "CREATE | UPDATE | REVOKE | REDACT",
  "memoryId": "<id, required for UPDATE/REVOKE/REDACT>",
  "proposedRecord": { "...memory-record-fields..." },
  "evidence": ["<evidence-id>"],
  "proposedBy": "<agent or process>",
  "authorityLevel": "<status the proposer claims>",
  "requiresOwnerApproval": true,
  "reason": "<why this mutation is proposed>",
  "supersededBy": "<replacement memory ID, optional for REVOKE>",
  "timestamp": "<ISO-8601 datetime>"
}
```

### Implemented update rules

1. Proposed status must not exceed the proposer's authority level.
2. `OWNER_CONFIRMED` requires owner evidence — never automatic.
3. Updates must preserve the superseded record and relationship.
4. Destructive forgetting preserves safe audit metadata.
5. The same authority rules apply regardless of interface (CLI, MCP, adapter).
6. Updates use optimistic concurrency: a proposed record's `updatedAt` must match the canonical record before the engine assigns a new timestamp.
7. `CREATE` rejects duplicate IDs; `UPDATE`, `REVOKE`, and `REDACT` reject missing IDs.
8. Pre-update and pre-revoke states are archived. Raw content removed by `REDACT` is never archived.
9. Owner-confirmed promotion is a two-step workflow: create a lower-authority record, attach stored owner-instruction evidence, then submit a promotion candidate referencing that evidence.
10. A candidate's self-declared authority does not replace explicit supporting owner evidence.
11. A lower-authority candidate cannot overwrite or revoke a higher-authority canonical record.
12. Verified statuses must align with provenance (`REPO_VERIFIED` with repository state, `TEST_VERIFIED` with test results, and observations with observation sources).
13. `REDACT` is the privacy-first exception to ordinary authority ordering; it removes raw content but cannot create new authority.

---

## 14. Audit-event contract

Each audit event is appended to the JSONL audit log.

```json
{
  "schemaVersion": "1.0.0",
  "eventId": "<unique-event-id>",
  "timestamp": "<ISO-8601 datetime>",
  "memoryId": "<audited-memory-id>",
  "outcome": "<TRUST | RECHECK | ASK_OWNER | BLOCK_ACTION | FORGET_OR_REDACT>",
  "triggeredRules": ["<rule-id>"],
  "evidenceExamined": ["<evidence-id>"],
  "explanation": "<plain-language summary>",
  "permissionConsequence": "<what the agent may or may not do>",
  "recommendedAction": "<next step>",
  "auditor": "<engine-version or manual>",
  "engineVersion": "<version, if automated>"
}
```

### Phase 2 audit-event compatibility
- New events include `evidenceExamined`.
- The field remains optional during validation so existing Phase 1 history rows remain readable without destructive migration.
- Audit batches are fully validated before one atomic history replacement, preventing partially written batches.

---

## 15. Validation and migration behavior

### Validation rules

1. Every stored artifact must include `schemaVersion`.
2. Unknown schema versions produce a validation error with migration guidance.
3. Missing required fields produce a validation error.
4. Unknown status, confidence, sensitivity, or permission values produce a validation error.
5. Duplicate IDs produce a validation error.

### Migration behavior

1. Schema migrations are forward-only.
2. Migration preserves all authority levels and relationships.
3. Migration from bootstrap Markdown to JSON is a one-time operation.
4. Migration does not elevate `INFERRED` to `OWNER_CONFIRMED`.
5. Migration produces an audit event recording the transformation.
6. The original bootstrap files are preserved (not deleted during migration).
