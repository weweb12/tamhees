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
- Related decision: DM-DEC-019

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

- Minimize dependencies (target zero runtime dependencies).
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

## DM-RISK-013 - Retrieval misses critical memory

- Likelihood: MEDIUM
- Impact: HIGH
- Status: OPEN
- Owner: Development process
- Related decision: DM-DEC-013
- Added: 2026-07-15

### Risk

The context compiler fails to retrieve a memory record that is critical for the current task, causing the agent to make decisions without necessary context.

### Warning signs

- An agent makes a decision that contradicts a known memory.
- A critical constraint is not included in the context pack.
- Budget limits exclude important records.
- Retrieval ranking consistently misses certain categories of memory.

### Mitigation

- Require positive task relevance before ranking. Any future mandatory-memory mechanism must be separately specified and approved rather than inferred from authority.
- Test retrieval precision and recall with benchmark fixtures.
- Explain exclusions in the context pack so the agent can request missing context.
- Allow agents to request specific memories by ID.

### Contingency

Expand the retrieval strategy, increase budget for critical categories, and add regression fixtures for missed cases.

---

## DM-RISK-014 - Retrieval includes irrelevant or unsafe memory

- Likelihood: MEDIUM
- Impact: HIGH
- Status: OPEN
- Owner: Development process
- Related decision: DM-DEC-021
- Added: 2026-07-15

### Risk

The context compiler includes expired, conflicted, revoked, or sensitive memory in the context pack, leading to incorrect or unsafe agent behavior.

### Warning signs

- An expired decision appears as current in context.
- A conflicted memory is presented without conflict indication.
- Sensitive content appears unredacted in context output.
- Revoked memories are included without revocation status.

### Mitigation

- Apply freshness, conflict, and revocation filters before inclusion.
- Redact sensitive content before output.
- Mark any included uncertain memory with audit warnings.
- Test with fixtures containing expired, conflicted, and sensitive records.

### Contingency

Add stricter filtering rules and regression tests. Review and correct any context packs that included unsafe content.

---

## DM-RISK-015 - Automatic update corrupts canonical memory

- Likelihood: LOW
- Impact: HIGH
- Status: OPEN
- Owner: Development process
- Related decision: DM-DEC-020
- Added: 2026-07-15

### Risk

The automatic post-task finalization writes incorrect, incomplete, or contradictory data to canonical memory records, damaging the project's knowledge base.

### Warning signs

- A canonical record contains data that contradicts current repository evidence.
- An atomic write fails midway and leaves a corrupt file.
- The memory index diverges from the actual records.
- An update overwrites a more authoritative record.

### Mitigation

- Use atomic writes (temp file + rename) for all storage operations.
- Validate proposed updates against authority rules before writing.
- Maintain index consistency checks.
- Keep audit log of all changes.
- Preserve superseded records in archive.

### Contingency

Restore from the previous version in archive. Add regression tests for the failure case. Review and repair the index.

---

## DM-RISK-016 - Agent inference escalates authority

- Likelihood: MEDIUM
- Impact: HIGH
- Status: OPEN
- Owner: Development process
- Related decision: DM-DEC-020
- Added: 2026-07-15

### Risk

An agent inference is incorrectly stored or treated as owner-confirmed truth, allowing unauthorized scope, budget, or privacy decisions.

### Warning signs

- An INFERRED memory is used to authorize a scope change.
- The update pipeline accepts OWNER_CONFIRMED status from a non-owner source.
- The audit engine treats agent-generated summaries as independent evidence.
- Authority checks are bypassed through a code path.

### Mitigation

- Enforce non-escalation rules at the engine level.
- Test that every code path validates authority before writing.
- Log authority level in every audit event.
- Test escalation rejection with specific fixtures.

### Contingency

Revert the incorrectly escalated record. Fix the validation gap. Add regression test.

---

## DM-RISK-017 - Adapter behavior drifts between tools

- Likelihood: MEDIUM
- Impact: MEDIUM
- Status: OPEN
- Owner: Development process
- Related decision: DM-DEC-023
- Added: 2026-07-15

### Risk

Different adapters produce different results for the same memory query, undermining the canonical source of truth principle.

### Warning signs

- Cross-adapter equivalence tests fail.
- An adapter applies its own filtering or ranking.
- An adapter caches results independently.
- Business logic exists in adapter code rather than the engine.

### Mitigation

- Keep adapters as thin translation layers.
- All business logic stays in the engine.
- Run cross-adapter equivalence tests in the benchmark harness.
- Code review adapter implementations for business logic leaks.

### Contingency

Move any adapter-specific logic into the engine. Fix equivalence test failures.

---

## DM-RISK-018 - MCP behavior or specification changes

- Likelihood: MEDIUM
- Impact: MEDIUM
- Status: OPEN
- Owner: Development process
- Related decision: DM-DEC-013
- Added: 2026-07-15

### Risk

The Model Context Protocol specification changes between when the adapter is designed and when it is implemented or used in production, breaking compatibility.

### Warning signs

- MCP SDK releases a breaking change.
- The MCP specification deprecates a feature the adapter relies on.
- Agent MCP clients behave differently than expected.
- The stdio transport convention changes.

### Mitigation

- Isolate MCP parsing and tools behind a small protocol boundary tested against revision `2025-11-25`.
- Monitor MCP specification changes.
- Keep the owner-approved Node.js built-in implementation dependency-free; require a new decision before adopting an SDK.
- Design the adapter to isolate MCP-specific concerns.

### Contingency

Update the adapter to match the current specification. If breaking changes are severe, defer MCP support and rely on the generic adapter.

---

## DM-RISK-019 - Benchmark comparisons become unfair

- Likelihood: LOW
- Impact: MEDIUM
- Status: OPEN
- Owner: Development process
- Related decision: DM-DEC-022
- Added: 2026-07-15

### Risk

The benchmark baselines (no memory, original GPTBrain.md, simple split-file) are constructed in a way that unfairly disadvantages them or unfairly advantages Doubtful Memory.

### Warning signs

- Baseline fixture data is intentionally poor quality.
- Doubtful Memory fixture data is optimized for the benchmark.
- Measurements exclude cases where Doubtful Memory performs worse.
- Reviewers identify bias in the comparison methodology.

### Mitigation

- Use the same underlying project data across all baselines.
- Document the fixture construction methodology.
- Include measurements where Doubtful Memory may not improve on simpler approaches.
- Have the benchmark methodology reviewed before publication.

### Contingency

Reconstruct baselines with reviewer feedback. Acknowledge limitations in the benchmark results.

### Current evidence (Version 0.7.0 checkpoint)

Independent verification corrected the candidate methodology: fixture ground truth is no longer generated, safe relevance is explicit, undefined classifications are null, and prevention is separate from detection. Doubtful Memory now records 22/22 abstention correctness, 22/22 exact outcomes, and zero unsafe or secret exposures on the fixed fixture. The risk remains OPEN because deterministic fixtures cannot prove external validity or prevent future benchmark drift.

---

## DM-RISK-020 - Context compiler costs more than it saves

- Likelihood: LOW
- Impact: MEDIUM
- Status: OPEN
- Owner: Development process
- Related decision: DM-DEC-013
- Added: 2026-07-15

### Risk

The overhead of retrieval, auditing, ranking, and formatting context packs is greater than the benefit of selective memory, making the tool impractical for routine use.

### Warning signs

- Context compilation takes noticeably long for small projects.
- The output is larger than the original memory file.
- Users bypass the context compiler and read files directly.
- The benchmark shows minimal improvement over simpler approaches.

### Mitigation

- Optimize retrieval for common cases.
- Keep the context compiler's processing minimal for small memory stores.
- Benchmark context size and estimated token use in the current harness; add controlled timing measurement before making performance claims.
- Provide a fast-path for small projects.

### Contingency

Simplify the context compiler. Reduce the overhead at the cost of less precise selection.

---

## DM-RISK-021 - Runtime context leaks into Git

- Likelihood: MEDIUM
- Impact: HIGH
- Status: OPEN
- Owner: Development process
- Related decision: DM-DEC-021
- Added: 2026-07-15

### Risk

Ephemeral runtime data — including context packs with sensitive content — is accidentally committed to Git, exposing information that should never be persisted.

### Warning signs

- Files appear in `.gptbrain/runtime/` in `git status`.
- A commit includes runtime files.
- A `.gitignore` entry is missing or incorrect.
- Sensitive content appears in Git history.

### Mitigation

- `gptbrain init` creates `.gptbrain/runtime/` with a `.gitignore` inside it.
- The project `.gitignore` excludes `.gptbrain/runtime/`.
- Pre-commit checks warn about runtime files.
- Documentation warns against committing runtime data.

### Contingency

Remove the committed files. Rewrite Git history if sensitive content was exposed. Fix the `.gitignore`.

---

## DM-RISK-022 - Storage index diverges from records

- Likelihood: MEDIUM
- Impact: MEDIUM
- Status: OPEN
- Owner: Development process
- Related decision: DM-DEC-017
- Added: 2026-07-15

### Risk

The memory index (`index.json`) becomes inconsistent with the actual records in the `records/` directory, causing retrieval to miss or return stale data.

### Warning signs

- Index lists a memory that no longer exists.
- A record exists but is not in the index.
- Index metadata (title, status) differs from the record.
- Manual file edits bypass the engine and break consistency.

### Mitigation

- Update the index atomically with every record write.
- Provide an index-rebuild command (`gptbrain repair` or similar).
- Include index-consistency checks in the benchmark harness.
- Test concurrent write scenarios.

### Contingency

Rebuild the index from the records directory. Add regression tests for the inconsistency case.

---

## DM-RISK-023 - CLI is difficult to use

- Likelihood: MEDIUM
- Impact: MEDIUM
- Status: OPEN
- Owner: Development process
- Related decision: DM-DEC-014
- Added: 2026-07-15

### Risk

The CLI is confusing, poorly documented, or has unexpected behavior, discouraging adoption.

### Warning signs

- Help text is unclear or missing.
- Error messages do not explain recovery steps.
- Commands have surprising side effects.
- Users need to read source code to understand commands.
- Common workflows require many steps.

### Mitigation

- Provide clear help text for every command.
- Include error recovery guidance in error messages.
- Test CLI workflows end-to-end.
- Document common workflows in the README and demonstration guide.
- Follow CLI conventions (exit codes, flags, argument ordering).

### Contingency

Improve help text and error messages. Simplify workflows based on user feedback.

---

## DM-RISK-024 - Scope expansion delays the competition release

- Likelihood: HIGH
- Impact: HIGH
- Status: OPEN
- Owner: Project owner and development process
- Related decision: DM-DEC-010, DM-DEC-013
- Added: 2026-07-15

### Risk

The expanded Version 1 scope (engine, CLI, 5 adapters, benchmark, dashboard) cannot be completed before the competition deadline.

### Warning signs

- Phases take longer than estimated.
- New requirements are discovered during implementation.
- Adapter integration reveals unexpected complexity.
- The dashboard requires more work than planned.
- Testing takes longer than expected.

### Mitigation

- Maintain strict phase gates — do not start the next phase until the current one passes.
- Monitor progress against the roadmap.
- Be willing to reduce scope if behind schedule.
- Prioritize core engine and CLI over optional adapters.
- Reserve time for release hardening.

### Contingency

Reduce to minimum viable adapters (generic + one specific). Simplify the dashboard. Skip optional benchmark comparisons. Focus on the core engine's correctness and the demo scenario.

---

## DM-RISK-025 - Development agent accidentally performs destructive work

- Likelihood: LOW
- Impact: HIGH
- Status: OPEN
- Owner: Development process
- Related decision: DM-DEC-024
- Added: 2026-07-15

### Risk

The AI development agent (Antigravity or another) accidentally deletes files, overwrites user changes, installs unapproved dependencies, connects external services, or makes destructive Git operations.

### Warning signs

- `git status` shows unexpected changes.
- Files are missing or overwritten.
- `package.json` appears without approval.
- External services are configured.
- Destructive Git commands are used.

### Mitigation

- `AGENTS.md` rules require git status inspection before edits.
- Rules prohibit destructive Git commands.
- Rules require approval for dependencies and external services.
- `.agents/rules/doubtful-memory.md` enforces preservation of user changes.
- Verification before claiming success.

### Contingency

Restore from the latest commit. Review and correct the agent's behavior. Add stricter rules if needed.

---

## Phase 2 risk review - 2026-07-20

- `DM-RISK-003` remains OPEN. Rule IDs and precedence are now deterministic and tested, but benchmark and user validation are still required.
- `DM-RISK-004` remains OPEN. Pre-persistence secret-like rejection and controlled redaction are tested, but pattern detection is intentionally incomplete.
- `DM-RISK-015` remains OPEN with stronger controls. Optimistic concurrency, archive snapshots, rollback behavior, strict validation, index rebuilds, and audit events now protect controlled mutations; automatic Phase 4 finalization is not implemented.
- `DM-RISK-016` remains OPEN with stronger controls. Phase 2 rejects tested authority escalation paths and requires stored owner evidence, but all future adapters must prove equivalent enforcement.
- `DM-RISK-022` remains OPEN with reduced likelihood for single-process use. Every successful mutation rebuilds the derived index and failed index/audit commits roll back the canonical record. Multi-process locking remains unimplemented.
- `DM-RISK-023` remains OPEN. CLI memory/evidence flows have integration tests and help text, but no independent user-usability test has occurred.
- `DM-RISK-024` remains OPEN. DM-DEC-029 reduces handoff overhead by grouping remaining phases without removing mandatory gates.
- No risk status was silently changed to CONTROLLED or CLOSED based only on the implementing agent's own report.

## Phase 3 risk review - 2026-07-22

- `DM-RISK-003` remains OPEN. Ranking weights and precedence are now explicit, deterministic, and tested, but benchmark and user validation remain required.
- `DM-RISK-004` remains OPEN with stronger controls. Secret-like task input cannot influence retrieval; privacy gates run before ranking; sensitive output is redacted; pattern detection remains intentionally incomplete.
- `DM-RISK-013` remains OPEN with stronger controls. Deterministic lexical/tag retrieval and explanation tests reduce regressions, but Phase 7 precision/recall benchmarks have not run and retrieval is not semantic.
- `DM-RISK-014` remains OPEN with reduced implementation uncertainty. Blocked, revoked, conflicted, expired, secret-like, and irrelevant records have controlled exclusions; `ASK_OWNER` and `RECHECK` are penalized and warned; broader benchmark fixtures remain pending.
- `DM-RISK-020` remains OPEN. The estimator and ranking use local linear processing with zero runtime dependencies, but performance benchmarking is Phase 7 work.
- `DM-RISK-021` remains OPEN with stronger controls. Context generation performs no writes, temporary-project tests confirm no context history, and generated packs remain stdout/in-memory only.
- `DM-RISK-023` remains OPEN. Budget help, validation, JSON, Markdown, and invalid-argument paths are tested, but independent user-usability testing has not occurred.
- No risk status was silently changed to CONTROLLED or CLOSED based only on implementation tests.
## Current risk summary

### Highest-priority open risks

1. DM-RISK-001 - Unverified official challenge requirements (HIGH likelihood, MEDIUM impact).
2. DM-RISK-002 - Product becomes only a documentation template (MEDIUM, HIGH).
3. DM-RISK-003 - Audit rules are arbitrary or inconsistent (MEDIUM, HIGH).
4. DM-RISK-004 - Unsafe handling of sensitive content (MEDIUM, HIGH).
5. DM-RISK-005 - Scope expansion prevents completion (HIGH, HIGH).
6. DM-RISK-009 - UI polish hides weak product behavior (MEDIUM, HIGH).
7. DM-RISK-011 - Documentation and application drift apart (MEDIUM, HIGH).
8. DM-RISK-013 - Retrieval misses critical memory (MEDIUM, HIGH).
9. DM-RISK-014 - Retrieval includes irrelevant or unsafe memory (MEDIUM, HIGH).
10. DM-RISK-015 - Automatic update corrupts canonical memory (LOW, HIGH).
11. DM-RISK-016 - Agent inference escalates authority (MEDIUM, HIGH).
12. DM-RISK-021 - Runtime context leaks into Git (MEDIUM, HIGH).
13. DM-RISK-024 - Scope expansion delays competition release (HIGH, HIGH).
14. DM-RISK-025 - Development agent performs destructive work (LOW, HIGH).

### Medium-priority open risks

1. DM-RISK-006 - Unsupported uniqueness or market claims (MEDIUM, MEDIUM).
2. DM-RISK-008 - Dependency or supply-chain problem (MEDIUM, MEDIUM).
3. DM-RISK-010 - Inaccessible or confusing interface (MEDIUM, MEDIUM).
4. DM-RISK-017 - Adapter behavior drifts between tools (MEDIUM, MEDIUM).
5. DM-RISK-018 - MCP behavior or specification changes (MEDIUM, MEDIUM).
6. DM-RISK-019 - Benchmark comparisons become unfair (LOW, MEDIUM).
7. DM-RISK-020 - Context compiler costs more than it saves (LOW, MEDIUM).
8. DM-RISK-022 - Storage index diverges from records (MEDIUM, MEDIUM).
9. DM-RISK-023 - CLI is difficult to use (MEDIUM, MEDIUM).

### Controlled risks

- DM-RISK-007 - External service or unexpected cost.
- DM-RISK-012 - Local data loss or repository corruption.

### Risk totals

- Total risks: 25
- Open: 23
- Controlled: 2
- Occurred: 0
- Closed: 0

## Review schedule

Review this register:

- At the end of every development phase.
- After protocol approval.
- After audit-engine implementation.
- After adapter implementation.
- After dashboard implementation.
- Before production build.
- Before any external publication.
- Whenever a risk occurs or a major decision changes.

## Phase 4 implementation-candidate risk review - 2026-07-22

- `DM-RISK-004` remains OPEN. Phase 4 rejects secret-like task/finalization input before retrieval or persistence and never stores task text or context statements; pattern-based detection still cannot prove arbitrary content safe.
- `DM-RISK-015` remains OPEN with stronger controls. Automatic finalization now plans all dispositions first, applies only authorized candidates through the canonical mutation boundary, journals recovery state, and makes completed replay idempotent. Filesystem-wide batch atomicity is not claimed.
- `DM-RISK-016` remains OPEN with stronger controls. Owner-policy proposals are held, lower authority is rejected, and generated engine artifacts are not independent evidence; future adapters must still prove they cannot bypass the core.
- `DM-RISK-022` remains OPEN. Per-file atomic writes, mutation rollback, and lifecycle recovery journaling reduce single-process divergence, but multi-process locking and automatic recovery from an interrupted `FINALIZING` state are not implemented.
- `DM-RISK-023` remains OPEN. Lifecycle CLI help and automated tests exist, but no independent user-usability assessment or approval interface exists.
- `DM-RISK-025` remains OPEN. The narrow bootstrap parser rejects ambiguity and preserves source Markdown, but independent verification against the full live ledger is required before checkpointing.
## Phases 5–7 independent owner-verification risk review - 2026-07-23

- `DM-RISK-004` remains OPEN. Privacy gates precede relevance and ranking, MCP errors are controlled, and fixtures use fake secret shapes; pattern detection still cannot prove all arbitrary content safe.
- `DM-RISK-013` remains OPEN. Positive exact lexical/tag eligibility and safety-adjusted benchmark recall are verified, but exact lexical retrieval is not semantic and the 15/17 micro recall includes two deliberate hard-budget false negatives.
- `DM-RISK-014` remains OPEN with stronger controls. Zero relevance is excluded before ranking and budget, validation rejects selected zero relevance, and the benchmark records zero unsafe exposures; future retrieval changes can regress.
- `DM-RISK-017` remains OPEN with stronger controls. Begin and mutating finalization are equivalent across isolated identical clones, including records, indexes, archives, lifecycle states, and normalized safe audit results.
- `DM-RISK-018` remains OPEN. The local MCP subset is pinned to revision `2025-11-25`, tracks duplicate IDs in a bounded 4,096-request rolling window, and intentionally does not claim full optional MCP coverage.
- `DM-RISK-019` remains OPEN with the candidate defects corrected. Fixture labels are independent of engine output; null metrics, safety-adjusted relevance, and all aggregate denominators are explicit. External validity still requires future review before publication.
- `DM-RISK-021` remains OPEN with stronger controls. Complete isolated smokes persist no task, context, held/rejected proposal content, or secret and leave no repository `.gptbrain/` state.
- `DM-RISK-025` remains OPEN. The independent checkpoint used explicit staging and destructive-path checks; no upload, remote, dependency, or Phase 8 work was introduced.
- No risk was silently changed to CONTROLLED or CLOSED based only on this local checkpoint.
