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

- **gptbrain engine**: Tool-neutral memory engine with deterministic audit rules.
- **gptbrain CLI**: Command-line interface for initialization, memory management, context compilation, and auditing.
- **Structured local storage**: `.gptbrain/` directory with atomic JSON memory records and JSONL audit logs.
- **Authority model**: Seven-level verification status distinguishing owner decisions from agent inferences.
- **Context compiler**: Task-specific context packs with explicit budgets and selection explanations.
- **Agent adapters**: Codex, Claude Code, Antigravity, and generic adapters with cross-adapter equivalence.
- **Local MCP adapter**: stdio-based Model Context Protocol integration.
- **Deterministic benchmark harness**: Measures retrieval precision, recall, budget compliance, authority protection, and more.
- **Local visual dashboard**: Browser-based project memory viewer and audit explorer.

## Current status

> **This project is in specification and bootstrap stage.**

- No working CLI or engine exists yet.
- No application code has been written.
- No packages or dependencies are installed.
- The repository contains only project planning and specification documents.
- Development is local-only with no Git remote configured.

## Design principles

- **Local-only**: No cloud services, accounts, API keys, or telemetry.
- **Zero runtime dependencies**: Core engine targets Node.js built-ins only.
- **Deterministic**: Same input always produces the same audit result.
- **Privacy-safe**: Sensitive content is redacted before persistence or output.
- **Tool-neutral**: Works across different AI coding agents through thin adapters.
- **Auditable**: Every audit decision includes evidence and triggered rules.

## Repository structure

```
doubtful-memory/
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

## Next planned work

**Phase 1 — Core vertical slice**: Implement `gptbrain init`, one validated memory record, local store, context output, one deterministic audit, and Node built-in tests.

## Runtime requirements (planned)

- **Minimum**: Node.js 22
- **Development**: Node.js 24

Node 20 and earlier versions are end-of-life and will not be supported.

## Doo challenge

This project was initially inspired by the Doo challenge ("Memory That Knows It Might Be Wrong"). The challenge remains an active delivery target.

> **Important**: The detailed challenge brief, exact judging criteria, deadline year/timezone, and submission fields remain unverified. These are tracked as unverified assumptions in the project documentation. The product is designed for independent usefulness beyond the challenge.

## License

Not yet determined.
