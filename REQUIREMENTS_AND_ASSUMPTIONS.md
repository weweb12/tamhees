# Doubtful Memory - Requirements and Assumptions

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

# 1. Product requirements

## DM-REQ-PROD-001 - Clear opening explanation

- Priority: MUST
- Status: NOT_STARTED

The opening interface must explain within one screen that project memory can be inaccurate, invasive, or overconfident and that Doubtful Memory audits whether remembered claims are safe to use.

### Acceptance criteria

- The problem is visible without opening documentation.
- The product purpose is explained in plain language.
- The opening content does not claim that AI project memory is a new invention.
- A first-time user can identify the primary action.

---

## DM-REQ-PROD-002 - Working interactive audit

- Priority: MUST
- Status: NOT_STARTED

The application must execute a real audit using structured claim and evidence data.

### Acceptance criteria

- Audit results are calculated rather than stored as fixed presentation text.
- Modifying relevant input changes the result.
- The same input produces the same result.
- The interface displays the calculated outcome.

---

## DM-REQ-PROD-003 - Multiple representative scenarios

- Priority: MUST
- Status: NOT_STARTED

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
- Status: NOT_STARTED

The application must be understandable and useful without knowledge of the Doo challenge.

### Acceptance criteria

- Core interface text does not depend on challenge context.
- Documentation explains practical developer and team use cases.
- Challenge alignment is presented separately from product identity.

---

# 2. Memory-claim requirements

## DM-REQ-CLAIM-001 - Stable claim identifier

- Priority: MUST
- Status: NOT_STARTED

Every memory claim must have a unique, stable identifier.

### Acceptance criteria

- Missing identifiers are detected.
- Duplicate identifiers are detected.
- Audit results reference the claim identifier.

---

## DM-REQ-CLAIM-002 - Claim statement

- Priority: MUST
- Status: NOT_STARTED

Every memory claim must contain a plain-language statement describing what is believed.

### Acceptance criteria

- Empty claims are rejected or flagged.
- The interface displays the statement clearly.
- The statement is distinguishable from evidence and instructions.

---

## DM-REQ-CLAIM-003 - Provenance and source

- Priority: MUST
- Status: NOT_STARTED

Every claim must identify where it came from.

### Acceptance criteria

- Missing source information prevents automatic trust.
- Source type and source reference are distinguishable.
- The interface displays the relevant provenance.

---

## DM-REQ-CLAIM-004 - Verification status

- Priority: MUST
- Status: NOT_STARTED

Every claim must have a controlled verification status.

Initial status candidates are:

- `OWNER_CONFIRMED`
- `VERIFIED_IN_REPOSITORY`
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

The final status vocabulary will be approved during protocol design.

---

## DM-REQ-CLAIM-005 - Confidence

- Priority: MUST
- Status: NOT_STARTED

Every claim must contain a controlled confidence value.

Initial values are:

- `HIGH`
- `MEDIUM`
- `LOW`

### Acceptance criteria

- Confidence is displayed separately from evidence quality.
- High confidence cannot override a conflict or revocation.
- Low confidence cannot independently authorize a significant action.
- Missing confidence is detected.

---

## DM-REQ-CLAIM-006 - Freshness

- Priority: MUST
- Status: NOT_STARTED

Claims must support a last-verification time and an optional review or expiration rule.

### Acceptance criteria

- The engine can determine whether a claim requires review.
- Invalid dates are detected.
- An expired claim cannot be silently treated as current.
- The audit explanation identifies the freshness problem.

---

## DM-REQ-CLAIM-007 - Sensitivity

- Priority: MUST
- Status: NOT_STARTED

Claims must include a sensitivity classification.

### Acceptance criteria

- Sensitive claims receive stricter retention handling.
- Secret-like raw values are not approved for ordinary retention.
- Sensitivity affects audit outcomes when appropriate.
- Sensitivity is visible without revealing protected content.

The exact classification vocabulary will be approved during protocol design.

---

## DM-REQ-CLAIM-008 - Permission to act

- Priority: MUST
- Status: NOT_STARTED

Every claim must state whether and how an agent may act based on it.

### Acceptance criteria

- Permission is separate from confidence.
- Missing permission prevents significant automatic action.
- The requested action is evaluated against the recorded permission.
- The explanation states why action is allowed, restricted, or blocked.

---

## DM-REQ-CLAIM-009 - Recheck method

- Priority: MUST
- Status: NOT_STARTED

A claim that may require verification should provide a practical recheck method.

### Acceptance criteria

- The method can describe repository inspection, testing, document review, or asking the owner.
- The interface displays the recommended recheck.
- Claims requiring recheck do not produce an unexplained dead end.

---

# 3. Audit-engine requirements

## DM-REQ-AUDIT-001 - Five primary outcomes

- Priority: MUST
- Status: NOT_STARTED

The engine must produce one primary outcome:

- `TRUST`
- `RECHECK`
- `ASK_OWNER`
- `BLOCK_ACTION`
- `FORGET_OR_REDACT`

### Acceptance criteria

- Every completed audit has one primary outcome.
- The outcome follows documented rules.
- Rule priority resolves multiple findings consistently.
- The same evaluated state cannot produce contradictory primary outcomes.

---

## DM-REQ-AUDIT-002 - Evidence comparison

- Priority: MUST
- Status: NOT_STARTED

The engine must compare remembered claims with relevant current evidence.

### Acceptance criteria

- Supporting and conflicting evidence can be represented.
- Conflict detection is testable.
- The interface identifies which evidence was compared.
- Missing evidence is not treated as confirmation.

---

## DM-REQ-AUDIT-003 - Explainable decisions

- Priority: MUST
- Status: NOT_STARTED

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
- Status: NOT_STARTED

The core audit engine must be deterministic and independent from a hosted AI model.

### Acceptance criteria

- Repeated identical inputs produce identical outputs.
- Critical rules have automated tests.
- The engine can run without internet access.
- No API key is required.

---

## DM-REQ-AUDIT-005 - Conflict safety

- Priority: MUST
- Status: NOT_STARTED

A material unresolved conflict must prevent `TRUST`.

### Acceptance criteria

- Conflicted claims do not authorize dependent actions.
- The result identifies both sides of the conflict.
- Human confirmation is requested when authority is unclear.
- Resolution is not simulated automatically.

---

## DM-REQ-AUDIT-006 - Revocation safety

- Priority: MUST
- Status: NOT_STARTED

A revoked claim must not authorize action.

### Acceptance criteria

- Revoked state is detected.
- The prior content can be identified without being treated as active truth.
- The result recommends using the replacement decision or asking the owner.

---

## DM-REQ-AUDIT-007 - Privacy-safe handling

- Priority: MUST
- Status: NOT_STARTED

Secret-like or unnecessarily sensitive raw content must not be preserved in audit output, logs, exports, or persistent client storage.

### Acceptance criteria

- Redaction occurs before persistence or export.
- Tests use fake secrets.
- Audit history contains safe metadata rather than the raw value.
- Documentation states the limitations of pattern-based detection.

---

## DM-REQ-AUDIT-008 - Rule traceability

- Priority: MUST
- Status: NOT_STARTED

Every audit rule must have a stable identifier and a human-readable description.

### Acceptance criteria

- Triggered rule IDs appear in audit results.
- Tests reference rule IDs.
- Documentation maps identifiers to behavior.
- UI explanations remain consistent with rule definitions.

---

# 4. User-interface requirements

## DM-REQ-UI-001 - Primary audit journey

- Priority: MUST
- Status: NOT_STARTED

A user must be able to select a scenario, inspect its memory and evidence, run the audit, understand the result, and see the safe next action.

### Acceptance criteria

- The journey has no broken step.
- The selected scenario is always visible.
- Memory and current evidence are visually distinguishable.
- The primary outcome is prominent.
- Reset behavior is available.

---

## DM-REQ-UI-002 - Responsive layout

- Priority: MUST
- Status: NOT_STARTED

The interface must work on desktop, tablet, and mobile screen sizes.

### Acceptance criteria

- No required content is clipped.
- No uncontrolled horizontal scrolling occurs.
- Controls remain usable at supported sizes.
- Evidence and results remain understandable when stacked.

---

## DM-REQ-UI-003 - Accessible status communication

- Priority: MUST
- Status: NOT_STARTED

Status and outcomes must not rely on color alone.

### Acceptance criteria

- Outcomes include text labels.
- Important icons have accessible names or accompanying text.
- Text contrast is reviewed.
- Keyboard focus is visible.

---

## DM-REQ-UI-004 - Keyboard operation

- Priority: MUST
- Status: NOT_STARTED

The primary demonstration must be operable using a keyboard.

### Acceptance criteria

- Interactive controls are reachable in a logical order.
- Focus is visible.
- Buttons activate using standard keyboard behavior.
- No essential action requires precise pointer movement.

---

## DM-REQ-UI-005 - Plain-language explanations

- Priority: MUST
- Status: NOT_STARTED

The interface must explain technical concepts without assuming prior knowledge of the protocol.

### Acceptance criteria

- Terms such as provenance, confidence, freshness, and action permission are explained.
- Error messages describe recovery steps.
- The interface avoids unexplained status codes.
- Detailed technical information remains available without overwhelming the primary flow.

---

# 5. Technical requirements

## DM-REQ-TECH-001 - Local operation

- Priority: MUST
- Status: NOT_STARTED

The core application must run locally without a backend, account, cloud database, or hosted model.

### Acceptance criteria

- Local development requires no service credentials.
- Core scenarios function without network access.
- Production build contains the required scenario data.
- No telemetry request is made.

---

## DM-REQ-TECH-002 - Type safety

- Priority: MUST
- Status: NOT_STARTED

The application and audit engine must use TypeScript types for the claim schema, evidence, rules, findings, permissions, and outcomes.

### Acceptance criteria

- Type checking passes.
- Core protocol objects do not use unexplained `any` types.
- Invalid controlled values are rejected during development or validation.

---

## DM-REQ-TECH-003 - Automated tests

- Priority: MUST
- Status: NOT_STARTED

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
- Status: NOT_STARTED

The project must produce a clean static production build.

### Acceptance criteria

- The build command completes without errors.
- The built application loads correctly.
- No development-only dependency is required at runtime.
- Required assets and scenarios are present.

---

## DM-REQ-TECH-005 - Controlled dependencies

- Priority: MUST
- Status: NOT_STARTED

Every direct dependency must have a documented purpose and must not require a paid or hosted service for core operation.

### Acceptance criteria

- Dependencies are reviewed before installation.
- A lockfile is committed.
- Unused dependencies are removed.
- Known audit warnings are reviewed rather than ignored.
- No dependency requires payment information.

---

# 6. Documentation requirements

## DM-REQ-DOC-001 - Setup documentation

- Priority: MUST
- Status: NOT_STARTED

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
- Status: NOT_STARTED

Documentation must explain the system architecture, claim schema, audit rules, outcome priority, privacy behavior, and limitations.

### Acceptance criteria

- Documentation matches implemented behavior.
- Protocol files are included.
- Limitations are explicit.
- Existing agent-memory conventions are acknowledged accurately.

---

## DM-REQ-DOC-003 - Demonstration guide

- Priority: MUST
- Status: NOT_STARTED

Documentation must provide a short reproducible path through the primary contradiction scenario.

### Acceptance criteria

- The scenario can be completed without hidden setup.
- Expected behavior is described.
- The guide identifies the decisive refusal-to-act moment.
- The guide matches the final interface.

---

# 7. Quality requirements

## DM-REQ-QUAL-001 - No knowingly fake functionality

- Priority: MUST
- Status: NOT_STARTED

Controls and displayed results must represent real implemented behavior.

### Acceptance criteria

- Buttons perform their stated action.
- Audit outputs are calculated.
- Disabled or future features are clearly labeled or omitted.
- No visual element falsely implies external integration.

---

## DM-REQ-QUAL-002 - Cross-artifact consistency

- Priority: MUST
- Status: NOT_STARTED

The application, tests, protocol, README, screenshots, video, and submission description must not contradict one another.

### Acceptance criteria

- A final consistency review is completed.
- Outcome names and meanings match everywhere.
- Setup commands are verified.
- Screenshots and scripts reflect the final build.

---

# 8. Current assumptions

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

A static interactive website is assumed to be an acceptable demonstration format.

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

- Verification status: TO_BE_TESTED
- Impact if wrong: HIGH

A deterministic engine is expected to demonstrate the essential safety model without an AI API.

### Validation method

Test the engine against representative scenarios and evaluate whether the rules produce useful, understandable outcomes.

---

# 9. Traceability rule

Every implemented feature must reference one or more requirement IDs.

Every critical automated test must reference the audit requirement or rule it verifies.

If a requirement changes:

1. Record the reason in `DECISIONS.md`.
2. Update its status and acceptance criteria.
3. Update affected tests and documentation.
4. Review related risks.
5. Update `PROJECT_STATE.md`.

## Current requirement summary

- Requirements defined: 36
- Requirements verified: 0
- Requirements in progress: 0
- Requirements not started: 36
- Assumptions recorded: 7
- Assumptions fully verified: 0