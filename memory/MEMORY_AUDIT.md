# Doubtful Memory - Project Memory Audit

## Purpose

This file records audits of the project's remembered claims.

It provides an inspectable history of why a claim was trusted, questioned, blocked, or recommended for redaction.

An audit does not automatically change a claim. Material changes must be verified and recorded in the appropriate source file.

## Audit outcome values

- `TRUST`: Current evidence supports limited use of the claim within its permission.
- `RECHECK`: The claim requires additional verification.
- `ASK_OWNER`: Current evidence or authority is insufficient, and owner confirmation is required.
- `BLOCK_ACTION`: The proposed action must not proceed.
- `FORGET_OR_REDACT`: Raw information should not be retained.

## Audit limitations

These entries are manual project-control audits distinct from runtime audit events. The implemented engine writes runtime events under `.gptbrain/audits/`; this ledger must not imply that a manual review is an automated or independent owner confirmation.

The engine produces runtime events in `.gptbrain/audits/history.jsonl`. These historical and current manual entries remain the preserved bootstrap project-control record.

---

# Audit DM-AUDIT-2026-07-11-001

## Audit metadata

- Date: 2026-07-11
- Audit type: Initial manual project-control audit
- Scope: DM-CLAIM-001 through DM-CLAIM-010
- Auditor: Project development process
- Engine version: Not implemented
- Repository state: Planning files are uncommitted
- Overall result: TRUST

## Overall explanation

Most initial claims are supported by current owner instructions, approved decisions, or local repository inspection.

However:

- Official challenge requirements remain unavailable.
- Submission requirements are only partially verified.
- Product differentiation remains a hypothesis requiring future validation.
- Exact packages and versions have not been approved.
- The repository planning files have not yet received their first local commit.

These issues do not block local planning. They prevent unsupported claims about official requirements, market demand, or final submission readiness.

## Claim findings

### DM-CLAIM-001 - Zero-budget policy

- Outcome: TRUST
- Evidence checked: DM-DEC-005 and current owner instruction
- Finding: The claim is owner-confirmed and current.
- Permission consequence: Local zero-cost planning may proceed.
- Required action: Ask the owner before introducing any external or potentially paid service.

### DM-CLAIM-002 - Local-first development

- Outcome: TRUST
- Evidence checked: DM-DEC-004 and current owner instruction
- Finding: The claim is owner-confirmed and current.
- Permission consequence: Local project work may proceed.
- Required action: Treat publication and external connections as separate approval decisions.

### DM-CLAIM-003 - No hosted AI in Version 1

- Outcome: TRUST
- Evidence checked: DM-DEC-006
- Finding: The approved Version 1 architecture excludes hosted AI.
- Permission consequence: Deterministic local audit design may proceed.
- Required action: Do not introduce an AI API without a new approved decision.

### DM-CLAIM-004 - Initial technical direction

- Outcome: TRUST
- Evidence checked: DM-DEC-007
- Finding: The general stack is approved.
- Permission consequence: Technical planning may use Vite, React, and TypeScript.
- Required action: Review exact packages and versions before installation.

### DM-CLAIM-005 - Official challenge brief unavailable

- Outcome: RECHECK
- Evidence checked: Owner observation and lack of organizer response
- Finding: The claim was current when recorded but can change externally.
- Permission consequence: Local development may proceed, but the detailed brief must not be described as reviewed.
- Required action: Recheck before final submission preparation or if the organizer responds.

### DM-CLAIM-006 - Expected submission artifacts

- Outcome: RECHECK
- Evidence checked: Visible "repo, demo, and short Loom" message
- Finding: The general artifact types have partial support, but exact requirements remain unknown.
- Permission consequence: Internal preparation may consider these artifacts, but publication decisions must not rely on unverified details.
- Required action: Verify the official submission page before publishing.

### DM-CLAIM-007 - Independent product value

- Outcome: TRUST
- Evidence checked: DM-DEC-002 and current owner instruction
- Finding: This is an approved product objective.
- Permission consequence: Product design should support standalone use beyond the challenge.
- Required action: Keep challenge-specific material separate from core product functionality.

### DM-CLAIM-008 - Existing agent-memory conventions

- Outcome: TRUST
- Evidence checked: Official Codex and Cline documentation reviewed during planning
- Finding: Existing tools support persistent project instructions or memory conventions.
- Permission consequence: The project must not claim that persistent project memory itself is new.
- Required action: Recheck current official documentation before publishing competitive comparisons.

### DM-CLAIM-009 - Initial product differentiation

- Outcome: ASK_OWNER
- Evidence checked: Product analysis and current comparison of agent-memory conventions
- Finding: The positioning is plausible but remains an inference rather than proven market demand.
- Permission consequence: It may guide prototype design but cannot support absolute marketing claims.
- Required action: Validate through a working prototype, current product comparison, and future structured feedback.

### DM-CLAIM-010 - No Git remote or upload

- Outcome: TRUST
- Evidence checked: Local repository initialization and current Git status
- Finding: No remote has been configured.
- Permission consequence: Local commits may proceed.
- Required action: Block remote configuration or upload until the owner explicitly approves it.

## Conflict review

- Material claim conflicts detected: 0
- Revoked claims detected: 0
- Duplicate claim identifiers detected: 0
- Claims missing a source: 0
- Claims missing confidence: 0
- Claims missing action permission: 0

## Freshness review

Claims requiring future recheck:

- DM-CLAIM-005: Recheck official challenge availability.
- DM-CLAIM-006: Recheck official submission requirements.
- DM-CLAIM-008: Recheck official product documentation before comparison publication.
- DM-CLAIM-009: Recheck after prototype validation or structured feedback.
- DM-CLAIM-010: Recheck before remote configuration or publication.

## Privacy review

- Real passwords detected: 0
- Real API keys detected: 0
- Access tokens detected: 0
- Private cryptographic keys detected: 0
- Payment information detected: 0
- Unnecessary personal information intentionally recorded: 0

### Privacy result

No sensitive raw content requiring redaction was intentionally added to the initial protocol files.

This is a manual observation, not the output of an implemented secret-detection engine.

## Permission review

### Work currently permitted

- Local planning.
- Local documentation.
- Local Git commits.
- Protocol design.
- UX research and design.
- Dependency review without installation.
- Deterministic audit-rule specification.

### Work requiring owner approval

- External services.
- Potentially paid services.
- Hosted AI.
- Repository upload.
- Public or private remote creation.
- External deployment.
- Video upload.
- Material architecture changes.
- Retention of sensitive information.

### Work currently blocked

- Publicly claiming official challenge requirements have been verified.
- Publicly claiming proven market demand.
- Publicly claiming Doubtful Memory is the first system of its kind.
- Uploading the repository.
- Adding a hosted API or cloud database.
- Storing real secrets in examples or tests.

## Unresolved questions

1. What is the official detailed challenge brief?
2. What are the exact judging criteria?
3. What are the exact submission fields and visibility requirements?
4. What is the final claim schema?
5. What is the final rule-priority order?
6. Which exact package versions will be installed?
7. Will Version 1 include project creation and template export?
8. How will the product's usefulness be validated beyond the demonstration?

## Required follow-up actions

1. Complete the initial project-control files.
2. Create the first verified local Git commit.
3. Define and approve the final claim schema.
4. Define deterministic audit rules and precedence.
5. Decide the exact Version 1 project-creation and export workflow.
6. Design the primary user journey before application implementation.
7. Recheck external assumptions before publication.

## Audit conclusion

Local planning may proceed.

The project must continue treating official challenge requirements, exact submission requirements, and market differentiation as claims requiring future verification.

No external connection, cost-bearing service, or publication action is authorized.

---

# Audit DM-AUDIT-2026-07-15-001

## Audit metadata

- Date: 2026-07-15
- Audit type: Manual bootstrap audit — Phase 0 specification realignment
- Scope: DM-CLAIM-001 through DM-CLAIM-017 (all claims after Phase 0 updates)
- Auditor: Project development process (manual)
- Engine version: Not implemented
- Repository state: Phase 0 specification realignment in progress
- Overall result: TRUST (with conditions)

## Overall explanation

The owner-approved repository audit corrections (2026-07-15) resolved the major specification conflicts identified during the initial audit. The product direction has been realigned from a web-demo-first application to a complete local developer tool with engine, CLI, adapters, benchmark, and dashboard.

This audit verifies the newly added and superseded claims resulting from that specification realignment.

**The production audit engine is not implemented.** This is a manual bootstrap audit. All findings were produced by human review of the documentation changes, not by automated rules.

## Conflicts resolved during specification realignment

### Conflict 1: Product form (web demo vs. developer tool)

- Previous: DM-DEC-007 approved Vite/React/TypeScript as a web-demo-first stack.
- Current: DM-DEC-013 establishes Version 1 as a complete local developer tool (engine + CLI + adapters + benchmark + dashboard).
- Resolution: DM-DEC-007 is SUPERSEDED. DM-CLAIM-004 is REVOKED with references to superseding claims.
- Authority: Owner instruction via approved repository audit corrections.

### Conflict 2: Dashboard timing

- Previous: Dashboard (as web interface) was the primary deliverable.
- Current: Dashboard is implemented after the engine passes release gates, but remains a Version 1 deliverable.
- Resolution: DM-DEC-015 (engine first) and DM-DEC-016 (dashboard remains V1) are both APPROVED.
- Authority: Owner instruction.

### Conflict 3: Runtime and dependency baseline

- Previous: DM-DEC-007 implied Vite/React dependencies from the start.
- Current: DM-DEC-018 (Node 22+), DM-DEC-019 (zero runtime deps) establish the correct baseline.
- Resolution: Dashboard dependencies deferred to Phase 8. Only typescript and @types/node as initial dev deps.
- Authority: Owner instruction.

### Conflict 4: Storage architecture

- Previous: "Local structured data" was mentioned but not specified.
- Current: DM-DEC-017 specifies `.gptbrain/` with JSON/JSONL, atomic writes, schema versioning.
- Resolution: Storage architecture is now explicit and approved.
- Authority: Owner instruction.

## Claim findings

### DM-CLAIM-001 - Zero-budget policy

- Outcome: TRUST
- Evidence: DM-DEC-005, owner instruction (unchanged)
- Finding: Unchanged. Still owner-confirmed and current.

### DM-CLAIM-002 - Local-first development

- Outcome: TRUST
- Evidence: DM-DEC-004, owner instruction (unchanged)
- Finding: Unchanged. Still owner-confirmed and current.

### DM-CLAIM-003 - No hosted AI in Version 1

- Outcome: TRUST
- Evidence: DM-DEC-006 (unchanged)
- Finding: Unchanged. Still owner-confirmed and current.

### DM-CLAIM-004 - Initial technical direction (Vite/React)

- Outcome: BLOCK_ACTION
- Evidence: DM-DEC-007 is SUPERSEDED by DM-DEC-013 through DM-DEC-019
- Finding: This claim is REVOKED. The Vite/React web-demo-first approach has been replaced by an engine-first architecture. The claim must not authorize future action.
- Permission consequence: Do not use this claim to justify Vite/React installation or web-demo-first implementation.
- Required action: Use superseding claims DM-CLAIM-011, DM-CLAIM-012, DM-CLAIM-013 instead.

### DM-CLAIM-005 - Official challenge brief unavailable

- Outcome: RECHECK
- Evidence: No new information since 2026-07-11
- Finding: Still current but externally changeable. No new organizer contact.

### DM-CLAIM-006 - Expected submission artifacts

- Outcome: RECHECK
- Evidence: No new verification since 2026-07-11
- Finding: Still partially verified. Exact requirements remain unknown.

### DM-CLAIM-007 - Independent product value

- Outcome: TRUST
- Evidence: DM-DEC-002, reinforced by DM-DEC-013 (complete product form)
- Finding: Strengthened by the expanded Version 1 scope.

### DM-CLAIM-008 - Existing agent-memory conventions

- Outcome: TRUST
- Evidence: No change in the factual observation
- Finding: Still accurate. Must be rechecked before publishing comparisons.

### DM-CLAIM-009 - Initial product differentiation

- Outcome: ASK_OWNER
- Evidence: Still an inference
- Finding: Still a hypothesis. Not promoted despite expanded scope.

### DM-CLAIM-010 - No Git remote

- Outcome: TRUST
- Evidence: Git status verified during Phase 0 work
- Finding: Confirmed. No remote configured.

### DM-CLAIM-011 - Complete Version 1 product form

- Outcome: TRUST
- Evidence: Owner-approved repository audit corrections, DM-DEC-013
- Finding: New claim. Owner-confirmed through explicit audit corrections.
- Permission consequence: Implementation may proceed according to the roadmap phases.

### DM-CLAIM-012 - Product name and gptbrain identity

- Outcome: TRUST
- Evidence: Owner-approved repository audit corrections, DM-DEC-014
- Finding: New claim. Owner-confirmed naming.
- Permission consequence: All documentation and code must use gptbrain (not dm).

### DM-CLAIM-013 - Technical direction (Node 22+, zero deps, JSON/JSONL)

- Outcome: TRUST
- Evidence: Owner-approved repository audit corrections, DM-DEC-017 through DM-DEC-019
- Finding: New claim. Owner-confirmed technical baseline.
- Permission consequence: Phase 1 may begin with these constraints.

### DM-CLAIM-014 - Authority non-escalation rules

- Outcome: TRUST
- Evidence: Owner-approved repository audit corrections, DM-DEC-020
- Finding: New claim. Owner-confirmed authority restrictions.
- Permission consequence: All engine code paths must enforce non-escalation.

### DM-CLAIM-015 - Ephemeral context packs

- Outcome: TRUST
- Evidence: Owner-approved repository audit corrections, DM-DEC-021
- Finding: New claim. Owner-confirmed context-pack behavior.

### DM-CLAIM-016 - Deterministic benchmark methodology

- Outcome: TRUST
- Evidence: Owner-approved repository audit corrections, DM-DEC-022
- Finding: New claim. Owner-confirmed benchmark approach.

### DM-CLAIM-017 - Challenge as active delivery target

- Outcome: TRUST
- Evidence: Owner-approved repository audit corrections
- Finding: New claim. Owner-confirmed that the challenge remains active and must not be removed.
- Permission consequence: Challenge details remain explicitly separated from product architecture.

## Conflict review (post-Phase 0)

- Material claim conflicts detected: 0 (all conflicts resolved during realignment)
- Revoked claims: 1 (DM-CLAIM-004, superseded by DM-CLAIM-011/012/013)
- Duplicate claim identifiers detected: 0
- Claims missing a source: 0
- Claims missing confidence: 0
- Claims missing action permission: 0

## Freshness review

Claims requiring future recheck:

- DM-CLAIM-005: Recheck official challenge availability.
- DM-CLAIM-006: Recheck official submission requirements.
- DM-CLAIM-008: Recheck official product documentation before comparison publication.
- DM-CLAIM-009: Recheck after prototype validation or structured feedback.
- DM-CLAIM-010: Recheck before remote configuration or publication.

All new claims (DM-CLAIM-011 through DM-CLAIM-017) are freshly verified as of 2026-07-15.

## Privacy review

- Real passwords detected: 0
- Real API keys detected: 0
- Access tokens detected: 0
- Private cryptographic keys detected: 0
- Payment information detected: 0
- Unnecessary personal information intentionally recorded: 0

### Privacy result

No sensitive raw content requiring redaction was detected in the Phase 0 documentation changes.

This is a manual observation, not the output of an implemented secret-detection engine.

## Audit conclusion

The Phase 0 specification realignment is consistent with the owner-approved corrections. All major conflicts have been resolved and documented. The single revoked claim (DM-CLAIM-004) has been properly superseded with references.

Local development may proceed to Phase 1 (core vertical slice) following owner approval of the specification state.

No external connection, cost-bearing service, or publication action is authorized.

---

# Audit DM-AUDIT-2026-07-19-001

## Audit metadata

- Date: 2026-07-19
- Audit type: Manual bootstrap audit — Phase 1 checkpoint
- Scope: DM-CLAIM-018 through DM-CLAIM-020, and Phase 1 completion state
- Auditor: Project development process (manual)
- Engine version: Not implemented for automated documentation scans
- Repository state: Phase 1 implemented, pending final commit
- Overall result: TRUST (with conditions)

## Overall explanation

Phase 1 (Core vertical slice) is implementation complete. The new claims accurately reflect the state of the codebase, which now contains a working CLI, memory engine, path-safety constraints, and core protocol types.

**The production audit engine is partially implemented** but cannot automatically audit this Markdown file yet. This remains a manual bootstrap audit.

## Claim findings

### DM-CLAIM-018 - Temporary codename

- Outcome: TRUST
- Evidence: `src/core/identity.ts` centralizes `gptbrain`.
- Finding: Confirmed. The codebase successfully avoids string-literal scattering for the temporary codenames.

### DM-CLAIM-019 - Phase 1 approved dependencies

- Outcome: TRUST
- Evidence: `package.json` and DM-DEC-027.
- Finding: Confirmed. Only `typescript` and `@types/node` are present. Zero runtime dependencies are preserved.

### DM-CLAIM-020 - Phase 1 completion

- Outcome: TRUST
- Evidence: `src/` files and `test/` regression tests.
- Finding: Confirmed. Phase 1 mechanisms are functional and all tests pass.

## Privacy review

- Real passwords detected: 0
- Real API keys detected: 0
- Access tokens detected: 0
- Private cryptographic keys detected: 0
- Payment information detected: 0

### Privacy result

No sensitive raw content was detected. The path safety gap has been closed comprehensively.

## Audit conclusion

The Phase 1 baseline is verified. The repository is ready for the owner's final manual inspection and the Phase 1 checkpoint commit. No new commands, external connections, or untested features may be introduced before the commit.

---

# Audit DM-AUDIT-2026-07-20-001

## Audit metadata

- Date: 2026-07-20
- Audit type: Manual bootstrap audit — Corrective Phase 1 checkpoint
- Scope: DM-AUDIT-2026-07-19-001 and Phase 1 completion state
- Auditor: Project development process (manual)
- Engine version: Not implemented for automated documentation scans
- Repository state: Phase 1 implementation candidate
- Overall result: TRUST

## Overall explanation

This audit corrects the premature claims in DM-AUDIT-2026-07-19-001. The earlier audit was based on incomplete and inaccurate verification evidence. Repository tests support the implementation candidate, but final owner verification and commit remain pending.

## Verification evidence

- `npm ci` passed
- `npm ls --all` confirmed the approved dependency tree
- type-check passed
- build passed
- 51 tests passed
- 0 failed
- 0 skipped
- DM-RULE-AUTH-001 passed its named regression test
- malformed history is rejected and preserved
- record/index/audit-history symlink targets remain byte-for-byte unchanged
- healthy Phase 1 baseline returns RECHECK
- no external service or runtime network dependency exists

## Authority distinction

This audit distinguishes TEST_VERIFIED repository behavior from OWNER_CONFIRMED authority. Do not give TRUST until owner approval.

## Audit conclusion

Phase 2 remains blocked until Phase 1 is committed.

---

# Audit DM-AUDIT-2026-07-20-002

## Audit metadata

- Date: 2026-07-20
- Audit type: Phase 2 implementation and accelerated-delivery audit
- Scope: DM-CLAIM-020 through DM-CLAIM-022; Phase 2 source, tests, protocol, and CLI
- Auditor: Codex independent implementation/review process
- Engine version: 0.2.0 candidate
- Overall result: TRUST

## Overall explanation

The Phase 1 implementation was independently re-run before extension: 51 tests passed with zero failures. Phase 2 then added controlled memory mutations, evidence storage, archive behavior, privacy guards, complete audit precedence, and CLI operations. The expanded suite passed 81 tests with zero failures and zero skipped tests under strict TypeScript settings.

The implementation evidence supports the Phase 2 capability claim. The overall project result remains `RECHECK` only because the returned handoff has not yet been installed and committed in the owner's local Git repository.

## Claim findings

### DM-CLAIM-020 - Phase 1 progress claim

- Outcome: BLOCK_ACTION
- Finding: The progress wording is superseded by DM-CLAIM-021 and must not be used as the current project state.
- Evidence checked: Phase 2 source tree and 81-test verification output.
- Required action: Preserve as historical Phase 1 evidence; use DM-CLAIM-021 for current capability.

### DM-CLAIM-021 - Phase 2 verified capability

- Outcome: TRUST
- Finding: Source inspection, strict type checking, build output, and 81 automated tests support the stated implementation boundary.
- Evidence checked: `src/core/`, `src/cli.ts`, `test/`, package metadata, and `npm run verify`.
- Permission consequence: Local owner installation and checkpoint preparation may proceed.
- Required action: Re-run `npm ci` and `npm run verify` after replacing the owner's local files.

### DM-CLAIM-022 - Accelerated milestone delivery

- Outcome: TRUST
- Finding: The claim reflects the owner's explicit request to finish quickly without sacrificing quality and is recorded in DM-DEC-029.
- Permission consequence: Work may proceed in grouped milestones; mandatory deliverables may not be silently removed.
- Required action: Obtain a separate owner decision before deferring any mandatory Version 1 deliverable.

## Implementation evidence

- TypeScript strict type check: PASS.
- Production compilation: PASS.
- Automated tests: 81 passed, 0 failed, 0 skipped, 0 todo.
- Runtime dependencies: 0.
- New external services or accounts: 0.
- Runtime network imports: 0 detected.
- Real secrets intentionally used in tests: 0; only obviously fake pattern fixtures were used.
- Controlled redaction test: PASS; raw fake value absent from records, archive, and audit history after redaction.
- Authority escalation test: PASS; failed mutation preserved index and audit history byte-for-byte.

## Known limitations

- Retrieval budget, token estimation, and authority/freshness ranking remain Phase 3.
- Automatic pre-task/post-task lifecycle remains Phase 4.
- Multi-process filesystem locking is not implemented; Phase 2 provides atomic single-process file and audit-batch replacement.
- Pattern-based secret detection cannot prove content is safe and may require future refinement.
- Owner evidence is a local trust workflow, not cryptographically signed identity proof.

## Audit conclusion

Phase 2 implementation is verified as a handoff candidate. Install it locally, rerun verification, and create the local checkpoint before beginning the accelerated Phases 3–4 milestone. No upload, remote configuration, external service, or publication is authorized.

---

# Audit DM-AUDIT-2026-07-22-001

## Audit metadata

- Date: 2026-07-22
- Audit type: Independent Phase 3 owner-verification checkpoint
- Scope: DM-CLAIM-021 through DM-CLAIM-023; Phase 3 source, tests, protocol, CLI, privacy, and dependency boundary
- Auditor: Codex independent verification process
- Engine version: 0.3.0
- Repository state: Phase 3 locally verified and ready for the local checkpoint commit
- Overall result: TRUST

## Overall explanation

The verified Phase 2 checkpoint was the repository baseline for this review. Phase 3 adds deterministic lexical/tag retrieval, additive relevance/authority/freshness/safety ranking, ordinal ID tie-breaking, strict context-pack validation, structured explanations, and hard estimated-token budget enforcement. Independent source inspection, type checking, build, 107 automated tests, temporary-project CLI checks, dependency inspection, and Git diff checks support the implementation boundary.

The overall implementation result is `TRUST` for the local Phase 3 checkpoint. This audit verifies implemented behavior but does not elevate implementation evidence or any memory claim to `OWNER_CONFIRMED`.

## Claim findings

### DM-CLAIM-021 - Phase 2 verified capability

- Outcome: TRUST
- Finding: Phase 3 preserves the Phase 2 storage schema and inherited behaviors; all 81 inherited tests remain part of the passing combined suite.
- Required action: Preserve the Phase 3 local checkpoint after the verified commit.

### DM-CLAIM-022 - Accelerated milestone delivery

- Outcome: TRUST
- Finding: Phase 3 completes the first half of accelerated Phases 3–4 without removing Phase 4 or later gates.
- Required action: Begin Phase 4 only after the Phase 3 checkpoint commit.

### DM-CLAIM-023 - Phase 3 implementation capability

- Outcome: TRUST (implementation evidence only)
- Finding: Source inspection and automated tests support deterministic ranking, budget arithmetic, strict validation, privacy filtering, and ephemerality.
- Permission consequence: The local Phase 3 checkpoint commit may proceed.
- Required action: Preserve the passing verification evidence in the Phase 3 checkpoint report.

## Implementation evidence

- TypeScript strict type check: PASS.
- Production compilation: PASS.
- Automated tests: 107 passed, 0 failed, 0 skipped, 0 todo.
- Inherited tests preserved in combined suite: 81.
- New Phase 3 tests: 26.
- Runtime dependencies: 0.
- Approved direct development dependencies: `typescript@6.0.3`, `@types/node@22.20.1`.
- Storage schema: unchanged at `1.0.0`.
- Context persistence: none detected in temporary-project tests.
- Runtime network imports or behavior: none detected.
- External services, remotes, uploads, telemetry, or accounts added: 0.
- Real secrets intentionally used: 0; tests use obviously fake secret-pattern fixtures.

## Known limitations

- Retrieval is deterministic lexical/tag matching, not semantic retrieval.
- The UTF-8-byte estimator is not an exact vendor tokenizer.
- The configured hard limit covers the canonical selected-memory agent payload; complete diagnostics are intentionally outside that budget.
- Automatic pre-task invocation and post-task finalization are Phase 4 and have not started.
- Retrieval precision/recall benchmarking remains Phase 7.
- Pattern-based secret detection cannot prove all content safe.

## Audit conclusion

Phase 3 is complete and independently verified locally. The local checkpoint commit is authorized by this audit; Phase 4 implementation, upload, remote configuration, external service, and publication remain outside this checkpoint.

---

# Audit DM-AUDIT-2026-07-22-002

## Audit metadata

- Date: 2026-07-22
- Audit type: Phase 4 implementation-candidate verification
- Scope: DM-CLAIM-024; lifecycle, migration, CLI, schema, authority, privacy, dependency, and persistence boundaries
- Auditor: Codex implementation verification process
- Engine version: 0.4.0
- Repository state: Unstaged Phase 4 candidate pending independent owner verification
- Overall result: RECHECK

## Overall explanation

Source inspection and 133 passing local tests support the implemented Phase 4 boundary. Lifecycle begin invokes Phase 3 retrieval without persisting raw task text or context statements. Finalization uses strict validation, controlled dispositions, the canonical mutation API, safe owner holds, durable recovery metadata, and completed-input idempotency. The live architecture and `DM-REQ-LIFE-002` require bootstrap migration in this milestone, so the candidate includes a narrow explicit-vocabulary importer that preserves the Markdown source.

`RECHECK` is appropriate because this is implementation-agent evidence before the required independent owner-verification checkpoint and commit. It does not elevate DM-CLAIM-024 or any other claim to `OWNER_CONFIRMED`.

## Implementation evidence

- Typecheck: passed.
- Build: passed.
- Automated tests: 133 passed, 0 failed, 0 skipped, 0 todo.
- Inherited tests preserved: 107.
- New Phase 4 tests: 26.
- Runtime dependencies: 0.
- Approved direct development dependencies: `typescript@6.0.3`, `@types/node@22.20.1`.
- Storage schema: unchanged at `1.0.0`.
- Runtime network, telemetry, external service, remote, and upload: none.

## Permission consequence

The unstaged Phase 4 candidate may proceed to independent owner verification. Phase 5, staging, commit, upload, remote configuration, external integration, and publication remain outside this implementation task.

## Remaining limitations

- Independent owner verification and checkpointing are pending.
- Multi-process locking and automatic recovery of interrupted finalization are not implemented.
- Authorized batch items apply independently; no filesystem-wide atomicity is claimed.
- Held items require a later safe owner-confirmation interface; there is no automatic approval shortcut.
- Pattern-based secret detection cannot prove all arbitrary content safe.

## Recommended action

Perform an independent clean-install and temporary-project owner-verification checkpoint against this unstaged candidate. If it passes, update only current candidate wording as needed and create the Phase 4 local checkpoint before beginning Phase 5.
---

# Audit DM-AUDIT-2026-07-22-003

## Audit metadata

- Date: 2026-07-22
- Audit type: Accelerated Phases 5–7 implementation-candidate verification
- Scope: DM-CLAIM-025; adapters, managed files, local stdio MCP, benchmark methodology, CLI, privacy, dependency, and local-only boundaries
- Auditor: Codex implementation verification process
- Engine version: 0.7.0
- Repository state: Unstaged candidate pending independent owner verification
- Overall result: RECHECK

## Overall explanation

Source inspection and local automated verification support the Version 0.7.0 implementation boundary. All five adapters delegate to the canonical lifecycle engine. Managed files use one controlled marker block and fail closed on path or marker corruption. MCP is isolated, local stdio only, dependency-free, and tested for JSON-RPC framing and error behavior. The benchmark invokes the production context compiler and records all four required baselines without concealing weaker outcomes.

`RECHECK` is appropriate because this is implementation-agent evidence before the required independent owner-verification checkpoint. It does not elevate DM-CLAIM-025 or the milestone to `OWNER_CONFIRMED`.

## Implementation evidence

- Typecheck: passed.
- Build: passed.
- Automated tests: 178 passed, 0 failed, 0 skipped, 0 todo.
- Inherited tests preserved: 150.
- New Phase 5–7 tests: 28.
- Benchmark scenarios: 22.
- Benchmark configurations: 4.
- Runtime dependencies: 0.
- Approved direct development dependencies: `typescript@6.0.3`, `@types/node@22.20.1`.
- Storage schema: unchanged at `1.0.0`.
- Runtime network, telemetry, external service, remote, global configuration, and upload: none.

## Benchmark comparison

| Configuration | Precision | Recall | Mean context items | Mean estimated tokens | Authority | Freshness | Safety violations | Secret leaks | Owner escalation | Abstention | Budget |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| NO_MEMORY | null | 0.000 | 0.000 | 0.000 | 100.0% | 100.0% | 0 | 0 | 90.9% | 13.6% | 100.0% |
| MONOLITHIC_GPTBRAIN | 0.508 | 1.000 | 1.318 | 184.409 | 81.8% | 95.5% | 8 | 1 | 90.9% | 86.4% | 95.5% |
| SIMPLE_SPLIT_FILES | 0.632 | 1.000 | 1.091 | 157.773 | 81.8% | 95.5% | 6 | 0 | 90.9% | 81.8% | 95.5% |
| DOUBTFUL_MEMORY | 1.000 | 1.000 | 0.682 | 28.455 | 100.0% | 100.0% | 0 | 0 | 100.0% | 72.7% | 100.0% |

Undefined precision or recall is represented as `null` and excluded from aggregate means.

## Permission consequence

The unstaged Version 0.7.0 candidate may proceed to independent owner verification. Phase 8, staging, commit, upload, remote configuration, external integration, global installation, and publication remain outside this implementation task.

## Remaining limitations

- Doubtful Memory's benchmark abstention-correct rate is 72.7%; safe records with no positive relevance can still enter context.
- Retrieval remains deterministic lexical/tag ranking rather than semantic retrieval.
- The MCP implementation is pinned to protocol revision `2025-11-25`; later revisions require review.
- Multi-process locking, automatic interrupted-lifecycle recovery, and the owner-confirmation UI remain unimplemented.
- Pattern-based secret detection cannot prove all arbitrary content safe.

## Recommended action

Perform an independent clean-install and isolated temporary-project owner-verification checkpoint against this unstaged Version 0.7.0 candidate. Do not begin Phase 8 until that checkpoint is complete.
---

# Audit DM-AUDIT-2026-07-23-004

## Audit metadata

- Date: 2026-07-23
- Audit type: Independent owner-verification and corrective Phases 5–7 checkpoint
- Scope: DM-CLAIM-026; positive relevance eligibility, managed adapters, cross-adapter equivalence, limited local stdio MCP, Benchmark Version 2.0.0, documentation, dependencies, privacy, and local-only boundaries
- Auditor: Codex independent owner-verification process
- Engine version: 0.7.0
- Repository state: Locally verified and authorized for the Phases 5–7 checkpoint commit
- Overall result: TRUST (implementation evidence only)

## Corrective findings

1. The candidate compiler already checked `relevance.score === 0`, so authority/freshness total score was not the observed root cause. The actual production weakness was undocumented substring containment and acceptance of broad common terms. Matching now requires positive exact Unicode-NFKC-normalized, case-folded, non-common lexical/tag relevance before ranking or budget.
2. Runtime context validation previously accepted a selected entry declaring zero relevance. It now rejects that state as `UNSAFE_SELECTION`.
3. The candidate benchmark generated its own fixture, assigned false abstention labels to six safety/privacy scenarios, omitted TP/FP/FN evidence and micro ratios, combined prevention with detection, and credited `NO_MEMORY` with classifications it did not perform. Version 2.0.0 treats fixture labels as independent input, uses explicit safety-adjusted relevance, separates metrics, and publishes all numerators and denominators.
4. Managed adapter inspection previously trusted marker layout without proving the block content was unchanged, and UTF-8 BOM byte offsets were unsafe. It now validates the exact registered block, preserves BOM and outside bytes, and refuses user-modified content.
5. MCP duplicate-ID state was unbounded and clean EOF did not process a final unterminated line. The implemented subset now uses a documented rolling 4,096-ID window, bounded oversized-line discard, strict parameter shapes, and deterministic final-EOF handling.

## Verification evidence

- Inherited Phase 1–4 tests: 150.
- Original Phase 5–7 candidate tests: 28.
- Independent corrective tests added: 24.
- Final automated suite: 202 passed, 0 failed, 0 skipped, 0 todo.
- Typecheck and build: PASS.
- Five managed file adapters install, status, dry-run, idempotent remove, and exact cleanup: PASS.
- Cross-adapter begin and mutating finalization equivalence across independent identical clones: PASS.
- Child-process MCP initialize, four-tool list, initialize-project, corrected begin-task abstention, and safe status: PASS.
- Corrected irrelevant-memory abstention: PASS with zero selected records and zero budget consumed.
- Benchmark regeneration twice: byte-identical.
- Benchmark JSON SHA-256: `aab7fc8a775d024256b7c6e53d19b426fed98702702a3b89b39bc6408a948eab`.
- Benchmark Markdown SHA-256: `4b302dd99cd693387af6d45737e57d45ed8f33bb4452736afb014dadecc3cfde`.
- Runtime dependencies: 0. Direct development dependencies remain exactly `typescript@6.0.3` and `@types/node@22.20.1`.
- Runtime network, telemetry, sockets, external services, remotes, uploads, global configuration, and Phase 8 work: none.

## Corrected benchmark comparison

| Configuration | Micro precision | Micro recall | Authority prevention | Authority detection | Freshness detection | Unsafe exposures | Secret leaks | Owner escalation | Abstention | Budget | Exact outcome |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| NO_MEMORY | null (0/0) | 0.000 (0/17) | 100.0% (4/4) | null (0/0) | null (0/0) | 0 | 0 | null (0/0) | 40.9% (9/22) | 100.0% (22/22) | 40.9% (9/22) |
| MONOLITHIC_GPTBRAIN | 0.586 (17/29) | 1.000 (17/17) | 0.0% (0/4) | null (0/0) | null (0/0) | 9 | 1 | null (0/0) | 59.1% (13/22) | 95.5% (21/22) | 36.4% (8/22) |
| SIMPLE_SPLIT_FILES | 0.708 (17/24) | 1.000 (17/17) | 0.0% (0/4) | null (0/0) | null (0/0) | 7 | 0 | null (0/0) | 72.7% (16/22) | 95.5% (21/22) | 59.1% (13/22) |
| DOUBTFUL_MEMORY | 1.000 (15/15) | 0.882 (15/17) | 100.0% (4/4) | 100.0% (4/4) | 100.0% (2/2) | 0 | 0 | 100.0% (22/22) | 100.0% (22/22) | 100.0% (22/22) | 100.0% (22/22) |

The two Doubtful Memory false negatives are the two safe relevant records in the deliberate eight-token budget-pressure scenario. They are excluded by the documented hard budget, not by relevance or safety failure.

## Permission consequence

The corrected Version 0.7.0 Phases 5–7 scope may be committed as one local checkpoint. This audit is TEST_VERIFIED implementation evidence, not OWNER_CONFIRMED release approval. Phase 8, dependency installation, external service integration, remote configuration, upload, publication, and product rename remain outside this checkpoint.

## Remaining limitations

- Retrieval is exact deterministic lexical/tag matching, not semantic retrieval.
- The UTF-8-byte token estimate is not an exact provider tokenizer.
- The MCP implementation is a deliberately limited stdio subset pinned to revision `2025-11-25`; later revisions and optional features require review.
- The 4,096-request duplicate-ID window permits reuse after eviction by design.
- Multi-process locking, automatic interrupted-lifecycle recovery, owner-confirmation UI, dashboard, and external benchmark validation remain incomplete.
- Pattern-based secret detection cannot prove every arbitrary value safe.

## Recommended action

Create the local Phases 5–7 checkpoint commit, then begin Phase 8 only in a new explicitly authorized task starting with dashboard planning and dependency review.

---

# Audit DM-AUDIT-2026-07-24-005

## Audit metadata

- Date: 2026-07-24
- Audit type: Phase 8 local implementation-candidate verification
- Scope: DM-CLAIM-027 and the dashboard engine, benchmark, HTTP, privacy, accessibility, dependency, and mutation boundaries
- Auditor: Codex implementation process
- Engine version: 0.8.0
- Repository state: Unstaged candidate pending independent owner review
- Overall result: TRUST (local implementation evidence only)

## Evidence

- Seven scenarios call production audit/context functions and return the required outcomes, rules, evidence, consequences, next steps, selections, exclusions, and budgets.
- Loopback routing, strict schemas, body limit, traversal/origin/method refusal, security headers, privacy-safe errors, benchmark integrity, deterministic output, no repository mutation, no `.gptbrain/`, and no context persistence pass.
- 202 inherited plus 14 Phase 8 tests: 216 passed, 0 failed, 0 skipped, 0 todo. Typecheck and build pass.
- Runtime dependencies remain zero; direct development dependencies remain TypeScript 6.0.3 and @types/node 22.20.1.
- No remote, upload, deployment, external resource, telemetry, browser persistence, or Phase 9 work exists.

## Limitations and permission

Lexical retrieval, approximate tokens, incomplete pattern detection, safe fixture scope, and the need for independent visual/device/assistive-technology review remain explicit. This candidate may proceed to independent owner verification but is not authorized for staging, commit, publication, remote configuration, or Phase 9.

## Recommended action

Independently verify the unstaged Phase 8 candidate and do not begin Phase 9.
---

# Audit DM-AUDIT-2026-07-24-006

## Audit metadata

- Date: 2026-07-24
- Audit type: Independent owner-verification and corrective Phase 8 checkpoint
- Scope: DM-CLAIM-027; canonical dashboard scenarios, benchmark integrity, HTTP and browser boundaries, repository isolation, visual behavior, keyboard accessibility, dependencies, documentation, and Git state
- Auditor: Codex independent owner-verification process
- Engine version: 0.8.0
- Repository state: Independently verified and authorized for the local Phase 8 checkpoint commit
- Overall result: TRUST (implementation evidence only)

## Corrective findings

1. Request routing accepted query-bearing targets, JSON-like media types, duplicate top-level JSON keys, Host confusion, and mismatched loopback origins. The server now requires exact origin-form paths, the exact JSON media type, unique top-level keys, the actual loopback Host and port, and the exact printed Origin.
2. An oversized declared body was not rejected before retention. The server now refuses declared lengths over 16,384 bytes before retaining content, drains the request, and keeps the received-body cap for chunked input.
3. Scenario buttons overwrote native button semantics with `role="listitem"`; the scenario collection now uses an accessible group while buttons retain their native role.
4. Tablet/mobile navigation was hidden instead of available. A native disclosure is now present, and its closed panel is explicitly hidden across browser implementations.
5. Initial load announced a reset, live results repeated too much content, and result busy/region state was incomplete. Initial load is silent, the announcement is concise, and focus moves to a labelled result region with explicit busy state.
6. Faint small text and the long benchmark hash caused contrast and mobile page-overflow defects. Contrast was increased and the hash wraps while the wide table remains intentionally region-scrolled.

## Verification evidence

- Inherited Phase 1–7 tests: 202.
- Original Phase 8 candidate tests: 14.
- Independent Phase 8 suite after focused additions: 18.
- Final automated suite: 220 passed, 0 failed, 0 skipped, 0 todo.
- Typecheck, build, clean install, full verification, focused dashboard verification, dependency tree, and diff checks: PASS.
- Seven live scenarios return exactly `BLOCK_ACTION`, `RECHECK`, `BLOCK_ACTION`, `ASK_OWNER`, `FORGET_OR_REDACT`, `TRUST`, and `TRUST`; repeated requests are byte-equivalent.
- The dashboard calls canonical `auditRecord` and `compileContext`; browser code contains no audit, authority, privacy, ranking, freshness, or budget policy copy.
- Benchmark JSON is loaded only after SHA-256 `aab7fc8a775d024256b7c6e53d19b426fed98702702a3b89b39bc6408a948eab` verification; altered artifacts are rejected.
- Loopback-only binding, exact URL/port, strict Host/Origin/routes/methods/media/schema/body limits, traversal refusal, allowlisted assets, restrictive headers, privacy-safe errors, interrupted-body recovery, and no CORS: PASS.
- No external resource, telemetry, analytics, hosted font, cloud integration, browser persistence, unsafe dynamic rendering, context persistence, repository `.gptbrain/`, or source mutation exists.
- Browser visual review at 1440×900, 1024×768, and 390×844 found no required-content clipping, page-level overflow, overlap, or broken control; table overflow remains scoped to its labelled region.
- A native Chromium keyboard-only flow traversed controls, selected the privacy scenario, adjusted the budget, ran `FORGET_OR_REDACT`, moved focus to the result, Shift+Tabbed to reset, restored visible focus to Run, and opened the mobile Sections disclosure.
- Runtime dependencies: 0. Direct development dependencies remain exactly `typescript@6.0.3` and `@types/node@22.20.1`.
- Requirement ledger count remains mechanically verified at 60 unique IDs: 48 IMPLEMENTED, 12 IN_PROGRESS, 0 VERIFIED. No status was elevated from test evidence alone.

## Limitations and permission

Retrieval remains exact lexical/tag matching, token accounting remains an estimate, secret detection remains pattern-based, MCP remains a deliberately limited local stdio subset, and the dashboard remains a safe fixed-fixture demonstration. Real assistive-technology, physical-device, independent judge-comprehension, external benchmark validity, release, and publication review remain pending. This audit authorizes only the local Phase 8 checkpoint commit; it does not provide OWNER_CONFIRMED release approval, remote configuration, publication authority, or permission to begin Phase 9.

## Recommended action

Create the local Phase 8 checkpoint commit. Begin Phase 9 only in a new explicitly authorized release-hardening task; do not push, publish, deploy, or configure a remote from this checkpoint.