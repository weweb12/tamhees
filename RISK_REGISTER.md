# Doubtful Memory - Risk Register

## Purpose

This file records conditions that could damage the project's usefulness, safety, quality, schedule, cost, privacy, or submission readiness.

Risks must be reviewed at the end of every major development phase.

## Rating scale

### Likelihood

- `LOW`: Unlikely under the current plan.
- `MEDIUM`: Realistic and requires monitoring.
- `HIGH`: Expected unless actively controlled.

### Impact

- `LOW`: Limited inconvenience with no serious effect on the product.
- `MEDIUM`: Causes rework, confusion, delay, or a noticeable quality problem.
- `HIGH`: Threatens product credibility, safety, completion, privacy, or submission.

### Status

- `OPEN`: Requires active monitoring or mitigation.
- `CONTROLLED`: Mitigation exists and is currently effective.
- `OCCURRED`: The risk has become an active issue.
- `CLOSED`: The risk no longer applies.
- `ACCEPTED`: The owner knowingly accepts the remaining risk.

---

## DM-RISK-001 - Unverified official challenge requirements

- Likelihood: HIGH
- Impact: MEDIUM
- Status: OPEN
- Owner: Project owner
- Related decision: DM-DEC-003

### Risk

The official detailed Doo challenge brief remains unavailable. The product could miss an unknown requirement or judging criterion.

### Warning signs

- The official page becomes available and contradicts our assumptions.
- A submission field requests an artifact we did not prepare.
- The organizer provides late instructions.
- The deadline or eligibility rules differ from the visible information.

### Mitigation

- Keep challenge assumptions explicitly labeled as unverified.
- Build a useful standalone product rather than a challenge-only presentation.
- Keep the architecture adaptable.
- Recheck the official page before final submission preparation.
- Reserve time for submission adjustments.

### Contingency

If new requirements appear, perform a documented gap analysis and prioritize mandatory changes before optional polish.

---

## DM-RISK-002 - Product becomes only a documentation template

- Likelihood: MEDIUM
- Impact: HIGH
- Status: OPEN
- Owner: Development process
- Related decision: DM-DEC-001

### Risk

The project may appear to be a collection of Markdown templates rather than a working safety product.

### Warning signs

- Most of the demonstration consists of reading files.
- The interface does not perform real evaluation.
- Audit outcomes are manually written into scenarios.
- There are no automated tests for decisions.

### Mitigation

- Implement a deterministic audit engine.
- Generate results from structured inputs.
- Demonstrate multiple failure modes.
- Test decision rules independently from the interface.
- Show how the protocol can work with existing agent files.

### Contingency

Reduce decorative work and prioritize the working audit engine, test evidence, and scenario execution.

---

## DM-RISK-003 - Audit rules are arbitrary or inconsistent

- Likelihood: MEDIUM
- Impact: HIGH
- Status: OPEN
- Owner: Development process
- Related decision: DM-DEC-008

### Risk

Users may not trust the product if similar inputs produce inconsistent outcomes or if outcome priority is unclear.

### Warning signs

- Two rules recommend incompatible outcomes.
- Confidence overrides stronger evidence.
- A conflicted claim produces `TRUST`.
- Explanations do not match the actual rule.
- Tests require many unexplained exceptions.

### Mitigation

- Define the claim schema before implementation.
- Define an explicit rule-priority order.
- Separate evidence quality from confidence.
- Give every rule a stable identifier.
- Test boundary cases and conflicting signals.
- Ensure UI explanations are generated from the evaluated rule results.

### Contingency

Pause interface development, simplify the rule model, document precedence, and add regression tests before continuing.

---

## DM-RISK-004 - Unsafe handling of sensitive content

- Likelihood: MEDIUM
- Impact: HIGH
- Status: OPEN
- Owner: Development process
- Related decision: DM-DEC-009

### Risk

The application could accidentally display, persist, export, or log a secret-like value that it was supposed to protect.

### Warning signs

- Raw input is stored in audit history.
- Browser storage contains a secret-like test value.
- Exported files include the original sensitive value.
- Console logs contain unredacted input.
- Redaction occurs only visually after storage.

### Mitigation

- Use fake secret values in all tests and demos.
- Redact before persistence or export.
- Avoid logging raw user input.
- Test data-flow boundaries.
- Clearly document that pattern detection cannot guarantee identification of every secret.

### Contingency

Stop release preparation, remove affected stored data, correct the data flow, and add regression tests.

---

## DM-RISK-005 - Scope expansion prevents completion

- Likelihood: HIGH
- Impact: HIGH
- Status: OPEN
- Owner: Project owner and development process
- Related decision: DM-DEC-010

### Risk

Additional features could turn the focused Version 1 prototype into an unfinished agent platform.

### Warning signs

- Adding accounts, cloud synchronization, IDE integrations, or autonomous agents.
- Beginning new features before core audit rules pass.
- Repeatedly redesigning approved flows.
- Creating features with no direct connection to the problem statement.
- Delaying testing until the end.

### Mitigation

- Maintain explicit Version 1 exclusions.
- Record scope changes in `DECISIONS.md`.
- Require a challenge or user-value justification for every feature.
- Complete one phase and its acceptance gate before starting the next.
- Move optional ideas to a future backlog.

### Contingency

Freeze new features, remove incomplete optional work, and return to the minimum complete product.

---

## DM-RISK-006 - Unsupported uniqueness or market claims

- Likelihood: MEDIUM
- Impact: MEDIUM
- Status: OPEN
- Owner: Product documentation
- Related decision: DM-DEC-002

### Risk

The project could lose credibility by claiming that AI project memory does not exist or that no other system addresses memory safety.

### Warning signs

- Marketing uses phrases such as "the first ever" without evidence.
- Existing memory systems are ignored.
- Competitors are described inaccurately.
- The pitch confuses memory continuity with memory auditing.

### Mitigation

- Acknowledge existing systems such as agent instruction files and memory banks.
- Position Doubtful Memory as a verification and action-safety layer.
- Use evidence-based comparisons.
- Avoid absolute market claims.
- Recheck current official product documentation before publishing comparisons.

### Contingency

Remove unsupported claims and replace them with a precise explanation of the project's narrower contribution.

---

## DM-RISK-007 - External service or unexpected cost

- Likelihood: LOW
- Impact: HIGH
- Status: CONTROLLED
- Owner: Project owner and development process
- Related decision: DM-DEC-005

### Risk

A dependency, publishing service, API, asset, trial, or platform could introduce a fee or future billing obligation.

### Warning signs

- A service requests payment information.
- A package requires a hosted account.
- A free plan has automatic overage billing.
- A feature depends on a third-party API.
- Publishing instructions require a subscription.

### Mitigation

- Keep the core application local.
- Review dependencies before installation.
- Do not enter payment information.
- Explain external-service pricing and alternatives before use.
- Require explicit owner approval.

### Contingency

Reject or remove the service and use a local or genuinely free alternative.

---

## DM-RISK-008 - Dependency or supply-chain problem

- Likelihood: MEDIUM
- Impact: MEDIUM
- Status: OPEN
- Owner: Development process
- Related decision: DM-DEC-007

### Risk

An unnecessary, abandoned, vulnerable, or compromised package could affect security, maintenance, or build reliability.

### Warning signs

- Excessive transitive dependencies.
- Unmaintained packages.
- Security audit warnings.
- Install scripts with unexplained behavior.
- A dependency duplicates a simple capability we can implement safely.
- Version ranges unexpectedly install different major versions.

### Mitigation

- Minimize dependencies.
- Review each direct dependency's purpose and official source.
- Use a lockfile.
- Pin or control important versions.
- Run local security and license checks.
- Avoid packages for trivial functionality.

### Contingency

Remove or replace the affected dependency and rerun the complete test and production-build process.

---

## DM-RISK-009 - UI polish hides weak product behavior

- Likelihood: MEDIUM
- Impact: HIGH
- Status: OPEN
- Owner: Product and development process
- Related decision: DM-DEC-010

### Risk

The application may look polished while providing scripted, shallow, or misleading audit behavior.

### Warning signs

- Scenario outputs are stored as fixed display text.
- Changing input does not change the result.
- The interface cannot show why a decision occurred.
- Visual work advances while the audit engine remains untested.

### Mitigation

- Build the protocol and decision rules before final visual polish.
- Keep the engine independent from UI components.
- Make scenarios execute the same engine used by tests.
- Display evaluated evidence and triggered rules.

### Contingency

Pause visual refinement and complete real behavior, tests, and evidence tracing first.

---

## DM-RISK-010 - Inaccessible or confusing interface

- Likelihood: MEDIUM
- Impact: MEDIUM
- Status: OPEN
- Owner: Design and development process

### Risk

Users or judges may not understand the product quickly, or may be unable to operate it using keyboard navigation and common screen sizes.

### Warning signs

- The core problem is unclear within the opening screen.
- Status depends only on color.
- Text contrast is weak.
- Keyboard focus is missing or confusing.
- Mobile layout hides important evidence.
- Technical terminology is unexplained.

### Mitigation

- Define the primary user journey before coding.
- Use plain-language explanations.
- Provide text and icons in addition to color.
- Test keyboard navigation and visible focus.
- Test desktop, tablet, and mobile layouts.
- Review contrast and semantic structure.

### Contingency

Simplify the interface and delay optional visual effects until usability requirements pass.

---

## DM-RISK-011 - Documentation and application drift apart

- Likelihood: MEDIUM
- Impact: HIGH
- Status: OPEN
- Owner: Development process

### Risk

The protocol, README, application behavior, tests, and presentation may describe different rules or capabilities.

### Warning signs

- An outcome exists in code but not in the protocol.
- README instructions no longer run.
- Screenshots show an old interface.
- The video describes a removed feature.
- Control documents reference superseded behavior.

### Mitigation

- Update documentation with meaningful behavior changes.
- Generate UI explanations from rule metadata where practical.
- Perform cross-artifact review before release.
- Rerun setup instructions from a clean environment.
- Keep one canonical definition for every rule.

### Contingency

Stop release preparation and reconcile every contradiction before recording or submitting.

---

## DM-RISK-012 - Local data loss or repository corruption

- Likelihood: LOW
- Impact: HIGH
- Status: CONTROLLED
- Owner: Project owner and development process
- Related decision: DM-DEC-012

### Risk

Local-only development could be lost through disk failure, accidental deletion, or repository corruption.

### Warning signs

- Long periods without commits.
- Important files remain untracked.
- Git reports repository errors.
- Project files exist only in temporary locations.
- Destructive commands are used without review.

### Mitigation

- Make verified local commits at stable checkpoints.
- Keep the repository outside OneDrive during active development.
- Avoid destructive Git commands.
- Review `git status` before every commit.
- Discuss a private backup strategy after the initial project structure is stable.

### Contingency

Use the latest verified local commit or approved backup to restore the project.

---

## Current risk summary

### Highest-priority open risks

1. DM-RISK-001 - Unverified official challenge requirements.
2. DM-RISK-002 - Product becomes only a documentation template.
3. DM-RISK-003 - Audit rules are arbitrary or inconsistent.
4. DM-RISK-004 - Unsafe handling of sensitive content.
5. DM-RISK-005 - Scope expansion prevents completion.
6. DM-RISK-009 - UI polish hides weak product behavior.
7. DM-RISK-011 - Documentation and application drift apart.

### Controlled risks

- DM-RISK-007 - External service or unexpected cost.
- DM-RISK-012 - Local data loss or repository corruption.

## Review schedule

Review this register:

- At the end of project control.
- After protocol approval.
- After audit-engine implementation.
- After interface implementation.
- Before production build.
- Before any external publication.
- Whenever a risk occurs or a major decision changes.