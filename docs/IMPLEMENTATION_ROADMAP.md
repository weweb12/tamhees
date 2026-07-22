# Doubtful Memory — Implementation Roadmap

> **Status**: This roadmap defines the implementation phases for Doubtful Memory Version 1.

> **Current Position**: Phases 1, 2, and 3 are complete and locally verified in Version 0.3.0 with 107 passing tests, zero failures, zero skips, and zero todos. Phase 4 is next.

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
- New governance files (`AGENTS.md`, `.agents/rules/doubtful-memory.md`).
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
- [x] Initial `.gptbrain/` storage structure logic.
- [x] TypeScript types and runtime validation for memory records.
- [x] `gptbrain init` command (creates bootstrap memory).
- [x] `gptbrain context --task ""` command (reads, validates, outputs deterministic JSON).
- [x] `gptbrain audit` command (one rule: DM-RULE-AUTH-001).
- [x] Local JSONL audit history appending.
- [x] Test suite using `node:test` (no outside dependencies).

**Exit condition**: `gptbrain init`, `gptbrain context`, and `gptbrain audit` run locally, pass validation, and successfully execute without network access.

### Acceptance criteria

- `gptbrain init` creates the correct directory structure with `config.json` and `state.json`.
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
- `gptbrain init` in a temp directory succeeds.
- Created files match expected schema.
- Audit output is deterministic across runs.

### Stop gate

All acceptance criteria and independent tests pass. Phase 1 is included in the verified Phase 2 local checkpoint.

### Current evidence

- Passing test output: 51 tests passed, 0 failed, 0 skipped.
- Example `.gptbrain/` directory listing.
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

Status: **IMPLEMENTATION CANDIDATE — PENDING OWNER VERIFICATION AND CHECKPOINT COMMIT**

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

### Outputs

- Automatic pre-task retrieval workflow.
- Controlled post-task memory finalization.
- Update-candidate validation through authority rules.
- Automatic state maintenance (no manual owner maintenance per task).
- Safe handling of proposed updates that exceed authority.

### Acceptance criteria

- Pre-task retrieval produces a context pack automatically.
- Post-task finalization validates proposed updates.
- Authority non-escalation is enforced.
- Owner decisions cannot be overridden automatically.
- Material updates are auditable.

### Tests

- Authority escalation rejection tests.
- Finalization workflow tests.
- Pre-task retrieval integration tests.

### Stop gate

All authority rules are tested. Lifecycle workflow is verified. Owner approves.

### Evidence required

- Test output.
- Example lifecycle trace showing pre-task → task → post-task.

---

## Phase 5 — Codex and Antigravity adapters

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

Cross-adapter equivalence is verified. All tests pass. Owner approves.

### Evidence required

- Test output.
- Equivalence comparison results.

---

## Phase 6 — Claude Code, generic, and local MCP adapters

### Outputs

- Claude Code adapter implementation.
- Generic adapter implementation.
- Local stdio MCP adapter implementation.
- MCP SDK integration (dependency approved at this phase).

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

All adapters pass equivalence tests. MCP conformance is verified. Owner approves.

### Evidence required

- Test output.
- MCP conformance results.

---

## Phase 7 — Deterministic benchmark harness

### Outputs

- Benchmark fixture data.
- Deterministic benchmark measurements.
- Baseline comparisons (no memory, original GPTBrain.md, simple split-file, Doubtful Memory).

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

All benchmark measurements produce deterministic results. Baselines are documented. Owner approves.

### Evidence required

- Benchmark output.
- Comparison table across baselines.

---

## Phase 8 — Local visual dashboard

### Outputs

- Browser-based local dashboard.
- Memory viewer.
- Audit history explorer.
- Memory status overview.
- Dashboard dependencies approved and installed (React, Vite, etc.).

### Acceptance criteria

- Dashboard reads from `.gptbrain/` through the engine.
- Dashboard does not bypass authority or privacy rules.
- Responsive layout (desktop, tablet, mobile).
- Keyboard accessible.
- Plain-language explanations.
- No fake or scripted functionality.

### Tests

- Dashboard renders correctly.
- Data displayed matches engine output.
- Responsive layout tests.
- Keyboard navigation tests.

### Stop gate

Dashboard displays real engine data. All acceptance criteria pass. Owner approves.

### Evidence required

- Screenshots.
- Test output.

---

## Phase 9 — Release hardening, documentation, and submission

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
