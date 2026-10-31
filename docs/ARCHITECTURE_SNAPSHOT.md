# Architecture snapshot: write, retrieval and forgetting paths

A one-page overview. The full design is in [ARCHITECTURE.md](ARCHITECTURE.md); the
memory and audit schemas are in [PROTOCOL_SPECIFICATION.md](PROTOCOL_SPECIFICATION.md).

Every remembered fact is one JSON claim in `.tamhees/memories/records/`, tagged with:

| Tag | Field | Example |
|-----|-------|---------|
| Source | `source.type`, `source.reference` | `REPOSITORY_STATE` · `package.json` |
| Confidence | `confidence` + `verificationStatus` | `HIGH` · `INFERRED` (8 authority levels, from `OWNER_CONFIRMED` down to `REVOKED`) |
| Freshness | `freshness.lastVerified`, `reviewAfter`, `expiresAfter` | verified 20 days ago, expires in 90 |
| Scope | `scope` | `PROJECT`, or `RESTRICTED` to an environment / component / path |
| Permission | `actionPermission` | `MAY_ACT` … `ASK_BEFORE_CHANGE` … `MUST_NOT_ACT` |
| Privacy | `sensitivity` | `PUBLIC`, `INTERNAL`, `SENSITIVE`, `SECRET` |

```mermaid
flowchart TB
  subgraph W["① WRITE PATH: tamhees memory apply / evidence add / lifecycle finalize"]
    direction LR
    W1["Agent proposes a<br/>strict JSON candidate"] --> W2["Schema + vocabulary<br/>validation"]
    W2 --> W3{"Secret-like<br/>content?"}
    W3 -- yes --> WX["Refused<br/>nothing stored"]
    W3 -- no --> W4{"Authority and<br/>source allowed?"}
    W4 -- "no: authority escalation<br/>or source/status mismatch" --> WX
    W4 -- yes --> W5["Evidence refs exist ·<br/>optimistic concurrency"]
    W5 --> W6["Archive prior state<br/>(update / revoke only)"]
    W6 --> W7["Atomic write<br/>temp file + rename"]
    W7 --> W8["Index + append-only<br/>audit event"]
  end

  subgraph R["② RETRIEVAL PATH: tamhees context / lifecycle begin / MCP begin_task"]
    direction LR
    R1["Task text<br/>(secret-like input redacted)"] --> R2["Load claims<br/>+ evidence"]
    R2 --> R3["Per-claim gates:<br/>privacy → revoked → audit<br/>(conflict / block) → expiry<br/>→ scope → relevance"]
    R3 -- fails --> RX["Excluded,<br/>with reason code"]
    R3 -- passes --> R4["Score = relevance +<br/>authority + freshness + safety"]
    R4 --> R5["Hard token budget<br/>(whole claims only)"]
    R5 --> R6["Context pack: each claim shows<br/>source status · confidence ·<br/>audit outcome · why it ranked"]
    R6 --> R7{"Pack validator<br/>(fail-closed)"}
    R7 -- ok --> R8["Served to agent,<br/>never persisted"]
  end

  subgraph F["③ FORGETTING PATH: how a claim stops guiding action"]
    direction LR
    F1["Time passes:<br/>reviewAfter / expiresAfter"] --> F1o["RECHECK<br/>expired = excluded"]
    F2["Contradicting evidence: from an agent,<br/>or found by tamhees observe"] --> F2o["BLOCK_ACTION<br/>excluded · ask owner"]
    F3["Owner revokes or<br/>supersedes"] --> F3o["REVOKED tombstone<br/>MUST_NOT_ACT · prior state archived"]
    F4["Owner withdraws consent<br/>or secret detected"] --> F4o["FORGET_OR_REDACT<br/>raw text erased, not archived;<br/>safe audit metadata kept"]
  end

  W8 -.-> R2
  RX -.-> F
```

## The five outcomes an agent can receive

| Outcome | Meaning for the agent | Typical trigger |
|---------|----------------------|-----------------|
| `TRUST` | Use it within its permission | Current, supported, owner- or repo-verified |
| `RECHECK` | "I might be wrong": verify before acting | Past review date, expired, act-with-caution, weak evidence |
| `ASK_OWNER` | "I'm guessing": get approval first | AI inference, owner claim without owner evidence |
| `BLOCK_ACTION` | Do not act on this | Contradicting evidence, revoked, must-not-act |
| `FORGET_OR_REDACT` | Must not be kept or shown | Secret-like content, owner privacy revocation |

Rules are fixed in source with stable IDs (`DM-RULE-*`) and applied in a documented
precedence order, so the same inputs always produce the same outcome. High
confidence never bypasses an authority, freshness, privacy, conflict or revocation gate.

## Where each path lives

| Path | Code | Proof |
|------|------|-------|
| Write | `src/core/mutations.ts`, `validation.ts`, `privacy.ts`, `atomic-write.ts`, `evidence.ts` | `test/mutations-and-audit.test.ts`, `test/scope-and-bundles.test.ts` |
| Retrieval | `src/core/context.ts`, `scope.ts`, `lifecycle.ts` | `test/context-*.test.ts`, `test/regression-expired-permission.test.ts` |
| Forgetting | `src/core/audit.ts` (rules), `mutations.ts` (REVOKE / REDACT), `quick.ts` (`forget` / `revoke`) | `test/mutations-and-audit.test.ts`, `test/quick-commands.test.ts`, `npm run failure-test` |
| Self-detection | `src/core/observe.ts` (`tamhees observe`) | `test/observe.test.ts`, step 6 of `npm run failure-test` |
| Agent access | `src/adapters/*`, `src/mcp/*` (4-tool stdio MCP) | `test/adapter*.test.ts`, `test/mcp-*.test.ts` |
