# Doubtful Memory - Project Memory Claims

## Purpose

This file demonstrates the protocol by representing important project memories as claims rather than unquestioned facts.

These claims describe the Doubtful Memory project itself. The project is therefore using its own protocol during development.

This is an initial working format. The final claim schema and controlled vocabulary will be approved during protocol design. The production memory engine is not yet implemented. When it is, these bootstrap claims will be migrated to `.gptbrain/` JSON format.

## Important rule

A claim is not automatically true because it appears in this file.

Before acting, evaluate:

- Its source.
- Its verification status.
- Its confidence.
- Its freshness.
- Its sensitivity.
- Its action permission.
- Current repository evidence.
- Any conflicting or superseding claims.

## Initial field definitions

- `id`: Stable claim identifier.
- `claim`: The remembered statement.
- `source_type`: Kind of evidence supporting the claim.
- `source_reference`: Where the evidence can be checked.
- `status`: Current verification state.
- `confidence`: Current confidence level.
- `last_verified`: Most recent verification date.
- `review_after`: Date or condition requiring review.
- `sensitivity`: Retention sensitivity.
- `action_permission`: Whether work may proceed based on the claim.
- `recheck_method`: How to validate the claim.
- `notes`: Relevant limitations or context.

## Candidate status values

- `OWNER_CONFIRMED`
- `REPO_VERIFIED`
- `TEST_VERIFIED`
- `OBSERVED`
- `INFERRED`
- `UNKNOWN`
- `CONFLICTED`
- `REVOKED`

## Candidate confidence values

- `HIGH`
- `MEDIUM`
- `LOW`

## Candidate sensitivity values

- `PUBLIC`
- `INTERNAL`
- `SENSITIVE`
- `SECRET`

## Candidate action-permission values

- `MAY_ACT`
- `ACT_WITH_CAUTION`
- `ASK_BEFORE_CHANGE`
- `MUST_NOT_ACT`
- `FORGET_OR_REDACT`

These vocabularies remain candidates until protocol design is approved. The status vocabulary has been updated to include `REPO_VERIFIED` and `TEST_VERIFIED` as specified in the Phase 0 architecture corrections. The permission vocabulary has been updated to include `ACT_WITH_CAUTION`.

---

## DM-CLAIM-001

- claim: The default project budget is zero.
- source_type: Owner instruction
- source_reference: Current project planning conversation and `DECISIONS.md` DM-DEC-005
- status: OWNER_CONFIRMED
- confidence: HIGH
- last_verified: 2026-07-15
- review_after: Only if the owner explicitly changes the budget policy
- sensitivity: INTERNAL
- action_permission: MAY_ACT
- recheck_method: Check the latest owner instruction and DM-DEC-005
- notes: No external or potentially paid service may be introduced without explicit approval.

---

## DM-CLAIM-002

- claim: Core development must remain local on the owner's PC.
- source_type: Owner instruction
- source_reference: `PROJECT_BRAIN.md` and `DECISIONS.md` DM-DEC-004
- status: OWNER_CONFIRMED
- confidence: HIGH
- last_verified: 2026-07-15
- review_after: Only if the owner explicitly approves a different architecture
- sensitivity: INTERNAL
- action_permission: MAY_ACT
- recheck_method: Check the latest owner instruction and DM-DEC-004
- notes: External publication is a separate approval stage.

---

## DM-CLAIM-003

- claim: Version 1 must not use a hosted AI model or external AI API.
- source_type: Approved project decision
- source_reference: `DECISIONS.md` DM-DEC-006
- status: OWNER_CONFIRMED
- confidence: HIGH
- last_verified: 2026-07-15
- review_after: Before proposing any AI-dependent functionality
- sensitivity: INTERNAL
- action_permission: MAY_ACT
- recheck_method: Review DM-DEC-006 and the latest owner instructions
- notes: Core auditing will use deterministic rules.

---

## DM-CLAIM-004

- claim: The initial approved technical direction is Vite, React, TypeScript, local structured data, and deterministic TypeScript audit rules.
- source_type: Approved project decision
- source_reference: `DECISIONS.md` DM-DEC-007
- status: REVOKED
- superseded_by: DM-CLAIM-011, DM-CLAIM-012, DM-CLAIM-013
- confidence: HIGH
- last_verified: 2026-07-15
- review_after: N/A — superseded
- sensitivity: PUBLIC
- action_permission: MUST_NOT_ACT
- recheck_method: See superseding claims
- notes: SUPERSEDED. DM-DEC-007 was superseded on 2026-07-15. The Vite/React web-demo-first approach was replaced by an engine-first architecture. See DM-DEC-013 through DM-DEC-019.

---

## DM-CLAIM-005

- claim: The official detailed Doo challenge brief is unavailable.
- source_type: Owner observation
- source_reference: Owner's attempt to open the challenge and lack of organizer response
- status: OBSERVED
- confidence: HIGH
- last_verified: 2026-07-11
- review_after: Before final submission preparation or when the organizer responds
- sensitivity: PUBLIC
- action_permission: ASK_BEFORE_CHANGE
- recheck_method: Check the official challenge page and organizer messages
- notes: Development may proceed, but official requirements must remain marked as unverified.

---

## DM-CLAIM-006

- claim: The expected submission includes a repository, a working demo, and a short Loom-style video.
- source_type: Visible submission message
- source_reference: Available Doo text stating "Ship a repo, demo, and a short Loom"
- status: OBSERVED
- confidence: MEDIUM
- last_verified: 2026-07-11
- review_after: Before final submission preparation
- sensitivity: PUBLIC
- action_permission: ASK_BEFORE_CHANGE
- recheck_method: Verify the official submission page and detailed challenge brief
- notes: The exact hosting, visibility, video platform, and submission fields remain unverified.

---

## DM-CLAIM-007

- claim: Doubtful Memory should provide independent value beyond the Doo challenge.
- source_type: Owner instruction
- source_reference: Current project direction and `DECISIONS.md` DM-DEC-002
- status: OWNER_CONFIRMED
- confidence: HIGH
- last_verified: 2026-07-15
- review_after: During each major product-scope review
- sensitivity: PUBLIC
- action_permission: MAY_ACT
- recheck_method: Review product requirements and confirm features solve a standalone user problem
- notes: Challenge presentation must remain separate from the core product identity.

---

## DM-CLAIM-008

- claim: Existing AI coding tools already support project instructions or persistent memory conventions.
- source_type: Official product documentation review
- source_reference: Official OpenAI Codex and Cline documentation reviewed during planning
- status: OBSERVED
- confidence: HIGH
- last_verified: 2026-07-11
- review_after: Before publishing competitive or market-positioning claims
- sensitivity: PUBLIC
- action_permission: ASK_BEFORE_CHANGE
- recheck_method: Review current official documentation for relevant AI coding tools
- notes: Doubtful Memory must not claim that project memory itself is a new category.

---

## DM-CLAIM-009

- claim: The strongest initial product differentiation is auditing whether remembered claims are current, supported, privacy-safe, and permitted to authorize action.
- source_type: Product analysis
- source_reference: `PROJECT_BRAIN.md`, DM-DEC-001, and review of existing agent-memory conventions
- status: INFERRED
- confidence: MEDIUM
- last_verified: 2026-07-11
- review_after: After prototype feedback or before making market claims
- sensitivity: PUBLIC
- action_permission: ASK_BEFORE_CHANGE
- recheck_method: Compare current products and conduct structured prototype feedback
- notes: This is a product-positioning hypothesis, not a proven market-demand fact.

---

## DM-CLAIM-010

- claim: The repository currently has no Git remote and has not been uploaded.
- source_type: Repository inspection
- source_reference: Local `git remote -v` and repository state
- status: REPO_VERIFIED
- confidence: HIGH
- last_verified: 2026-07-15
- review_after: Before any remote configuration or publication
- sensitivity: INTERNAL
- action_permission: MUST_NOT_ACT
- recheck_method: Run `git remote -v`
- notes: Do not connect or upload the repository without explicit owner approval.

---

## DM-CLAIM-011

- claim: Version 1 is a local developer tool containing a tool-neutral memory engine, gptbrain CLI, structured local storage, deterministic audit engine, context compiler, adapters (Codex, Claude Code, Antigravity, generic, local MCP), benchmark harness, and local visual dashboard.
- source_type: Owner instruction
- source_reference: Owner-approved repository audit corrections, 2026-07-15. `DECISIONS.md` DM-DEC-013.
- status: OWNER_CONFIRMED
- confidence: HIGH
- last_verified: 2026-07-15
- review_after: Only if the owner explicitly changes the Version 1 scope
- sensitivity: PUBLIC
- action_permission: MAY_ACT
- recheck_method: Check DM-DEC-013 and PROJECT_BRAIN.md Version 1 scope
- notes: Supersedes DM-CLAIM-004 regarding the product form. Engine and CLI first, adapters next, dashboard last — all within Version 1.

---

## DM-CLAIM-012

- claim: The product name is Doubtful Memory. The engine and CLI command is gptbrain. The canonical local project directory is .gptbrain/. Do not use dm or .dm/.
- source_type: Owner instruction
- source_reference: Owner-approved repository audit corrections, 2026-07-15. `DECISIONS.md` DM-DEC-014.
- status: OWNER_CONFIRMED
- confidence: HIGH
- last_verified: 2026-07-15
- review_after: Only if the owner explicitly changes the naming
- sensitivity: PUBLIC
- action_permission: MAY_ACT
- recheck_method: Check DM-DEC-014
- notes: Preserves the GPTBrain lineage while using the Doubtful Memory product name.

---

## DM-CLAIM-013

- claim: The approved technical direction is TypeScript on Node 22+ (dev on Node 24), zero runtime dependencies, Node built-ins for CLI/filesystem/testing, JSON/JSONL storage in .gptbrain/. Vite, React, and dashboard dependencies are deferred.
- source_type: Owner instruction
- source_reference: Owner-approved repository audit corrections, 2026-07-15. `DECISIONS.md` DM-DEC-017, DM-DEC-018, DM-DEC-019.
- status: OWNER_CONFIRMED
- confidence: HIGH
- last_verified: 2026-07-15
- review_after: Before dependency installation or architecture change
- sensitivity: PUBLIC
- action_permission: MAY_ACT
- recheck_method: Check DM-DEC-017, DM-DEC-018, DM-DEC-019
- notes: Supersedes DM-CLAIM-004 regarding technical stack. Only typescript and @types/node as dev deps initially (not yet installed).

---

## DM-CLAIM-014

- claim: An AI inference can never become OWNER_CONFIRMED automatically. Automatic updates must be validated, auditable, and authority-restricted.
- source_type: Owner instruction
- source_reference: Owner-approved repository audit corrections, 2026-07-15. `DECISIONS.md` DM-DEC-020.
- status: OWNER_CONFIRMED
- confidence: HIGH
- last_verified: 2026-07-15
- review_after: Only if the owner explicitly changes the authority model
- sensitivity: INTERNAL
- action_permission: MAY_ACT
- recheck_method: Check DM-DEC-020 and docs/ARCHITECTURE.md authority model
- notes: Applies to all interfaces: CLI, MCP, and every adapter.

---

## DM-CLAIM-015

- claim: Context packs are ephemeral by default, not permanently cached. Runtime-generated sensitive context must never be committed.
- source_type: Owner instruction
- source_reference: Owner-approved repository audit corrections, 2026-07-15. `DECISIONS.md` DM-DEC-021.
- status: OWNER_CONFIRMED
- confidence: HIGH
- last_verified: 2026-07-15
- review_after: Only if the owner explicitly approves persistent caching
- sensitivity: INTERNAL
- action_permission: MAY_ACT
- recheck_method: Check DM-DEC-021 and docs/ARCHITECTURE.md context compiler
- notes: The .gptbrain/runtime/ directory is Git-ignored.

---

## DM-CLAIM-016

- claim: The core benchmark uses deterministic fixtures only. No hosted model dependency. Compares against: no memory, original GPTBrain.md, simple split-file, and Doubtful Memory.
- source_type: Owner instruction
- source_reference: Owner-approved repository audit corrections, 2026-07-15. `DECISIONS.md` DM-DEC-022.
- status: OWNER_CONFIRMED
- confidence: HIGH
- last_verified: 2026-07-15
- review_after: Before benchmark implementation or publication
- sensitivity: PUBLIC
- action_permission: MAY_ACT
- recheck_method: Check DM-DEC-022
- notes: Optional human/model evaluation may be documented separately but is not required.

---

## DM-CLAIM-017

- claim: The Doo challenge remains an active delivery target. Challenge requirements remain unverified and must be separated from the independent product architecture.
- source_type: Owner instruction
- source_reference: Owner-approved repository audit corrections, 2026-07-15.
- status: OWNER_CONFIRMED
- confidence: HIGH
- last_verified: 2026-07-15
- review_after: When official challenge information becomes available
- sensitivity: PUBLIC
- action_permission: ASK_BEFORE_CHANGE
- recheck_method: Check PROJECT_BRAIN.md challenge relationship section
- notes: Do not remove or describe the challenge as irrelevant. Keep challenge and product architecturally separated.

---

## Claim maintenance rules

1. Do not silently change the meaning of a claim.
2. Update `last_verified` only after checking the stated source.
3. Do not raise confidence without stronger evidence.
4. Do not convert an inference into owner-confirmed truth without owner confirmation.
5. Mark replaced claims as `REVOKED` or link them to a superseding claim.
6. Record material conflicts in `MEMORY_AUDIT.md`.
7. Never store raw real credentials or unnecessary personal information.
8. Recheck permission before performing significant, external, costly, destructive, or privacy-sensitive actions.
9. Preserve enough provenance for another person or agent to verify the claim.
10. When authority is unclear, use `ASK_OWNER` rather than guessing.