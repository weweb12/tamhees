# Doubtful Memory — Protocol Specification

> **Status**: This document defines the proposed protocol. Approval of this specification does not mean it is implemented. Implementation status is tracked in `docs/IMPLEMENTATION_ROADMAP.md` and `PROJECT_STATE.md`.

## Overview

The Doubtful Memory protocol defines how project memory is stored, verified, audited, and served. Every memory is a structured claim with evidence, authority, freshness, sensitivity, and permission metadata. The audit engine evaluates claims against deterministic rules and produces explainable outcomes.

---

## 1. Memory record schema

A memory record is the canonical unit of project memory.

```json
{
  "schemaVersion": "1.0.0",
  "id": "<memory-id>",
  "claim": "<plain-language statement of what is believed>",
  "source": {
    "type": "<source-type>",
    "reference": "<where evidence can be checked>",
    "agent": "<agent that created the record, if applicable>"
  },
  "status": "<status-vocabulary-value>",
  "confidence": "<confidence-vocabulary-value>",
  "sensitivity": "<sensitivity-vocabulary-value>",
  "permission": "<permission-vocabulary-value>",
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
  "recheckMethod": "<how to validate this claim>",
  "tags": ["<optional-tag>"],
  "notes": "<relevant limitations or context>",
  "createdAt": "<ISO-8601 datetime>",
  "updatedAt": "<ISO-8601 datetime>"
}
```

### Required fields

- `schemaVersion`, `id`, `claim`, `source`, `status`, `confidence`, `sensitivity`, `permission`, `freshness.lastVerified`

### Optional fields

- `freshness.reviewAfter`, `freshness.expiresAfter`, `relationships.*`, `recheckMethod`, `tags`, `notes`, `source.agent`

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

### Sensitivity rules

1. `SECRET` records trigger `FORGET_OR_REDACT` audit outcome.
2. `SENSITIVE` records are redacted before output, persistence, logging, or export.
3. Sensitivity affects what appears in context packs.
4. No real secrets may appear in examples or tests.

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
3. Both records remain in storage (original moves to archive).
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

## 9. Freshness rules

Freshness determines whether a memory record may still be considered current.

### Rules

1. Every record has a `lastVerified` date.
2. If `reviewAfter` is set and the current date exceeds it, the record requires review.
3. If `expiresAfter` is set and the current date exceeds it, the record cannot produce `TRUST`.
4. Expired records automatically receive `RECHECK` audit outcome.
5. Freshness degradation may reduce confidence automatically.
6. `lastVerified` may only be updated after actual verification against the stated source.

---

## 10. Audit outcomes

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

## 11. Rule precedence

Audit rules are evaluated in defined order. Each rule has a stable identifier.

### Rule categories (proposed order)

1. **Privacy rules** (DM-RULE-PRIV-*): Detect and handle sensitive content.
2. **Revocation rules** (DM-RULE-REVOKE-*): Detect revoked or superseded records.
3. **Conflict rules** (DM-RULE-CONFLICT-*): Detect contradictory evidence.
4. **Authority rules** (DM-RULE-AUTH-*): Verify authorization level for proposed action.
5. **Freshness rules** (DM-RULE-FRESH-*): Detect stale or expired records.
6. **Evidence rules** (DM-RULE-EVID-*): Verify evidence sufficiency.
7. **Trust rules** (DM-RULE-TRUST-*): Confirm conditions for trust.

Higher-category rules take precedence. Within a category, specific rule order is defined during implementation.

### Rule storage

Audit rules are packaged in source code with stable IDs. They are not stored in an easily modified project configuration file that could silently change engine behavior.

---

## 12. Context-pack contract

A context pack is the output of the context compiler for a specific task.

```json
{
  "schemaVersion": "1.0.0",
  "taskDescription": "<what the task needs>",
  "budget": {
    "maxTokens": "<configured limit>",
    "estimatedTokens": "<actual estimated usage>",
    "compliant": true
  },
  "selected": [
    {
      "memoryId": "<id>",
      "reason": "<why selected>",
      "auditOutcome": "<outcome>",
      "redacted": false
    }
  ],
  "excluded": [
    {
      "memoryId": "<id>",
      "reason": "<why excluded: irrelevant | expired | conflicted | demoted | over-budget | redacted>"
    }
  ],
  "warnings": ["<any audit warnings>"],
  "generatedAt": "<ISO-8601 datetime>"
}
```

### Context-pack rules

1. Hard configured budget must not be exceeded.
2. The pack explains every selection and exclusion decision.
3. Context packs are ephemeral by default — not permanently cached.
4. Generated context is returned in memory/stdout or stored temporarily under Git-ignored runtime storage.
5. Sensitive material is redacted before inclusion.
6. No real secrets in context output.

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
  "timestamp": "<ISO-8601 datetime>"
}
```

### Update rules

1. Proposed status must not exceed the proposer's authority level.
2. `OWNER_CONFIRMED` requires owner evidence — never automatic.
3. Updates must preserve the superseded record and relationship.
4. Destructive forgetting preserves safe audit metadata.
5. The same authority rules apply regardless of interface (CLI, MCP, adapter).

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
