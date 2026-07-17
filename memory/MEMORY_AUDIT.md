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

These audits are manual project-control audits. The production audit engine is not implemented. This file must not falsely imply that automated audit behavior exists.

When the engine is implemented, it will produce audit events in `.gptbrain/audits/history.jsonl`. These manual audits serve as the bootstrap record.

---

# Audit DM-AUDIT-2026-07-11-001

## Audit metadata

- Date: 2026-07-11
- Audit type: Initial manual project-control audit
- Scope: DM-CLAIM-001 through DM-CLAIM-010
- Auditor: Project development process
- Engine version: Not implemented
- Repository state: Planning files are uncommitted
- Overall result: RECHECK

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