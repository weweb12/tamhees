# Doubtful Memory — Architecture

> **Status**: This document describes the overall architecture. Phase 2 engine, CLI, local storage, evidence, controlled mutations, archive handling, and audit precedence are implemented. Retrieval budgets, lifecycle automation, adapters, MCP, dashboard, and benchmarks remain planned.

## Overview

Doubtful Memory is a local developer tool that treats AI coding-agent memory as evidence-backed claims subject to auditing, authority rules, and privacy controls. The system is built around a tool-neutral engine (`gptbrain`) that stores, retrieves, audits, and serves project memory through a CLI and thin agent adapters.

## Component boundaries

```
┌─────────────────────────────────────────────────────────┐
│                    Local Machine                         │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Codex       │  │ Claude Code  │  │ Antigravity  │  │
│  │  Adapter     │  │  Adapter     │  │  Adapter     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │           │
│         └────────┬────────┴────────┬────────┘           │
│                  │                 │                     │
│  ┌───────────────▼─────────────────▼──────────────┐     │
│  │              gptbrain CLI                       │     │
│  └───────────────┬────────────────────────────────┘     │
│                  │                                       │
│  ┌───────────────▼──────────────────────────────┐       │
│  │           gptbrain Engine                     │       │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐     │       │
│  │  │ Memory   │ │ Context  │ │ Audit    │     │       │
│  │  │ Store    │ │ Compiler │ │ Engine   │     │       │
│  │  └──────────┘ └──────────┘ └──────────┘     │       │
│  └───────────────┬──────────────────────────────┘       │
│                  │                                       │
│  ┌───────────────▼──────────────────────────────┐       │
│  │           .gptbrain/ Local Storage            │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐                     │
│  │ Local MCP    │  │   Local      │                     │
│  │ (stdio)      │  │  Dashboard   │                     │
│  └──────────────┘  └──────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

## Canonical source of truth

There is exactly one canonical representation of each memory record: its JSON file under `.gptbrain/memories/records/`. All adapters, the CLI, the MCP interface, and the dashboard read from and write to this single store through the engine. No adapter maintains its own copy of canonical memory.

## .gptbrain/ storage

```
.gptbrain/
├── config.json           # Project configuration, schema version
├── state.json            # Runtime state (current phase, last operation)
├── memories/
│   ├── index.json        # Memory index for fast lookup
│   └── records/
│       └── <memory-id>.json   # One atomic JSON record per memory
├── evidence/
│   └── <evidence-id>.json     # Supporting evidence records
├── audits/
│   └── history.jsonl     # Append-only audit event log
├── episodes/             # Session episode records
├── archive/
│   └── memories/<memory-id>/  # Immutable pre-update/revoke snapshots
└── runtime/              # Ephemeral runtime data (Git-ignored)
```

### Storage invariants

1. **One record per file**: Each memory has exactly one canonical JSON file.
2. **Atomic writes**: All writes use temporary-file-plus-rename to prevent corruption.
3. **Logical append-only audit history**: New JSONL batches are validated in memory and committed by one atomic file replacement. Multi-process locking is not yet implemented.
4. **Deterministic ordering**: Serialized output uses sorted keys for Git-friendly diffs.
5. **Schema versioning**: Every stored artifact includes a `schemaVersion` field.
6. **No database**: Version 1 uses filesystem storage only.
7. **Index consistency**: The index must match the records directory. Divergence is a detectable error.
8. **Runtime isolation**: The `runtime/` directory is Git-ignored and holds ephemeral data only.

## Authority model

The system distinguishes eight statuses for memory verification:

| Status | Meaning | Can become TRUST? | Can authorize scope changes? |
|--------|---------|-------------------|------------------------------|
| `OWNER_CONFIRMED` | Owner explicitly approved | Yes | Yes |
| `REPO_VERIFIED` | Verified against current repository state | Yes | No (implementation state only) |
| `TEST_VERIFIED` | Verified by passing tests | Yes | No (behavior verification only) |
| `OBSERVED` | Directly observed evidence | Yes, with conditions | No |
| `INFERRED` | Agent-generated inference | Only with additional evidence | No |
| `UNKNOWN` | No evidence available | No | No |
| `CONFLICTED` | Contradictory evidence exists | No | No |
| `REVOKED` | Explicitly revoked or superseded | No | No |

### Authority rules

1. An AI inference can never become `OWNER_CONFIRMED` automatically.
2. Agent-generated memories default to `INFERRED` or `OBSERVED` according to evidence.
3. Repository evidence can verify implementation state but cannot authorize product scope, budget, privacy, publication, or external-service decisions.
4. Tests can verify behavior but cannot approve owner decisions.
5. Owner decisions require explicit owner evidence.
6. Material automatic updates must be validated and auditable.
7. Replacements must preserve the superseded record and relationship.
8. Destructive forgetting/redaction must preserve safe audit metadata without retaining prohibited raw content.
9. The MCP update capability must enforce the same authority rules as the CLI.
10. The system must never treat its own generated summary as independent supporting evidence.

### Revocation

A `REVOKED` status prevents the record from authorizing any action. The pre-revocation state is preserved in archive and the canonical record becomes a revoked tombstone. Audit metadata is retained. A `REDACT` operation is deliberately different: prohibited raw content is not copied into archive.

## Context compiler

The context compiler assembles task-specific memory context packs for agent consumption.

### Implemented Phase 2 behavior

1. Accept a task description or query.
2. Retrieve relevant memories through deterministic lexical/tag matching.
3. Apply the full audit precedence chain before serving memory.
4. Include selection explanations: why each memory was selected, excluded, expired, conflicted, or demoted.
5. Redact sensitive content before output.
6. Return the context pack to the caller (stdout, memory, or temporary runtime file).

### Current invariants

- Context packs are ephemeral by default — not permanently cached.
- Generated context may be stored temporarily under Git-ignored `runtime/` only when necessary.
- Runtime-generated sensitive context must never be committed.
- The system explains selected, excluded, expired, conflicted, and demoted records.

Hard budget enforcement and authority/freshness ranking remain Phase 3 work.

## Audit engine

The audit engine evaluates memory records against deterministic rules.

### Implemented Phase 2 behavior

1. Accept a memory record and available evidence.
2. Apply audit rules in defined precedence order.
3. Produce a primary outcome: `TRUST`, `RECHECK`, `ASK_OWNER`, `BLOCK_ACTION`, or `FORGET_OR_REDACT`.
4. Record triggered rule identifiers, evidence examined, and plain-language explanation.
5. Append an audit event to the JSONL history.

### Invariants

- Same input always produces the same output.
- Rule precedence is documented and deterministic.
- Audit rules are packaged in source code with stable IDs, not in an easily modified configuration file that silently changes engine behavior.
- Every audit event is recorded in the append-only log.
- No hosted model or API is required.

## CLI (`gptbrain`)

The CLI is the primary human interface to the engine.

### Implemented commands

| Command | Purpose |
|---------|---------|
| `gptbrain init` | Initialize `.gptbrain/` in the current project |
| `gptbrain memory list` | List canonical memory records |
| `gptbrain memory show <id>` | Show one canonical memory record |
| `gptbrain memory apply --input <file>` | Apply a validated create, update, revoke, or redact candidate |
| `gptbrain evidence list` | List evidence records |
| `gptbrain evidence add --input <file>` | Add a validated evidence record |
| `gptbrain audit` | Run audit on specified or all memories |
| `gptbrain context` | Compile a task-specific context pack |

### Invariants

- All CLI operations go through the engine (no direct file manipulation).
- CLI argument parsing uses Node.js built-ins (`process.argv`, `util.parseArgs`).
- Exit codes follow conventions (0 = success, 1 = error, 2 = usage error).

## Adapter boundaries

Each adapter is a thin translation layer between a specific AI coding agent and the gptbrain engine. Adapters do not contain business logic, audit rules, or memory storage.

### Adapter responsibilities

1. Translate between the agent's expected format and the engine's API.
2. Invoke engine operations (retrieve context, propose updates, run audits).
3. Format engine output for the agent's consumption.
4. Respect the engine's authority and privacy rules.

### Adapter invariants

- No adapter maintains its own memory store.
- No adapter bypasses engine authority rules.
- Cross-adapter equivalence: the same memory query through different adapters must produce equivalent results.
- Adapters are not runtime dependencies of each other.

### Planned adapters

| Adapter | Agent | Integration method |
|---------|-------|-------------------|
| Codex | OpenAI Codex | Agent instruction hooks |
| Claude Code | Anthropic Claude Code | CLAUDE.md integration |
| Antigravity | Google Antigravity IDE | AGENTS.md / skill hooks |
| Generic | Any agent | Standard CLI / file interface |
| Local MCP | MCP-capable agents | stdio MCP server |

### Antigravity as development agent

Antigravity IDE (with Claude Opus 4.6 Thinking) is the currently approved development agent. It is not a product runtime dependency. The Antigravity adapter enables Doubtful Memory to serve context to Antigravity, not the reverse.

## Local MCP boundary

The local MCP adapter provides a stdio-based Model Context Protocol interface.

### Invariants

- stdio transport only — no HTTP, no remote connections.
- Enforces the same authority rules as the CLI.
- MCP SDK dependency is deferred until the MCP implementation phase.
- MCP specification changes are a tracked risk.

## Dashboard boundary

The local visual dashboard is a browser-based interface for viewing project memory, audit history, and memory status.

### Invariants

- The dashboard is a Version 1 release deliverable, not post-Version-1.
- Dashboard implementation is deferred until the core engine passes its release gates.
- Dashboard dependencies (React, Vite, etc.) are deferred until core engine gates pass.
- The dashboard reads from the same `.gptbrain/` storage through the engine.
- The dashboard does not bypass engine authority or privacy rules.

## Privacy boundary

### Invariants

1. Sensitive material is redacted before output, persistence, logging, or export.
2. No real secrets in examples or tests.
3. No telemetry or runtime network requests.
4. No accounts, API keys, hosted models, or cloud databases.
5. No external publication without owner approval.
6. Context packs are ephemeral by default.
7. Runtime-generated sensitive context must never be committed.

## No-runtime-network boundary

### Invariants

1. The core engine, CLI, adapters, and dashboard operate without network access after initial dependency installation.
2. No runtime HTTP requests.
3. No external API calls.
4. No telemetry or analytics.
5. No license-check pings.
6. The MCP adapter uses local stdio only.

## Automatic lifecycle

The system maintains project memory state automatically. Users do not manually update routine state after every task.

### Proposed lifecycle

1. **Pre-task retrieval**: Before a task begins, the adapter or CLI automatically retrieves relevant context.
2. **Task execution**: The agent works with the provided context.
3. **Post-task finalization**: After the task, proposed memory updates are validated through the engine's authority rules before being written.

### Invariants

- Automatic maintenance does not mean uncontrolled rewriting.
- Material automatic updates must be validated and auditable.
- The distinction between evidence levels is preserved during automatic updates.
- Owner decisions are never automatically overridden.

## Migration from bootstrap Markdown

The bootstrap memory exists in `memory/MEMORY_CLAIMS.md` and `memory/MEMORY_AUDIT.md`. Migration to `.gptbrain/` JSON remains planned for the controlled lifecycle milestone. The Markdown sources will be preserved.

### Migration invariants

1. Existing claims must be preserved with their original authority levels.
2. The migration must not elevate `INFERRED` claims to `OWNER_CONFIRMED`.
3. Superseded claims must remain visible with `REVOKED` status.
4. The migration itself must be auditable.
5. The bootstrap Markdown files are preserved during migration (not deleted during Phase 0).

## Important invariants summary

1. **Single source of truth**: One canonical JSON file per memory record.
2. **Authority non-escalation**: Inferences cannot become owner-confirmed automatically.
3. **Deterministic auditing**: Same input, same output, no hosted model.
4. **Privacy by default**: Redact before persist, log, or export.
5. **Ephemeral context**: Context packs are not permanently cached.
6. **Atomic writes**: Temp file + rename to prevent corruption.
7. **Cross-adapter equivalence**: Same query, same result, regardless of adapter.
8. **No runtime network**: Everything operates locally after dependency installation.
9. **Auditable history**: Append-only JSONL for audit events.
10. **Schema versioning**: Every stored artifact is versioned for migration.
