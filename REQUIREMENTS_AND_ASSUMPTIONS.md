# Tamhees - Requirements and Assumptions

## Purpose

This document separates testable product requirements from unverified assumptions.

Requirements define what the product must do. Assumptions identify information currently being treated as likely but not confirmed.

An assumption must never silently become a requirement or fact.

## Requirement priority

- `MUST`: Required for Version 1 completion.
- `SHOULD`: Important unless a documented reason prevents it.
- `COULD`: Optional and considered only after all MUST requirements pass.

## Requirement status

- `NOT_STARTED`
- `IN_PROGRESS`
- `IMPLEMENTED`
- `VERIFIED`
- `DEFERRED`
- `REJECTED`

---

# 1. Core engine requirements

## DM-REQ-ENGINE-001 - tamhees CLI

- Priority: MUST
- Status: IMPLEMENTED
- Related decision: DM-DEC-026

The `tamhees` CLI must be the primary human interface to the engine.

### Acceptance criteria

- CLI is invoked as `tamhees <command>`.
- Argument parsing uses Node.js built-ins (`util.parseArgs` or `process.argv`).
- Exit codes follow conventions (0 = success, 1 = error, 2 = usage error).
- `tamhees --help` displays available commands.
- `tamhees --version` displays the current version.
- No runtime dependencies are required for CLI operation.

---

## DM-REQ-ENGINE-002 - .tamhees initialization

- Priority: MUST
- Status: IMPLEMENTED
- Related decision: DM-DEC-017

The `tamhees init` command must create the `.tamhees/` directory structure.

### Acceptance criteria

- Running `tamhees init` in a project directory creates the complete directory structure.
- Created directories include: `memories/records/`, `evidence/`, `audits/`, `episodes/`, `archive/`, `runtime/`.
- Created files include: `config.json` (with schema version), `state.json`, `memories/index.json`.
- The command is idempotent — running it again does not destroy existing data.
- The command reports what was created.

---

## DM-REQ-ENGINE-003 - Atomic JSON memory storage

- Priority: MUST
- Status: IN_PROGRESS
- Related decision: DM-DEC-017

Each canonical memory must be stored as one atomic JSON file.

### Acceptance criteria

- Each memory is stored at `.tamhees/memories/records/<memory-id>.json`.
- Writes use temporary-file plus rename for atomicity.
- JSON output uses deterministic key ordering for Git-friendly diffs.
- Every stored record includes a `schemaVersion` field.
- The memory index (`index.json`) is updated on every write.
- Reading a record and writing it back produces an identical file.

---

## DM-REQ-ENGINE-004 - Schema versioning and migration

- Priority: MUST
- Status: IN_PROGRESS
- Related decision: DM-DEC-017

Every stored artifact must include a schema version, and the engine must handle version differences.

### Acceptance criteria

- Every JSON and JSONL record includes `schemaVersion`.
- Unknown schema versions produce a validation error with migration guidance.
- Missing required fields produce a validation error.
- Schema migrations are forward-only.
- Migration preserves all authority levels and relationships.
- Migration produces an audit event recording the transformation.
- The storage-name compatibility path is explicit: `tamhees migrate legacy-storage [--dry-run]` accepts no caller-selected paths.
- A lone validated `.gptbrain/` store may be renamed to `.tamhees/`; neither store and canonical-only states are idempotent, while both stores fail closed without merge, overwrite, or deletion.
- Legacy migration rejects corrupt or unknown artifacts, inconsistent indexes, links, junctions, reparse points, traversal, and boundary escapes; dry-run changes no byte and failure preserves or restores the legacy store.
- Renaming the containing directory does not alter schema version `1.0.0`.

---

## DM-REQ-ENGINE-005 - Automatic pre-task retrieval

- Priority: MUST
- Status: IMPLEMENTED
- Related decisions: DM-DEC-013, DM-DEC-030, DM-DEC-033

Before a task begins, the system must automatically retrieve relevant context.

### Acceptance criteria

- A command or adapter call retrieves memories relevant to a task description.
- Retrieved context is ranked by relevance, freshness, and authority.
- The retrieval applies the configured budget limit.
- The output includes selection and exclusion explanations.
- Sensitive content is redacted before output.

Version 0.7.0 preserves this boundary through `lifecycle begin` and all five adapters: it invokes the Phase 3 compiler, requires positive exact normalized non-common lexical/tag relevance before ranking, returns the context ephemerally, and persists only privacy-safe correlation metadata.

---

## DM-REQ-ENGINE-006 - Controlled post-task finalization

- Priority: MUST
- Status: IMPLEMENTED
- Related decision: DM-DEC-020

After a task, proposed memory updates must be validated through authority rules.

### Acceptance criteria

- Proposed updates are validated before being written to storage.
- Authority non-escalation is enforced (INFERRED cannot become OWNER_CONFIRMED automatically).
- Owner decisions cannot be overridden by agent inference.
- Material updates produce audit events.
- Superseded records are archived with relationships preserved.

---

## DM-REQ-ENGINE-007 - Context-budget enforcement

- Priority: MUST
- Status: IMPLEMENTED
- Related decisions: DM-DEC-021, DM-DEC-030

Context packs must have a hard configured budget that is never exceeded.

### Acceptance criteria

- The budget limit is configurable.
- Token size is estimated for each selected memory.
- The total estimated size never exceeds the budget.
- When the budget is insufficient for all relevant memories, the system prioritizes by relevance and authority.
- The budget compliance is reported in the context pack.

---

## DM-REQ-ENGINE-008 - Selection and exclusion explanations

- Priority: MUST
- Status: IMPLEMENTED
- Related decisions: DM-DEC-021, DM-DEC-030

The context compiler must explain every selection and exclusion decision.

### Acceptance criteria

- Every selected memory includes a reason for selection.
- Every excluded memory includes a controlled reason: irrelevant, revoked, conflicted, redacted, blocked, expired, demoted, or over-budget.
- Expired, conflicted, and demoted records are explicitly identified.
- Explanations are included in the context-pack output.

---

## DM-REQ-ENGINE-009 - Authority non-escalation

- Priority: MUST
- Status: IMPLEMENTED
- Related decision: DM-DEC-020

The system must prevent automatic escalation of authority levels.

### Acceptance criteria

- An AI inference can never become OWNER_CONFIRMED automatically.
- Agent-generated memories default to INFERRED or OBSERVED.
- Repository evidence cannot authorize scope, budget, privacy, or publication decisions.
- Tests cannot approve owner decisions.
- The system never treats its own generated summary as independent evidence.
- The same rules apply through CLI, MCP, and all adapters.

---

## DM-REQ-ENGINE-010 - Candidate-memory validation

- Priority: MUST
- Status: IMPLEMENTED
- Related decision: DM-DEC-020

Proposed memory updates must be validated before acceptance.

### Acceptance criteria

- Proposed status must not exceed the proposer's authority level.
- Missing required fields are rejected.
- Unknown vocabulary values are rejected.
- Duplicate IDs are detected and rejected.
- Validation results are included in the update response.

---

## DM-REQ-ENGINE-011 - Ephemeral context packs

- Priority: MUST
- Status: IMPLEMENTED
- Related decision: DM-DEC-021

Generated context packs must be ephemeral by default.

### Acceptance criteria

- Context packs are not permanently cached in `.tamhees/`.
- Context is returned in memory/stdout or stored temporarily under Git-ignored `runtime/`.
- Runtime-generated sensitive context is never committed.
- No context-pack history accumulates by default.

---

# 2. Adapter requirements

## DM-REQ-ADAPT-001 - Adapter lifecycle

- Priority: MUST
- Status: IMPLEMENTED
- Related decision: DM-DEC-023

Each adapter must support a standard lifecycle.

### Acceptance criteria

- Adapters support: initialize, retrieve context, propose updates, finalize.
- All adapter operations go through the engine.
- No adapter maintains its own memory store.
- Adapters enforce engine authority rules.

---

## DM-REQ-ADAPT-002 - Codex adapter

- Priority: MUST
- Status: IMPLEMENTED
- Related decision: DM-DEC-013

A thin adapter for OpenAI Codex integration.

### Acceptance criteria

- Translates between Codex's agent instruction format and the engine API.
- Retrieves and serves context through the engine.
- Does not contain business logic.
- Passes cross-adapter equivalence tests.

---

## DM-REQ-ADAPT-003 - Claude Code adapter

- Priority: MUST
- Status: IMPLEMENTED
- Related decision: DM-DEC-013

A thin adapter for Anthropic Claude Code integration.

### Acceptance criteria

- Integrates with Claude Code's CLAUDE.md convention.
- Retrieves and serves context through the engine.
- Does not contain business logic.
- Passes cross-adapter equivalence tests.

---

## DM-REQ-ADAPT-004 - Antigravity adapter

- Priority: MUST
- Status: IMPLEMENTED
- Related decision: DM-DEC-013

A thin adapter for Google Antigravity IDE integration.

### Acceptance criteria

- Integrates with Antigravity's AGENTS.md / skill hooks.
- Retrieves and serves context through the engine.
- Does not contain business logic.
- Passes cross-adapter equivalence tests.
- Antigravity is a served agent, not a runtime dependency.

---

## DM-REQ-ADAPT-005 - Generic adapter

- Priority: MUST
- Status: IMPLEMENTED
- Related decision: DM-DEC-013

A generic adapter for any AI coding agent through CLI/file interface.

### Acceptance criteria

- Works with any agent that can read files or invoke CLI commands.
- Retrieves and serves context through the engine.
- Does not require agent-specific configuration.
- Passes cross-adapter equivalence tests.

---

## DM-REQ-ADAPT-006 - Local stdio MCP adapter

- Priority: MUST
- Status: IMPLEMENTED
- Related decision: DM-DEC-013

A local stdio-based Model Context Protocol adapter.

### Acceptance criteria

- Uses stdio transport only — no HTTP, no remote connections.
- Enforces the same authority rules as the CLI.
- The owner reviewed and rejected the MCP SDK dependency for Version 0.7.0; the adapter uses Node.js built-ins under DM-DEC-032.
- Conforms to the MCP specification.

---

## DM-REQ-ADAPT-007 - Cross-adapter equivalence

- Priority: MUST
- Status: IMPLEMENTED
- Related decision: DM-DEC-023

The same memory query through different adapters must produce equivalent results.

### Acceptance criteria

- Fixture-based tests verify equivalent context output across all adapters.
- No adapter produces results that differ in content or authority from another.
- Equivalence is tested as part of the benchmark harness.

---

# 3. Benchmark requirements

## DM-REQ-BENCH-001 - Deterministic benchmark harness

- Priority: MUST
- Status: IMPLEMENTED
- Related decision: DM-DEC-022

A benchmark harness that measures memory system performance with deterministic fixtures.

### Acceptance criteria

- Measures: retrieved-memory precision, recall, context size, token size, budget compliance, stale-memory detection, conflict detection, revocation handling, authority protection, sensitive-content retention, deterministic outcome correctness, abstention/escalation, cross-adapter equivalence.
- Uses deterministic fixture data.
- Produces consistent results across runs.
- Does not require a hosted model or API.
- Can run offline.

---

## DM-REQ-BENCH-002 - Original GPTBrain baseline

- Priority: MUST
- Status: IMPLEMENTED
- Related decision: DM-DEC-022

The benchmark must include comparison against the original single-file GPTBrain.md approach.

### Acceptance criteria

- Baseline includes: no project memory, original GPTBrain.md, simple split-file memory, Tamhees.
- Each baseline uses the same fixture data.
- Comparisons are objective and measurable.
- No subjective quality claims in the core benchmark.

---

# 4. Memory-claim requirements

## DM-REQ-CLAIM-001 - Stable claim identifier

- Priority: MUST
- Status: IMPLEMENTED

Every memory claim must have a unique, stable identifier.

### Acceptance criteria

- Missing identifiers are detected.
- Duplicate identifiers are detected.
- Audit results reference the claim identifier.

---

## DM-REQ-CLAIM-002 - Claim statement

- Priority: MUST
- Status: IMPLEMENTED

Every memory claim must contain a plain-language statement describing what is believed.

### Acceptance criteria

- Empty claims are rejected or flagged.
- The interface displays the statement clearly.
- The statement is distinguishable from evidence and instructions.

---

## DM-REQ-CLAIM-003 - Provenance and source

- Priority: MUST
- Status: IN_PROGRESS

Every claim must identify where it came from.

### Acceptance criteria

- Missing source information prevents automatic trust.
- Source type and source reference are distinguishable.
- The interface displays the relevant provenance.

---

## DM-REQ-CLAIM-004 - Verification status

- Priority: MUST
- Status: IMPLEMENTED

Every claim must have a controlled verification status.

Status values:

- `OWNER_CONFIRMED`
- `REPO_VERIFIED`
- `TEST_VERIFIED`
- `OBSERVED`
- `INFERRED`
- `UNKNOWN`
- `CONFLICTED`
- `REVOKED`

### Acceptance criteria

- Unsupported status values are rejected or flagged.
- `INFERRED` is not presented as owner-confirmed.
- `CONFLICTED` cannot produce `TRUST`.
- `REVOKED` cannot authorize action.

---

## DM-REQ-CLAIM-005 - Confidence

- Priority: MUST
- Status: IN_PROGRESS

Every claim must contain a controlled confidence value.

Values: `HIGH`, `MEDIUM`, `LOW`.

### Acceptance criteria

- Confidence is displayed separately from evidence quality.
- High confidence cannot override a conflict or revocation.
- Low confidence cannot independently authorize a significant action.
- Missing confidence is detected.

---

## DM-REQ-CLAIM-006 - Freshness

- Priority: MUST
- Status: IMPLEMENTED

Claims must support a last-verification time and an optional review or expiration rule.

### Acceptance criteria

- The engine can determine whether a claim requires review.
- Invalid dates are detected.
- An expired claim cannot be silently treated as current.
- The audit explanation identifies the freshness problem.

---

## DM-REQ-CLAIM-007 - Sensitivity

- Priority: MUST
- Status: IMPLEMENTED

Claims must include a sensitivity classification.

### Acceptance criteria

- Sensitive claims receive stricter retention handling.
- Secret-like raw values are not approved for ordinary retention.
- Sensitivity affects audit outcomes when appropriate.
- Sensitivity is visible without revealing protected content.

---

## DM-REQ-CLAIM-008 - Permission to act

- Priority: MUST
- Status: IMPLEMENTED

Every claim must state whether and how an agent may act based on it.

### Acceptance criteria

- Permission is separate from confidence.
- Missing permission prevents significant automatic action.
- The requested action is evaluated against the recorded permission.
- The explanation states why action is allowed, restricted, or blocked.

---

## DM-REQ-CLAIM-009 - Recheck method

- Priority: MUST
- Status: IMPLEMENTED

A claim that may require verification should provide a practical recheck method.

### Acceptance criteria

- The method can describe repository inspection, testing, document review, or asking the owner.
- The interface displays the recommended recheck.
- Claims requiring recheck do not produce an unexplained dead end.

---

# 5. Audit-engine requirements

## DM-REQ-AUDIT-001 - Five primary outcomes

- Priority: MUST
- Status: IMPLEMENTED

The engine must produce one primary outcome: `TRUST`, `RECHECK`, `ASK_OWNER`, `BLOCK_ACTION`, or `FORGET_OR_REDACT`.

### Acceptance criteria

- Every completed audit has one primary outcome.
- The outcome follows documented rules.
- Rule priority resolves multiple findings consistently.
- The same evaluated state cannot produce contradictory primary outcomes.

---

## DM-REQ-AUDIT-002 - Evidence comparison

- Priority: MUST
- Status: IMPLEMENTED

The engine must compare remembered claims with relevant current evidence.

### Acceptance criteria

- Supporting and conflicting evidence can be represented.
- Conflict detection is testable.
- The interface identifies which evidence was compared.
- Missing evidence is not treated as confirmation.

---

## DM-REQ-AUDIT-003 - Explainable decisions

- Priority: MUST
- Status: IMPLEMENTED

Every audit must explain why its outcome was selected.

### Acceptance criteria

The result includes:

- Primary outcome.
- Plain-language summary.
- Triggered rule identifiers.
- Relevant evidence.
- Permission consequence.
- Recommended next step.

---

## DM-REQ-AUDIT-004 - Deterministic behavior

- Priority: MUST
- Status: IMPLEMENTED

The core audit engine must be deterministic and independent from a hosted AI model.

### Acceptance criteria

- Repeated identical inputs produce identical outputs.
- Critical rules have automated tests.
- The engine can run without internet access.
- No API key is required.

---

## DM-REQ-AUDIT-005 - Conflict safety

- Priority: MUST
- Status: IMPLEMENTED

A material unresolved conflict must prevent `TRUST`.

### Acceptance criteria

- Conflicted claims do not authorize dependent actions.
- The result identifies both sides of the conflict.
- Human confirmation is requested when authority is unclear.
- Resolution is not simulated automatically.

---

## DM-REQ-AUDIT-006 - Revocation safety

- Priority: MUST
- Status: IMPLEMENTED

A revoked claim must not authorize action.

### Acceptance criteria

- Revoked state is detected.
- The prior content can be identified without being treated as active truth.
- The result recommends using the replacement decision or asking the owner.

---

## DM-REQ-AUDIT-007 - Privacy-safe handling

- Priority: MUST
- Status: IMPLEMENTED

Secret-like or unnecessarily sensitive raw content must not be preserved in audit output, logs, exports, or persistent storage.

### Acceptance criteria

- Redaction occurs before persistence or export.
- Tests use fake secrets.
- Audit history contains safe metadata rather than the raw value.
- Documentation states the limitations of pattern-based detection.

---

## DM-REQ-AUDIT-008 - Rule traceability

- Priority: MUST
- Status: IMPLEMENTED

Every audit rule must have a stable identifier and a human-readable description.

### Acceptance criteria

- Triggered rule IDs appear in audit results.
- Tests reference rule IDs.
- Documentation maps identifiers to behavior.
- UI explanations remain consistent with rule definitions.

---

# 6. Lifecycle requirements

## DM-REQ-LIFE-001 - Automatic state maintenance

- Priority: MUST
- Status: IMPLEMENTED
- Related decision: DM-DEC-020

Users must not be required to manually update routine state after every task.

### Acceptance criteria

- Pre-task retrieval is automatic.
- Post-task finalization validates and writes updates.
- The system maintains state through controlled lifecycle operations.
- Manual intervention is required only for owner-level decisions.

Version 0.4.0 implements explicit begin/finalize lifecycle operations. It holds owner-level proposals without changing canonical memory; an approval UI remains a later interface concern.

---

## DM-REQ-LIFE-002 - Safe migration from bootstrap Markdown

- Priority: MUST
- Status: IMPLEMENTED

The system must safely migrate from the bootstrap `memory/MEMORY_CLAIMS.md` format to `.tamhees/` JSON storage.

### Acceptance criteria

- Existing claims are preserved with their original authority levels.
- Migration does not elevate INFERRED to OWNER_CONFIRMED.
- Superseded claims remain visible with REVOKED status.
- Migration produces an audit event.
- The bootstrap Markdown files are preserved (not deleted during migration).

Version 0.4.0 provides the strict one-time migrate bootstrap engine and CLI boundary. It validates all claims before migration writes, maps legacy vocabulary explicitly, requires a path-safe in-project CLI source, preserves source Markdown, and uses staged markers to roll back pre-audit failures or reconcile an audit/completion-marker interruption without duplication. Changed, ambiguous, duplicate-ID, and incompatible-store inputs fail closed.

---

## DM-REQ-LIFE-003 - Clean local installation and removal

- Priority: MUST
- Status: IN_PROGRESS

The product must install and remove cleanly.

### Acceptance criteria

- Installation requires only documented commands.
- Removal leaves no orphaned configuration or data outside `.tamhees/`.
- `.tamhees/` removal is a clean project-level uninstall.
- No global system modifications are required.

---

# 7. Dashboard requirements

> These requirements are part of the mandatory Version 1 release. Implementation order is deferred until Phase 8, but the requirements themselves are not removed or optional.

## DM-REQ-UI-001 - Primary audit journey

- Priority: MUST
- Status: IMPLEMENTED
- Target phase: Phase 8

A user must be able to view memory state, inspect evidence, run audits, understand results, and see safe next actions through the dashboard.

### Acceptance criteria

- The journey has no broken step.
- Memory and current evidence are visually distinguishable.
- The primary outcome is prominent.
- The judge demonstration invokes canonical audit and context functions over safe fixed structured fixtures without mutating source storage.
- The guided CLI lesson exposes exactly five fixed presentation steps with full-run, next, reset, and direct step selection; it executes no shell and accepts no arbitrary command.
- Canonical outcome, permission, next step, and context consequences in the lesson come from the real architecture-conflict audit response.

---

## DM-REQ-UI-002 - Responsive layout

- Priority: MUST
- Status: IMPLEMENTED
- Target phase: Phase 8

The dashboard must work on desktop, tablet, and mobile screen sizes.

### Acceptance criteria

- No required content is clipped.
- No uncontrolled horizontal scrolling occurs.
- Controls remain usable at supported sizes.
- Evidence and results remain understandable when stacked.

---

## DM-REQ-UI-003 - Accessible status communication

- Priority: MUST
- Status: IMPLEMENTED
- Target phase: Phase 8

Status and outcomes must not rely on color alone.

### Acceptance criteria

- Outcomes include text labels.
- Important icons have accessible names or accompanying text.
- Text contrast is reviewed.
- Keyboard focus is visible.

---

## DM-REQ-UI-004 - Keyboard operation

- Priority: MUST
- Status: IMPLEMENTED
- Target phase: Phase 8

The dashboard must be operable using a keyboard.

### Acceptance criteria

- Interactive controls are reachable in a logical order.
- Focus is visible.
- Buttons activate using standard keyboard behavior.
- No essential action requires precise pointer movement.

---

## DM-REQ-UI-005 - Plain-language explanations

- Priority: MUST
- Status: IMPLEMENTED
- Target phase: Phase 8

The dashboard must explain technical concepts without assuming prior knowledge of the protocol.

### Acceptance criteria

- Terms such as provenance, confidence, freshness, and action permission are explained.
- Error messages describe recovery steps.
- The dashboard avoids unexplained status codes.
- Detailed technical information remains available without overwhelming the primary flow.
- Live-audit results present decision, reason, permission, next step, and context before collapsed rule identifiers.
- Every animated CLI lesson has synchronized plain-language explanation and a complete static equivalent.

---

## DM-REQ-UI-006 - Local dashboard as Version 1 deliverable

- Priority: MUST
- Status: IMPLEMENTED
- Target phase: Phase 8
- Related decision: DM-DEC-016

The local visual dashboard is a Version 1 release deliverable, not post-Version-1.

### Acceptance criteria

- Dashboard is functional and included in the release.
- Dashboard results come from canonical engine functions through a narrow local API.
- Dashboard does not bypass engine authority or privacy rules.
- The dependency-free built-in boundary is approved by DM-DEC-034.

---

# 8. Product requirements

## DM-REQ-PROD-001 - Clear opening explanation

- Priority: MUST
- Status: IMPLEMENTED
- Target phase: Phase 8

The dashboard opening must explain that project memory can be inaccurate, invasive, or overconfident and that Tamhees audits whether remembered claims are safe to use.

### Acceptance criteria

- The problem is visible without opening documentation.
- The product purpose is explained in plain language.
- The opening content does not claim that AI project memory is a new invention.
- A first-time user can identify the primary action.

---

## DM-REQ-PROD-002 - Working interactive audit

- Priority: MUST
- Status: IMPLEMENTED

The application must execute a real audit using structured claim and evidence data.

### Acceptance criteria

- Audit results are calculated rather than stored as fixed presentation text.
- Modifying relevant input changes the result.
- The same input produces the same result.
- The interface displays the calculated outcome.

---

## DM-REQ-PROD-003 - Multiple representative scenarios

- Priority: MUST
- Status: IMPLEMENTED

The application must include scenarios covering:

- Contradictory technical memory.
- Stale memory.
- Overconfident inference.
- Sensitive or secret-like information.
- Revoked or superseded memory.

### Acceptance criteria

- Every scenario executes through the same audit engine.
- Every scenario has a clear expected result.
- Every scenario can be reset.
- Every scenario is included in automated test coverage.

---

## DM-REQ-PROD-004 - Independent value

- Priority: MUST
- Status: IMPLEMENTED

The application must be understandable and useful without knowledge of the Doo challenge.

### Acceptance criteria

- Core interface text does not depend on challenge context.
- Documentation explains practical developer and team use cases.
- Challenge alignment is presented separately from product identity.

---

# 9. Technical requirements

## DM-REQ-TECH-001 - Local operation

- Priority: MUST
- Status: IMPLEMENTED

The core application must run locally without a backend, account, cloud database, or hosted model.

### Acceptance criteria

- Local development requires no service credentials.
- Core scenarios function without network access.
- No telemetry request is made.

---

## DM-REQ-TECH-002 - Type safety

- Priority: MUST
- Status: IN_PROGRESS

The application and audit engine must use TypeScript types for the claim schema, evidence, rules, findings, permissions, and outcomes.

### Acceptance criteria

- Type checking passes.
- Core protocol objects do not use unexplained `any` types.
- Invalid controlled values are rejected during development or validation.

---

## DM-REQ-TECH-003 - Automated tests

- Priority: MUST
- Status: IN_PROGRESS

Critical audit behavior must have automated tests.

### Acceptance criteria

Tests cover at least:

- Supported verified claim.
- Missing provenance.
- Expired claim.
- Material conflict.
- Inferred low-confidence claim.
- Revoked claim.
- Insufficient action permission.
- Secret-like input.
- Multiple simultaneous findings.
- Outcome-priority behavior.

---

## DM-REQ-TECH-004 - Production build

- Priority: MUST
- Status: IN_PROGRESS

The final Version 1 project must produce verified release artifacts.

### Acceptance criteria

- Produces verified release artifacts for the local tamhees CLI and engine.
- Produces required templates and agent adapters.
- Produces the local visual dashboard when Phase 8 is completed.
- Has a clean local installation/build process.
- No development-only dependency required at runtime.
- No private memory, runtime context, secrets, test residue, or machine-specific paths in release artifacts.
- Successful operation on the supported Node.js baseline.
- Reproducible build commands documented and tested before release.

---

## DM-REQ-TECH-005 - Controlled dependencies

- Priority: MUST
- Status: IMPLEMENTED

Every direct dependency must have a documented purpose and must not require a paid or hosted service for core operation.

### Acceptance criteria

- Target initial zero-runtime-dependency.
- Dependency approval before installation.
- A lockfile is required once dependencies are installed.
- License and runtime-network review.
- Unused dependencies are removed.
- No paid service, API key, account, or hosted runtime requirement.

---

# 10. Documentation requirements

## DM-REQ-DOC-001 - Setup documentation

- Priority: MUST
- Status: IN_PROGRESS

A new user must be able to install and run the project locally using documented commands.

### Acceptance criteria

- Prerequisites are listed.
- Installation commands are exact.
- Development and production commands are separated.
- Common errors include recovery guidance.
- Instructions are tested before release.

---

## DM-REQ-DOC-002 - Architecture and protocol documentation

- Priority: MUST
- Status: IN_PROGRESS

Documentation must explain the system architecture, claim schema, audit rules, outcome priority, privacy behavior, and limitations.

### Acceptance criteria

- Documentation matches implemented behavior.
- Protocol files are included.
- Limitations are explicit.
- Existing agent-memory conventions are acknowledged accurately.

---

## DM-REQ-DOC-003 - Demonstration guide

- Priority: MUST
- Status: IMPLEMENTED

Documentation must provide a short reproducible path through the primary contradiction scenario.

### Acceptance criteria

- The scenario can be completed without hidden setup.
- Expected behavior is described.
- The guide identifies the decisive refusal-to-act moment.
- The guide matches the final interface.

---

# 11. Quality requirements

## DM-REQ-QUAL-001 - No knowingly fake functionality

- Priority: MUST
- Status: IN_PROGRESS

Controls and displayed results must represent real implemented behavior.

### Acceptance criteria

- Buttons perform their stated action.
- Audit outputs are calculated.
- Disabled or future features are clearly labeled or omitted.
- No visual element falsely implies external integration.

---

## DM-REQ-QUAL-002 - Cross-artifact consistency

- Priority: MUST
- Status: IN_PROGRESS

The application, tests, protocol, README, and submission description must not contradict one another.

### Acceptance criteria

- A final consistency review is completed.
- Outcome names and meanings match everywhere.
- Setup commands are verified.

---

# 12. Current assumptions

## DM-ASM-001 - Challenge interpretation

- Verification status: UNVERIFIED
- Impact if wrong: HIGH

The challenge concerns how AI can remember without becoming inaccurate, invasive, or overconfident.

### Validation method

Obtain the official brief or direct organizer confirmation.

---

## DM-ASM-002 - Submission artifacts

- Verification status: PARTIALLY_VERIFIED
- Impact if wrong: MEDIUM

The expected submission likely includes a repository, working demonstration, and short video.

### Evidence

The visible Doo submission message stated: "Build and submit. Ship a repo, demo, and a short Loom."

### Validation method

Recheck the official challenge and submission pages before publication.

---

## DM-ASM-003 - Deadline

- Verification status: UNVERIFIED
- Impact if wrong: HIGH

An August 31 deadline appeared on the available challenge card or planning material, but the applicable year, timezone, and complete submission conditions have not been independently confirmed.

### Validation method

Verify on the official platform before planning final submission timing.

---

## DM-ASM-004 - Static web application is acceptable

- Verification status: UNVERIFIED
- Impact if wrong: MEDIUM

A local developer tool with a visual dashboard is assumed to be an acceptable demonstration format.

### Validation method

Check the official submission rules when available.

---

## DM-ASM-005 - No required technology

- Verification status: UNVERIFIED
- Impact if wrong: MEDIUM

No required AI model, API, framework, or hosting provider is currently known.

### Validation method

Check the official detailed brief.

---

## DM-ASM-006 - Broader user demand

- Verification status: RESEARCH_NEEDED
- Impact if wrong: MEDIUM

Developers and teams may value an independent memory-audit and action-safety layer across different AI coding tools.

### Validation method

After the working prototype exists, conduct structured user interviews or non-sensitive feedback testing before making market-demand claims.

---

## DM-ASM-007 - Deterministic rules are sufficient for Version 1

- Verification status: PARTIALLY_VERIFIED
- Impact if wrong: HIGH

A deterministic engine is expected to demonstrate the essential safety model without an AI API.

### Validation method

Test the engine against representative scenarios and evaluate whether the rules produce useful, understandable outcomes.

---

# 13. Traceability rule

Every implemented feature must reference one or more requirement IDs.

Every critical automated test must reference the audit requirement or rule it verifies.

If a requirement changes:

1. Record the reason in `DECISIONS.md`.
2. Update its status and acceptance criteria.
3. Update affected tests and documentation.
4. Review related risks.
5. Update `PROJECT_STATE.md`.

## Current requirement summary

- Total requirements defined: 60
- Requirements verified: 0
- Requirements implemented: 48
- Requirements in progress: 12
- Requirements not started: 0
- Assumptions recorded: 7
- Assumptions fully verified: 0

Phase 8.2 automated tests provide implementation evidence only. They do not elevate any requirement to `VERIFIED` without independent owner review.
