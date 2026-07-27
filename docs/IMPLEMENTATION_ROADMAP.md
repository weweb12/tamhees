# Tamhees — Implementation Roadmap

> **Status**: This roadmap defines the implementation phases for Tamhees Version 1. Version 0.8.2 is an unstaged Phase 8.2 implementation candidate pending independent owner review; Phase 9 is `NOT_STARTED`.

> **Current Position**: Phases 1–8 are independently verified and checkpointed locally. Version 0.8.2 is the unstaged Phase 8.2 implementation candidate pending independent owner review; Phase 9 has not started.

> **Accelerated delivery**: The original acceptance criteria remain mandatory, but remaining work is grouped into larger milestones: Phases 3–4, Phases 5–7, and Phases 8–9. This reduces handoff overhead without removing quality gates.

## Phasing principles

1. Each phase produces a testable, verifiable output.
2. A phase's stop gate must pass before the next phase begins.
3. Each phase has defined acceptance criteria and required evidence.
4. No phase may skip its stop gate.

---

## Phase 0 — Specification realignment

### Outputs

- Updated project documentation aligned with approved architecture corrections.
- New governance files (`AGENTS.md`, `.agents/rules/tamhees.md`).
- New specification files (`docs/ARCHITECTURE.md`, `docs/PROTOCOL_SPECIFICATION.md`, `docs/IMPLEMENTATION_ROADMAP.md`).
- Updated `README.md`.
- Superseded decisions marked and replaced.
- New decisions, requirements, risks, claims, and audit records appended.

### Acceptance criteria

- All documents are internally consistent.
- No document claims application functionality exists.
- All IDs are unique within their namespace.
- Cross-references resolve correctly.
- Existing valid content is preserved.
- Superseded content is marked, not deleted.

### Tests

- Manual: Re-read all files and verify consistency.
- Manual: Check all ID ranges for duplicates.
- Manual: Verify cross-references.
- `git status --short` shows expected changes.
- `git diff --check` reports no whitespace errors (if Git sandbox allows).

### Stop gate

All acceptance criteria pass. Owner reviews and approves the specification state.

### Evidence required

- File listing showing all expected files exist.
- Git status showing expected modifications and new files.
- Verification checklist with pass/fail results.

---

## Phase 1: Core vertical slice
Status: **COMPLETE — LOCALLY VERIFIED**

**Goal**: Build the smallest working slice of the local engine.

**Deliverables**:
- [x] Initial `.tamhees/` storage structure logic.
- [x] TypeScript types and runtime validation for memory records.
- [x] `tamhees init` command (creates bootstrap memory).
- [x] `tamhees context --task ""` command (reads, validates, outputs deterministic JSON).
- [x] `tamhees audit` command (one rule: DM-RULE-AUTH-001).
- [x] Local JSONL audit history appending.
- [x] Test suite using `node:test` (no outside dependencies).

**Exit condition**: `tamhees init`, `tamhees context`, and `tamhees audit` run locally, pass validation, and successfully execute without network access.

### Acceptance criteria

- `tamhees init` creates the correct directory structure with `config.json` and `state.json`.
- A memory record can be created and read back identically.
- The record includes all required schema fields.
- Atomic write uses temp file + rename.
- One audit rule produces a correct outcome.
- An audit event is appended to `history.jsonl`.
- Context output contains the selected memory.
- All tests pass with `node --test`.
- Zero runtime dependencies in `package.json`.

### Tests

- `node --test` passes all unit tests.
- `tamhees init` in a temp directory succeeds.
- Created files match expected schema.
- Audit output is deterministic across runs.

### Stop gate

All acceptance criteria and independent tests pass. Phase 1 is included in the verified Phase 2 local checkpoint.

### Current evidence

- Passing test output: 51 tests passed, 0 failed, 0 skipped.
- Example `.tamhees/` directory listing.
- Example memory record JSON.
- Example audit event JSONL line.

---

## Phase 2 — Complete memory store and audit rules

Status: **COMPLETE — LOCALLY VERIFIED**

### Outputs

- [x] Controlled create, update, revoke, and redact operations.
- [x] Memory index (`index.json`) rebuilt on every successful write.
- [x] Evidence record storage and retrieval.
- [x] Complete Phase 2 audit rules with stable IDs.
- [x] Rule precedence matching the protocol specification.
- [x] Archive handling for pre-update and pre-revoke snapshots.
- [x] Redaction without raw-content archive copies.
- [x] Strict schema validation for controlled artifacts.
- [x] CLI memory and evidence operations.
- [x] Optimistic concurrency and authority non-escalation.

### Acceptance criteria

- All memory CRUD operations produce correct results.
- Index stays consistent with records directory.
- All audit rule categories (privacy, revocation, conflict, authority, freshness, evidence, trust) are implemented.
- Rule precedence produces deterministic outcomes.
- Superseded records are archived with relationships preserved.
- Schema validation rejects invalid records.

### Tests

- Unit tests for each CRUD operation.
- Unit tests for each audit rule.
- Integration tests for rule precedence and combined outcomes.
- Index consistency tests.
- Schema validation tests with invalid input.

### Stop gate

All audit rules pass their tests, index consistency is verified, and the temporary-directory CLI smoke workflow passes. Phase 2 is complete in the local checkpoint.

### Evidence required

- Complete test output: 81 passed, 0 failed, 0 skipped.
- Tests cover validation, storage, path safety, evidence, mutation rollback boundaries, audit precedence, privacy, context safety, and CLI integration.

---

## Phase 3 — Retrieval, ranking, explanations, and budget enforcement

Status: **COMPLETE AND LOCALLY VERIFIED — CHECKPOINTED**

### Outputs

- [x] Deterministic lexical/tag relevance ranking.
- [x] Explicit authority, freshness, and audit-safety ranking components.
- [x] Ordinal memory-ID final tie-breaker.
- [x] Context compiler with configurable 1–1,000,000 estimated-token budget and a 2,048 default.
- [x] Versioned dependency-free UTF-8 byte estimator.
- [x] Hard enforcement over the canonical selected-memory agent payload.
- [x] Structured selection and controlled exclusion explanations.
- [x] Strict runtime validation for context packs and budget arithmetic.
- [x] Sensitive-content redaction and secret-like-input exclusion.
- [x] JSON and Markdown formatting with ranking and budget diagnostics.

### Acceptance criteria

- Retrieval ranks relevant memories by additive relevance, authority, freshness, and safety scores.
- Same records, task, evidence, configuration, and clock produce byte-equivalent output.
- Budgeted selected-memory payload never exceeds the configured estimate.
- Every selected memory has structured ranking data, contribution estimate, and final reason.
- Every excluded memory has a controlled reason and plain-language explanation.
- Complete statements are never truncated; a too-small budget produces a valid explained empty pack.
- Context packs remain ephemeral and no runtime network or external service is used.

### Tests

- 26 Phase 3 tests cover ranking precedence, duplicate-term normalization, deterministic tie-breaking, byte determinism, safety exclusions, warnings, explanations, budget boundaries, multiple budget sizes, Unicode and long-statement estimation, formula, rank-order, and canonical-estimate validation, formatting, CLI arguments, ephemerality, and network-free behavior.
- The combined local suite contains 107 tests and passes with zero failures, zero skips, and zero todos.

### Stop gate

Implementation and independent local owner-verification pass. The local Phase 3 checkpoint commit is the stop gate before Phase 4 begins.

### Evidence required

- Full `npm run verify` output.
- Temporary-project CLI checks for default, small, JSON, Markdown, and invalid budgets.
- Dependency tree, Git diff checks, and confirmation that context output was not persisted.

---

## Phase 4 — Controlled update/finalization lifecycle

Status: **COMPLETE AND INDEPENDENTLY VERIFIED LOCALLY — CHECKPOINTED**

### Outputs

- [x] Automatic Phase 3 retrieval through `lifecycle begin` with injected clock and ID generator.
- [x] Ephemeral JSON/Markdown context; only safe lifecycle correlation metadata is persisted.
- [x] Strict versioned `lifecycle finalize` envelope reusing canonical `UpdateCandidate` values.
- [x] Deterministic `APPLIED`, `HELD_FOR_OWNER`, `REJECTED`, and `NO_CHANGE` classifications.
- [x] Explicit lifecycle states, durable pre-mutation journal, idempotent completed replay, and fail-closed recovery.
- [x] Canonical Phase 2 mutation, audit, archive, privacy, path-safety, and concurrency boundaries retained.
- [x] One-time explicit-vocabulary bootstrap Markdown migration required by `DM-REQ-LIFE-002`.
- [x] Version 0.4.0 with no runtime dependency, service, network, telemetry, or permanent context pack.

### Acceptance criteria

- Pre-task retrieval produces budget-compliant safe context automatically and stores neither task text nor selected statements.
- Finalization validates the whole request before mutation and classifies each structurally valid proposal.
- Authorized proposals apply independently and deterministically; owner decisions are held, not approved.
- Lower authority, generated evidence, stale state, missing artifacts, and raw restricted content fail safely.
- Identical completed replay creates no duplicate memory or finalization audit event; different replay fails.
- Interrupted finalization cannot replay automatically and includes explicit recovery guidance.
- Bootstrap claims migrate without authority escalation or source-Markdown modification.

### Tests

- 43 Phase 4 tests cover begin privacy and budget behavior, safe metadata and timestamp invariants, ID validation, automatic application, held owner policy, rejection, mixed results, canonical fingerprint idempotency, injected journal/audit/marker interruptions, ambiguity, privacy precedence, strict unknown-field behavior, path-safe migration, rollback, and reconciliation.
- The combined local suite contains 150 tests and passes with zero failures, zero skips, and zero todos.

### Stop gate

Implementation and independent local owner-verification passed for Phase 4. The Phase 4 local checkpoint is complete.

### Evidence required

- Full clean-install, typecheck, build, test, and verify output.
- A real temporary-project trace with applied, held, and rejected proposals plus identical replay.
- Dependency inspection, Git diff checks, and proof that no task, context pack, service, remote, or repository `.tamhees/` was introduced.

---
## Phase 5 — Codex and Antigravity adapters

**Status**: COMPLETE AND INDEPENDENTLY VERIFIED LOCALLY — CHECKPOINTED.

### Outputs

- Codex adapter implementation.
- Antigravity adapter implementation.
- Adapter lifecycle (init, retrieve, update, finalize).
- Cross-adapter equivalence verification.

### Acceptance criteria

- Both adapters produce equivalent context for the same query.
- Both adapters enforce engine authority rules.
- Neither adapter maintains its own memory store.
- Adapter lifecycle is documented and tested.

### Tests

- Cross-adapter equivalence tests with fixture data.
- Authority enforcement tests through each adapter.
- Adapter lifecycle tests.

### Stop gate

Cross-adapter begin and mutating finalization equivalence are independently verified across isolated identical project clones. The checkpoint gate passed.

### Evidence required

- Test output.
- Equivalence comparison results.

---

## Phase 6 — Claude Code, generic, and local MCP adapters

**Status**: COMPLETE AND INDEPENDENTLY VERIFIED LOCALLY — CHECKPOINTED with the limited dependency-free stdio MCP revision 2025-11-25 subset.

### Outputs

- Claude Code adapter implementation.
- Generic adapter implementation.
- Local stdio MCP adapter implementation.
- Dependency-free local stdio MCP implementation using Node.js built-ins (DM-DEC-032).

### Acceptance criteria

- All adapters produce equivalent context.
- MCP adapter uses stdio only.
- MCP adapter enforces the same authority rules.
- Generic adapter works with any agent through CLI/file interface.

### Tests

- Cross-adapter equivalence tests including all adapters.
- MCP protocol conformance tests.
- Generic adapter integration tests.

### Stop gate

All adapters pass equivalence tests and the documented limited MCP subset passes conformance and safety verification. The checkpoint gate passed.

### Evidence required

- Test output.
- MCP conformance results.

---

## Phase 7 — Deterministic benchmark harness

**Status**: COMPLETE AND INDEPENDENTLY VERIFIED LOCALLY — CHECKPOINTED with deterministic benchmark Version 2.0.0 JSON and Markdown outputs.

### Outputs

- Benchmark fixture data.
- Deterministic benchmark measurements.
- Baseline comparisons (no memory, original GPTBrain.md, simple split-file, Tamhees).

### Acceptance criteria

Benchmark measures:

- Retrieved-memory precision.
- Retrieved-memory recall.
- Context size and estimated token size.
- Budget compliance.
- Stale-memory detection.
- Conflict detection.
- Revocation handling.
- Authority protection.
- Sensitive-content retention.
- Deterministic outcome correctness.
- Abstention or escalation when evidence is insufficient.
- Cross-adapter context equivalence.

No hosted model or subjective quality claims are required.

### Tests

- Benchmark runs deterministically across executions.
- All fixture-based measurements produce consistent results.

### Stop gate

All benchmark measurements are mathematically auditable and deterministic, baselines are documented fairly, and both result artifacts regenerate byte-identically. The checkpoint gate passed.

### Evidence required

- Benchmark output.
- Comparison table across baselines.

---

## Phase 8 — Local visual dashboard

**Status**: COMPLETE — INDEPENDENTLY VERIFIED AND CHECKPOINTED LOCALLY AS VERSION 0.8.0.

### Outputs

- Loopback-only dependency-free dashboard.
- Seven canonical safe-fixture scenarios and explained context budgets.
- Integrity-checked benchmark evidence.
- Responsive semantic keyboard-native local assets.

### Tests and stop gate

Canonical outcomes, determinism, schemas, methods, routes, traversal, Host and Origin validation, body limits, security headers, privacy-safe errors, benchmark integrity, repository non-mutation, ephemerality, semantic controls, responsive breakpoints, focus, and reduced motion pass automated checks. Independent visual review at desktop, tablet, and mobile sizes and a Chromium keyboard-only audit pass. Real assistive-technology, physical-device, judge-comprehension, and release review remain Phase 9 concerns; Phase 9 has not started.

### Evidence required

- 220-test output, isolated loopback smoke, responsive-browser review, Chromium keyboard-only audit, and independent owner checkpoint.
---

---

## Phase 8.1 — Owner-directed visual correction

**Status**: IMPLEMENTED AS AN UNSTAGED VERSION 0.8.1 CANDIDATE; superseded as the active candidate by Phase 8.2, not independently owner-accepted.

The white-first hierarchy, native educational engine animation, simplified benchmark presentation, hidden-until-run result, and plain-language live-audit flow remain the visual foundation.

---

## Phase 8.2 — Tamhees identity, legacy migration, guided CLI, and clarity

**Status**: IMPLEMENTATION CANDIDATE — VERSION 0.8.2, UNSTAGED, PENDING INDEPENDENT OWNER REVIEW.

### Outputs

- Approved Tamhees, `tamhees`, `.tamhees/`, and `tamhees_*` identities with centralized runtime constants.
- Explicit fail-closed `tamhees migrate legacy-storage [--dry-run]` compatibility boundary.
- Renamed Antigravity rule and managed instruction identity.
- Five-step fixed-fixture guided CLI lesson backed by the canonical architecture-conflict audit.
- Live-audit decision/reason/permission/next/context hierarchy before collapsed rule trace.
- Regenerated and integrity-pinned Version 0.8.2 benchmark artifact.

### Stop gate

Typecheck, build, full and focused suites, migration adversarial cases, rename regression, benchmark byte identity, dependency inspection, isolated CLI smokes, responsive/keyboard/reduced-motion browser review, repository isolation, and Git boundary checks must pass. Automated evidence cannot mark the candidate owner-accepted or start Phase 9.

---
## Phase 9 — Release hardening, documentation, and submission

**Status**: NOT_STARTED; requires separate owner authorization after Phase 8.2 review.

### Outputs

- Production build verification.
- Complete setup documentation.
- Architecture and protocol documentation finalized.
- Demonstration guide.
- Video walkthrough.
- Submission preparation.
- Final cross-artifact consistency review.
- Clean local install and removal verification.

### Acceptance criteria

- Clean install from documented instructions succeeds.
- Production build completes without errors.
- All tests pass.
- All documentation matches implemented behavior.
- No contradictions between application, documentation, video, and submission.
- Challenge submission materials are prepared.
- Clean removal leaves no orphaned files.

### Tests

- Full test suite passes.
- Clean install test.
- Production build test.
- Cross-artifact consistency review.

### Stop gate

All acceptance criteria pass. Owner reviews and approves for submission.

### Evidence required

- Full test output.
- Clean install verification.
- Production build output.
- Consistency review checklist.
- Owner approval for submission.

---

## Optional: Human/model-assisted evaluation

Not required for the core benchmark. May be documented separately as a supplementary evaluation method. Does not replace deterministic fixture-based measurements.
