# Doubtful Memory

**A project brain that knows when it might be wrong.**

## What is this?

Doubtful Memory is a local developer tool for auditing AI coding-agent memory. It treats remembered project information as evidence-backed claims rather than unquestioned truth.

When memory conflicts with current evidence, contains sensitive information, lacks sufficient support, or may be outdated, the system explains the problem and restricts unsafe action.

## The problem

AI coding agents use project instructions, memory files, and prior decisions to continue work across sessions. These sources can become:

- **Inaccurate** because the project changed.
- **Invasive** because unnecessary private information was retained.
- **Overconfident** because an inference was presented as confirmed truth.
- **Unsafe** because an agent acted without verifying conflicting evidence.
- **Tool-specific** because memory formats differ between AI products.
- **Difficult to audit** because the reason behind a remembered fact is missing.

Existing memory and instruction systems provide continuity, but continuity alone does not prove that remembered information remains correct or safe to use.

## Intended product (Version 1)

- **gptbrain engine (temporary codename)**: Tool-neutral memory engine with deterministic audit rules.
- **gptbrain CLI (temporary codename)**: Command-line interface for initialization, memory management, context compilation, and auditing.
- **Structured local storage**: `.gptbrain/` directory with atomic JSON memory records and JSONL audit logs.
- **Authority model**: Eight-status verification model distinguishing owner decisions from agent inferences.
- **Context compiler**: Task-specific context packs with explicit budgets and selection explanations.
- **Agent adapters**: Codex, Claude Code, Antigravity, and generic adapters with cross-adapter equivalence.
- **Local MCP adapter**: stdio-based Model Context Protocol integration.
- **Deterministic benchmark harness**: Measures retrieval precision, recall, budget compliance, authority protection, and more.
- **Local visual dashboard**: Browser-based project memory viewer and audit explorer.

## Current status

> **Version 0.7.0 — Phases 5–7 are complete, independently verified locally, and checkpointed.**

The local engine retains the verified Phase 1–4 foundation and now adds five equivalent adapters, project-local managed instruction installation, a dependency-free local stdio MCP server, corrected positive-relevance eligibility, and a deterministic four-configuration benchmark. The current local suite contains 202 passing tests with zero failures, zero skipped tests, and zero todo tests. The repository remains local with no Git remote, upload, external service, telemetry, or runtime dependency. `gptbrain` and `.gptbrain/` remain temporary codenames.

Implemented commands:

- `gptbrain init [directory]`: Initialize safe `.gptbrain/` storage.
- `gptbrain memory list`: List canonical memory records.
- `gptbrain memory show <memory-id>`: Show one canonical record.
- `gptbrain memory apply --input <candidate.json>`: Apply a controlled `CREATE`, `UPDATE`, `REVOKE`, or `REDACT` candidate.
- `gptbrain evidence list`: List evidence records.
- `gptbrain evidence add --input <evidence.json>`: Add validated evidence.
- `gptbrain context --task "..." [--max-tokens <1-1000000>] [--format json|markdown]`: Compile an ephemeral, deterministically ranked context pack. The default hard budget is 2,048 estimated tokens.
- `gptbrain audit`: Apply the complete Phase 2 precedence chain and append privacy-safe audit events.
- `gptbrain lifecycle begin --task "..." [--max-tokens <n>] [--format json|markdown]`: Retrieve ephemeral safe context and open a lifecycle.
- `gptbrain lifecycle finalize --input <finalization.json> [--format json|markdown]`: Classify and safely process proposed updates.
- `gptbrain migrate bootstrap [--input memory/MEMORY_CLAIMS.md]`: Import the documented bootstrap ledger once without modifying it.
- `gptbrain adapter list|status|install|remove|begin|finalize`: Manage and invoke the five project-local adapters.
- `gptbrain mcp serve`: Run the local JSON-RPC 2.0 stdio MCP server at protocol revision `2025-11-25`.
- `gptbrain benchmark run [--format json|markdown] [--output <safe-path>]`: Run the deterministic four-configuration benchmark.

Phases 1–7 are checkpointed and independently verified locally. Phase 8 dashboard work has not started. No remote, upload, external service, telemetry, or runtime dependency has been added.

## Design principles

- **Local-only**: No cloud services, accounts, API keys, or telemetry.
- **Zero runtime dependencies**: Core engine targets Node.js built-ins only.
- **Deterministic**: Same input always produces the same audit result.
- **Privacy-safe**: Raw SENSITIVE/SECRET retention candidates are rejected; legacy sensitive output is defensively redacted. Common secret-like patterns are rejected before memory or evidence persistence, and controlled redaction removes legacy raw content without copying it into archives or logs. Pattern matching is defensive but cannot guarantee detection of every possible secret.
- **Tool-neutral**: Works across different AI coding agents through thin adapters.
- **Auditable**: Every audit decision includes evidence and triggered rules.

## Repository structure

```
doubtful-memory/
├── package.json
├── tsconfig.json
├── src/
├── test/
├── examples/
│   ├── create-memory-candidate.json
│   └── repository-evidence.json
├── PROJECT_BRAIN.md              # Stable project identity and boundaries
├── PROJECT_STATE.md              # Current phase and working position
├── DECISIONS.md                  # Recorded decisions and reasoning
├── REQUIREMENTS_AND_ASSUMPTIONS.md  # Testable requirements and unverified assumptions
├── RISK_REGISTER.md              # Known risks and mitigations
├── AGENTS.md                     # Cross-agent governance rules
├── README.md                     # This file
├── .agents/
│   └── rules/
│       └── doubtful-memory.md    # Antigravity workspace rule
├── docs/
│   ├── ARCHITECTURE.md           # Component boundaries and invariants
│   ├── PROTOCOL_SPECIFICATION.md # Memory and audit protocol schemas
│   └── IMPLEMENTATION_ROADMAP.md # Phased development checkpoints
└── memory/
    ├── MEMORY_CLAIMS.md          # Bootstrap project memory claims
    └── MEMORY_AUDIT.md           # Bootstrap audit history
```

## Local setup and verification

In the project directory:

```powershell
npm ci
npm run verify
npm run build
npm run benchmark
node dist/src/cli.js --help
```

No API key, account, hosted model, database, or runtime network connection is required.

### Phase 3 context budgets

`--max-tokens` accepts a decimal positive integer from 1 through 1,000,000. If omitted, the default is 2,048. The budget covers only the canonical agent-consumable selected-memory payload: memory ID, redacted statement, audit outcome, verification status, confidence, and output-safe tags. Ranking diagnostics, exclusions, warnings, and budget metadata remain visible outside that bounded payload.

Token counts use the deterministic local `utf8-bytes-ceil-div-4` estimator (UTF-8 byte length divided by four and rounded up, minimum one). This is a capacity estimate, not an exact vendor tokenizer. Complete memory statements are never truncated; when a ranked contribution does not fit, it and lower-ranked candidates are excluded as `over-budget`. A budget too small for one complete unit returns a valid explained empty pack.

Task-specific eligibility requires at least one positive exact Unicode-NFKC-normalized, case-folded, non-common lexical or tag match. Substring-only and common-word-only matches are irrelevant. Authority, freshness, and safety rank only eligible records; unrelated records never consume budget. This is deterministic lexical retrieval, not semantic retrieval.

## Controlled update workflow

Coding agents should not edit `.gptbrain/` records directly. They submit a JSON update candidate matching `docs/PROTOCOL_SPECIFICATION.md`, then invoke:

```powershell
node dist/src/cli.js memory apply --input .\candidate.json
```

The engine validates schema, authority, evidence references, optimistic concurrency, privacy, paths, archive behavior, index consistency, and audit logging. A failed candidate does not silently overwrite canonical memory.

The `examples/` files are safe templates for coding agents. Copy and edit them for the target project rather than treating their example timestamps and IDs as current facts.

Owner-confirmed promotion is intentionally two-step: create a lower-authority memory, attach explicit owner-instruction evidence, then propose the promotion. An agent's claim that it has owner authority is not sufficient by itself.

## Phase 4 controlled lifecycle

`lifecycle begin` validates local storage, invokes the Phase 3 compiler, and returns a lifecycle ID plus JSON or Markdown context. The task and complete context pack are ephemeral. Only selected memory IDs, controlled exclusion codes, budget arithmetic, timestamps, state, and safe audit references are stored in `.gptbrain/episodes/`.

`lifecycle finalize` accepts this strict envelope and reuses Phase 2 `UpdateCandidate` objects:

```json
{
  "schemaVersion": "1.0.0",
  "lifecycleId": "lc-example",
  "proposer": { "type": "AGENT", "id": "safe-agent-id" },
  "proposedUpdates": [],
  "reason": "Optional privacy-safe reason"
}
```

Every candidate receives `APPLIED`, `HELD_FOR_OWNER`, `REJECTED`, or `NO_CHANGE`. Authorized items are applied independently in input order through the canonical mutation boundary. The engine journals `FINALIZING` before mutation; interrupted work requires controlled recovery and is never replayed automatically. Identical completed input is idempotent, while different replay is rejected. Owner-policy proposals without sufficient owner evidence are held and cannot mutate memory.

`migrate bootstrap` is the one-time deterministic migration for the documented Markdown claim ledger. It maps legacy vocabulary explicitly, validates every claim before writing, preserves IDs and authority, retains the source Markdown, rejects unsafe source paths, and uses staged recovery markers to reconcile an audit/completion interruption without duplication.

## Phase 5–7 adapters, MCP, and benchmark

The shared adapter registry contains exactly `codex`, `antigravity`, `claude`, `generic`, and `mcp`. All five use the same lifecycle API and canonical storage. Managed installs are project-local, dry-run capable, atomic, idempotent, path-safe, preserve bytes outside the managed block, and reject malformed or user-modified managed content without changing the target.

The MCP adapter is a limited local stdio-only JSON-RPC 2.0 server. It uses Node.js built-ins, one UTF-8 JSON object per line, protocol revision `2025-11-25`, a bounded rolling 4,096-request duplicate-ID window, and exactly four tools for initialization, begin, finalize, and privacy-safe status. It has no HTTP listener, global configuration, SDK dependency, or runtime network request; this is the documented project subset, not a claim of full MCP feature coverage.

`npm run benchmark` regenerates `benchmark/results/v0.7.0.json` and `.md` from 22 fixture-authored deterministic scenarios without rewriting the fixture. It compares no memory, a monolithic GPTBrain baseline, simple split files, and the production Doubtful Memory compiler. Undefined metrics are `null` and excluded from applicable means. Detection, prevention, exposure, escalation, abstention, budget, and exact outcome are separate. Doubtful Memory records 15/15 micro precision, 15/17 micro recall (two safe relevant records are deliberately excluded by the hard budget), 22/22 abstention correctness, 22/22 exact outcome correctness, and zero unsafe or secret exposures.

## Next planned work

**Accelerated Milestone 3 (Phases 5–7)**: Complete, independently verified locally, and checkpointed. The exact next development action is Phase 8 local visual dashboard planning and dependency review; no dashboard dependency is approved yet.

## Runtime requirements

- **Minimum**: Node.js 22
- **Development**: Node.js 24

Node 20 and earlier versions are end-of-life and will not be supported.

## Doo challenge

This project was initially inspired by the Doo challenge ("Memory That Knows It Might Be Wrong"). The challenge remains an active delivery target.

> **Important**: The detailed challenge brief, exact judging criteria, deadline year/timezone, and submission fields remain unverified. These are tracked as unverified assumptions in the project documentation. The product is designed for independent usefulness beyond the challenge.

## License

Not yet determined.
