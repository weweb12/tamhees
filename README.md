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

> **Version 0.2.0 — Phases 1 and 2 are implemented and locally verified. Phase 2 is complete.**

The local engine now provides validated memory creation, update, revocation, and redaction; evidence storage; archive preservation; deterministic audit precedence; secret-like-content rejection; context safety; and CLI access. The test suite contains 81 passing tests with zero failures, zero skipped tests, and zero todo tests. The repository remains local with no Git remote, upload, external service, or runtime dependency. `gptbrain` and `.gptbrain/` remain temporary codenames.

Implemented commands:

- `gptbrain init [directory]`: Initialize safe `.gptbrain/` storage.
- `gptbrain memory list`: List canonical memory records.
- `gptbrain memory show <memory-id>`: Show one canonical record.
- `gptbrain memory apply --input <candidate.json>`: Apply a controlled `CREATE`, `UPDATE`, `REVOKE`, or `REDACT` candidate.
- `gptbrain evidence list`: List evidence records.
- `gptbrain evidence add --input <evidence.json>`: Add validated evidence.
- `gptbrain context --task "..."`: Compile an ephemeral, audit-aware context pack.
- `gptbrain audit`: Apply the complete Phase 2 precedence chain and append privacy-safe audit events.

Phases 3–9 remain. The next development milestone is accelerated Phases 3–4, beginning with Phase 3 retrieval, ranking, selection/exclusion explanations, and hard budget enforcement. Later work covers automatic lifecycle hooks, agent adapters, the deterministic benchmark, the local dashboard, and release/submission hardening.

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
node dist/src/cli.js --help
```

No API key, account, hosted model, database, or runtime network connection is required.

## Controlled update workflow

Coding agents should not edit `.gptbrain/` records directly. They submit a JSON update candidate matching `docs/PROTOCOL_SPECIFICATION.md`, then invoke:

```powershell
node dist/src/cli.js memory apply --input .\candidate.json
```

The engine validates schema, authority, evidence references, optimistic concurrency, privacy, paths, archive behavior, index consistency, and audit logging. A failed candidate does not silently overwrite canonical memory.

The `examples/` files are safe templates for coding agents. Copy and edit them for the target project rather than treating their example timestamps and IDs as current facts.

Owner-confirmed promotion is intentionally two-step: create a lower-authority memory, attach explicit owner-instruction evidence, then propose the promotion. An agent's claim that it has owner authority is not sufficient by itself.

## Next planned work

**Accelerated Milestone 2 (Phases 3–4)**: begin with Phase 3 retrieval, ranking, selection/exclusion explanations, and hard budget enforcement, then implement Phase 4 automatic pre-task/post-task lifecycle finalization while preserving the existing authority and privacy gates.

## Runtime requirements

- **Minimum**: Node.js 22
- **Development**: Node.js 24

Node 20 and earlier versions are end-of-life and will not be supported.

## Doo challenge

This project was initially inspired by the Doo challenge ("Memory That Knows It Might Be Wrong"). The challenge remains an active delivery target.

> **Important**: The detailed challenge brief, exact judging criteria, deadline year/timezone, and submission fields remain unverified. These are tracked as unverified assumptions in the project documentation. The product is designed for independent usefulness beyond the challenge.

## License

Not yet determined.
