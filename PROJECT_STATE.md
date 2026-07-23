# Doubtful Memory - Project State

## Purpose

This file records the project's current working position.

Update it after meaningful work sessions. It should describe the present state, not serve as a permanent history log.

During development, AI agents must update PROJECT_STATE.md after material work. End users are not expected to perform routine manual state maintenance once the planned lifecycle automation is implemented. Version 0.8.0 is the independently verified, locally checkpointed Phase 8 implementation built on the Phase 1–7 checkpoints.

## Status summary

- Project: Doubtful Memory
- Current phase: Phase 8 — independently verified and checkpointed locally; Phase 9 has not started.
- Overall status: In progress
- Development environment: Windows, local-only, Node 24.
- Development agent: Phase 1 used Antigravity IDE; Phase 2 was independently implemented and reviewed by Codex in ChatGPT Work mode.
- Repository location: `C:\Projects\doubtful-memory`
- Git branch: `main`
- Latest committed checkpoint: Phase 8 local dashboard checkpoint
- Current unstaged candidate: None
- Git remote: None
- Repository upload/publication: None
- External services: None
- Paid services: None
- Application dependencies: None (zero runtime dependencies)
- Application code: Phases 1–8 are independently verified and checkpointed locally.
- Packages:
  - typescript@6.0.3
  - @types/node@22.20.1
  - zero runtime dependencies
- CLI, engine, and storage identity: `gptbrain` and `.gptbrain/` remain temporary codenames.
- Current local verification evidence:
  - 220 passed
  - 0 failed
  - 0 skipped
  - 0 todo
- Last updated: 2026-07-24

## Current objective

Version 0.8.0 adds the dependency-free, loopback-only local dashboard and judge demonstration. Seven safe deterministic scenarios call canonical audit and context functions, and the benchmark view reads the integrity-checked committed Version 0.7.0 artifact. Independent source, security, privacy, responsive-browser, and keyboard review passes with 220 tests. Phase 8 is checkpointed locally; Phase 9 has not started.
## Completed work

- Reviewed the two existing project-planning PDFs.
- Confirmed that development will proceed without waiting for the unavailable official challenge brief.
- Expanded the goal beyond the Doo challenge into an independently useful product.
- Confirmed the local-first and zero-budget requirements.
- Confirmed that external or potentially paid services require prior owner approval.
- Created the local project folder outside OneDrive.
- Verified Node.js, npm, Git, and VS Code.
- Initialized the local Git repository.
- Confirmed that no Git remote exists.
- Created the initial control folders and files.
- Populated all initial project-control documents.
- Created first verified local Git commit (`1c6bc6f`).
- Phase 0: Realigned specification with approved architecture corrections.
- Phase 0: Superseded DM-DEC-007 (Vite/React stack) with engine-first decisions.
- Phase 0: Created AGENTS.md, README.md, and .agents/rules/doubtful-memory.md.
- Phase 0: Created docs/ARCHITECTURE.md, docs/PROTOCOL_SPECIFICATION.md, docs/IMPLEMENTATION_ROADMAP.md.
- Phase 0: Appended 12 new decisions (DM-DEC-013 through DM-DEC-024).
- Phase 0: Added engine/CLI/adapter/benchmark requirements.
- Phase 0: Appended 13 new risks (DM-RISK-013 through DM-RISK-025).
- Phase 0: Updated memory claims and audit history.
- Phase 1: Approved development dependencies installed.
- Phase 1: Basic project structure established.
- Phase 1: Implemented deterministic JSON validation engine.
- Phase 1: Implemented fail-safe deterministic audit engine (DM-RULE-AUTH-001).
- Phase 1: Implemented local JSON and JSONL atomic storage with deep path safety.
- Phase 1: Implemented strict CLI argument parsing.
- Phase 1: Created `gptbrain init`, `gptbrain context`, and `gptbrain audit` commands.
- Phase 1: Comprehensive `node:test` regression suite independently verified at 51 passing tests.

- Phase 1: `PROTOCOL_SPECIFICATION.md` updated to match canonical schema (DM-DEC-025).
- Phase 2: Implemented controlled `CREATE`, `UPDATE`, `REVOKE`, and `REDACT` operations.
- Phase 2: Implemented strict update-candidate and evidence-record validation.
- Phase 2: Implemented evidence storage and retrieval under `.gptbrain/evidence/`.
- Phase 2: Implemented optimistic concurrency and authority non-escalation for mutations.
- Phase 2: Implemented pre-update/pre-revoke archive snapshots and privacy-safe redaction.
- Phase 2: Implemented stable privacy, revocation, conflict, authority, freshness, evidence, and trust rule precedence.
- Phase 2: Implemented evidence-aware audit events and atomic audit-batch replacement.
- Phase 2: Added `memory` and `evidence` CLI operations.
- Phase 2: Expanded verification to 81 passing tests with zero failures or skips.
- Phase 2: Installed and locally verified the combined Phase 1–2 checkpoint with typecheck, build, 81 tests, archive-safety checks, and the temporary-directory CLI smoke workflow passing.
- Phase 3: Advanced package and engine version to 0.3.0 without changing storage schema 1.0.0.
- Phase 3: Implemented deterministic additive relevance, authority, freshness, and safety ranking with ordinal memory-ID tie-breaking.
- Phase 3: Added strict context-pack runtime validation and controlled exclusion reasons.
- Phase 3: Added configurable hard budget enforcement for the canonical selected-memory agent payload using the dependency-free UTF-8 byte estimator.
- Phase 3: Preserved privacy-first filtering, redaction, ephemerality, and zero runtime dependencies.
- Phase 3: Expanded the suite from 81 to 107 tests; independent local typecheck, build, and all tests pass.

- Phase 4: Advanced package and engine version to 0.4.0 while retaining storage schema 1.0.0.
- Phase 4: Added lifecycle begin with automatic Phase 3 context retrieval and privacy-safe correlation metadata only.
- Phase 4: Added strict finalization classification, owner holds, deterministic independent application, durable recovery journal, and completed-input idempotency.
- Phase 4: Added the `DM-REQ-LIFE-002` one-time bootstrap Markdown migration with explicit legacy mapping, staged recovery markers, and no authority escalation.
- Phase 4: Expanded the suite from 107 to 150 tests; independent local typecheck, build, tests, and isolated smoke workflows pass.
- Phase 5: Added one exact five-adapter registry, thin shared lifecycle translation, and project-local managed install/status/remove behavior.
- Phase 6: Added Claude, generic, and dependency-free local stdio MCP adapters with JSON-RPC 2.0 protocol revision `2025-11-25` and four canonical MCP tools.
- Phase 7: Added a 22-scenario deterministic benchmark comparing four configurations with JSON and Markdown artifacts and transparent null-metric handling.
- Phases 5–7: Advanced package and engine version to 0.7.0 while retaining storage schema 1.0.0, zero runtime dependencies, local-only operation, and the temporary `gptbrain` codename.
- Phases 5–7: Expanded the suite from 150 to 202 tests; independent typecheck, build, all tests, benchmark generation, isolated adapter/MCP/retrieval smokes, and byte-identical regeneration pass.
## Current files in focus

- The verified Phase 1–4 local checkpoint.
- Phase 4 lifecycle and bootstrap migration are complete and independently verified locally.
- Phases 5–7 are complete, independently verified locally, and checkpointed.

## Locked constraints

- Core development must remain local.
- Default project budget is zero.
- No paid APIs or services.
- No external service without prior explanation and owner approval.
- No cloud database.
- No hosted AI model.
- No authentication in Version 1.
- No telemetry.
- No real secrets or credentials in examples.
- No publishing or uploading without owner approval.
- No application implementation before the specification is approved.
- No knowingly fake or broken functionality.
- Important audit decisions must be deterministic and explainable.
- Engine and CLI must be implemented before dashboard.
- Zero runtime dependencies where reasonable.
- Node 22 minimum, Node 24 development.
- An AI inference can never become OWNER_CONFIRMED automatically.

## Open questions

- The official Doo challenge detail page remains unavailable.
- Official judging criteria remain unverified.
- Official submission requirements remain unverified.
- The final visual direction has not been approved.
- Phase 2 audit rules are implemented; benchmark validation and user feedback may still identify rule refinements.
- The final public publishing method has not been selected or approved.

## Current blockers

There are no blockers preventing local planning and development.

The unavailable official challenge brief is a submission risk, but it does not prevent development because the product is being designed for broader independent usefulness.

## Known immediate risks

- Building a documentation template instead of a working product.
- Creating audit rules that appear arbitrary or inconsistent.
- Making unsupported claims that the product is completely unique.
- Expanding Version 1 beyond what can be completed and tested properly.
- Accidentally adding external dependencies or services without review.
- Scope expansion delays the competition release.
- Development agent accidentally performs destructive work.

Detailed risks are maintained in `RISK_REGISTER.md`.

## Phase 2 completion status

Phase 2 (Complete memory store and audit rules) is complete and locally verified. Its completion criteria were:

- Controlled create, update, revoke, redact, and evidence operations work through the engine and CLI.
- Index, archive, privacy, authority, and audit-history invariants pass automated tests.
- Full Phase 2 audit precedence produces deterministic outcomes.
- Documentation accurately reflects implemented behavior and limitations.

## Phase 3 completion status

Phase 3 retrieval, ranking, explanations, context-pack validation, and hard estimated-token budget enforcement are complete and independently verified locally. This is test-verified implementation evidence and does not elevate any memory claim to `OWNER_CONFIRMED`.

## Next phase

Phase 9 release hardening remains not started and requires a separately authorized task.

## Next immediate action

Obtain explicit owner authorization before beginning Phase 9 release hardening. Do not push, upload, publish, deploy, configure a remote, or begin Phase 9 from this checkpoint.
## Safe restart instructions

When resuming work:

1. Read `AGENTS.md` (routing table).
2. Read this file.
3. Check `git status`.
4. Review the current objective and blockers.
5. Perform only the next immediate action unless the project state is updated first.

## Phase 4 completion status

Version 0.4.0 lifecycle and migration behavior is complete and independently verified locally with 150 passing tests, zero failures, zero skips, and zero todos. This is test-verified implementation evidence, not release approval or automatic owner confirmation.

## Phases 5–7 checkpoint status

Version 0.7.0 adapter, limited MCP, corrected exact lexical/tag eligibility, and benchmark behavior is independently verified locally with 202 passing tests, zero failures, zero skips, and zero todos. The corrected benchmark records 22/22 Doubtful Memory abstention correctness and separates null detection metrics from safe prevention. This is test-verified implementation evidence and a local checkpoint, not OWNER_CONFIRMED release approval.

## Phase 8 independent checkpoint status

The dashboard binds only to `127.0.0.1`, uses local assets and zero new dependencies, and calls canonical `auditRecord` and `compileContext` functions. It persists no context pack or browser state and creates no repository `.gptbrain/`. Independent review corrected strict request-target, Host, Origin, media-type, duplicate-key, body-limit, semantic-control, live-region, mobile navigation, contrast, and overflow boundaries. Typecheck, build, 220 tests, all seven live outcomes, desktop/tablet/mobile browser checks, and an independent Chromium keyboard-only audit pass. This is a local implementation checkpoint, not release approval or proof of real assistive-technology compatibility.