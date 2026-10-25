# Tamhees - Decision Register

## Purpose

This file records important product, architecture, privacy, cost, and scope decisions.

A decision should be added when changing it later could affect the product direction, safety, cost, architecture, or submission.

Decisions must not be silently deleted. If a decision changes, mark the earlier decision as superseded and create a new entry explaining the replacement.

## Decision status values

- `PROPOSED`: Not yet approved.
- `APPROVED`: Active and authoritative.
- `REJECTED`: Considered but not accepted.
- `SUPERSEDED`: Replaced by a newer recorded decision.

---

## DM-DEC-001 - Product direction

- Date: 2026-07-11
- Status: APPROVED
- Category: Product

### Decision

Build Doubtful Memory as a local-first project-memory auditing and safety tool for AI coding agents.

The product will treat remembered information as evidence-backed claims rather than unquestioned truth.

### Reason

Existing agent instruction and memory systems help preserve context, but remembered content may become stale, conflicting, invasive, or overconfident.

The product must address memory reliability and action safety rather than merely create another Markdown memory format.

### Consequences

- The product requires a working audit engine.
- The product cannot be only a documentation template.
- Every important result must be explainable.
- The protocol should complement existing agent conventions.

---

## DM-DEC-002 - Broader purpose beyond the challenge

- Date: 2026-07-11
- Status: APPROVED
- Category: Product

### Decision

Design the product for independent usefulness beyond the Doo challenge.

### Reason

The official challenge brief is unavailable, and the product may also be proposed to developers, teams, AI-tool providers, researchers, or other interested organizations.

### Consequences

- Challenge-specific presentation must not control the entire architecture.
- The application must have a clear use case without the Doo context.
- Claims about market uniqueness must remain accurate and defensible.
- The protocol and audit engine should be reusable.

---

## DM-DEC-003 - Proceed without the official detailed brief

- Date: 2026-07-11
- Status: APPROVED
- Category: Project management

### Decision

Continue local planning and development using the visible challenge title, the available submission message, and the existing project plans.

Do not wait for the organizer's reply.

### Reason

The organizer has not replied, and waiting would prevent progress.

### Consequences

- Official requirements remain marked as unverified assumptions.
- The project must be adaptable if the official brief becomes available.
- Final submission preparation must include another attempt to verify requirements.
- We must not falsely state that our assumed requirements are official.

---

## DM-DEC-004 - Local-first development

- Date: 2026-07-11
- Status: APPROVED
- Category: Architecture

### Decision

All core development, data storage, application behavior, and testing must operate locally on the owner's PC.

### Reason

Local operation improves privacy, cost control, reproducibility, and independence from external services.

### Consequences

- No cloud database is required.
- No login is required for Version 1.
- No internet connection should be required during ordinary use after local dependencies are installed.
- External publishing will be handled as a separate approval stage.

---

## DM-DEC-005 - Zero-budget default

- Date: 2026-07-11
- Status: APPROVED
- Category: Cost

### Decision

The default project budget is zero.

No API, hosted service, subscription, paid asset, paid dependency, payment-card trial, or service that may create fees may be introduced without explicit owner approval.

### Reason

The owner requires complete awareness and control of anything that could produce costs.

### Consequences

- Local and open-source solutions should be preferred.
- Convenience alone is not sufficient reason to add an external service.
- Any future proposal must include pricing, risks, transmitted data, and local alternatives.
- Silence does not count as approval.

---

## DM-DEC-006 - No hosted AI in Version 1

- Date: 2026-07-11
- Status: APPROVED
- Category: Architecture

### Decision

Version 1 will not use an external AI model or hosted AI API.

The audit engine will use deterministic rules.

### Reason

The central safety logic must be inspectable, predictable, testable, private, and usable without API fees or keys.

### Consequences

- Audit outcomes must be produced by documented rules.
- The same input must produce the same result.
- Automated tests must cover critical outcomes.
- AI-assisted interpretation may be considered later only as an optional, separately approved layer.

---

## DM-DEC-007 - Initial application stack

- Date: 2026-07-11
- Status: SUPERSEDED
- Superseded by: DM-DEC-013, DM-DEC-014, DM-DEC-015, DM-DEC-017, DM-DEC-018, DM-DEC-019
- Superseded date: 2026-07-15
- Category: Technology

### Decision

Use Vite, React, TypeScript, local structured data, deterministic TypeScript audit rules, and a static production build as the initial technical direction.

Exact packages and versions must be reviewed before installation.

### Reason

This stack supports a polished interactive demonstration without requiring a backend, database, account system, or hosted runtime.

### Why superseded

The repository audit (2026-07-15) established that Version 1 is a local developer tool with a CLI and engine, not a web-demo-first application. The initial Vite/React stack assumed a web application as the primary form factor. The corrected direction builds the engine and CLI first, with the visual dashboard as a later component within the same Version 1 release. Individual technology choices (TypeScript, Node.js version, storage format, dependency policy) are now recorded in separate focused decisions.

### Consequences

- See DM-DEC-013 through DM-DEC-019 for replacement decisions.

---

## DM-DEC-008 - Five primary audit outcomes

- Date: 2026-07-11
- Status: APPROVED
- Category: Protocol

### Decision

The initial protocol will support these outcomes:

- `TRUST`
- `RECHECK`
- `ASK_OWNER`
- `BLOCK_ACTION`
- `FORGET_OR_REDACT`

### Reason

These outcomes distinguish between reliable memory, uncertain memory, human-dependent decisions, prohibited actions, and invasive retention.

### Consequences

- Each outcome requires a precise definition.
- Outcome priority must be documented.
- Conflicting rule results must resolve deterministically.
- Every result must provide evidence and a recommended next step.

---

## DM-DEC-009 - Privacy and secret handling

- Date: 2026-07-11
- Status: APPROVED
- Category: Security

### Decision

The application and repository must never intentionally retain real credentials or unnecessary sensitive information.

Demonstrations must use obviously fake data.

### Reason

A product addressing invasive AI memory must demonstrate safe behavior rather than only describe it.

### Consequences

- Secret-like inputs should produce `FORGET_OR_REDACT` when appropriate.
- Raw detected secrets must not appear in persistent audit history.
- Tests must use fake values.
- Documentation must explain limitations and avoid claiming perfect secret detection.

---

## DM-DEC-010 - Version 1 scope discipline

- Date: 2026-07-11
- Status: APPROVED
- Category: Scope

### Decision

Version 1 will be a focused, polished proof of concept with a real protocol, deterministic audit engine, interactive scenarios, tests, and documentation.

It will not become a large agent platform.

### Reason

A smaller product that works completely is more credible than a broad platform containing incomplete or simulated features.

### Consequences

Version 1 excludes:

- User accounts.
- Cloud synchronization.
- Autonomous repository modification.
- IDE extensions.
- Browser extensions.
- Enterprise administration.
- Hosted AI.
- Real credential storage.
- Background monitoring.
- Unrelated dashboard features.

---

## DM-DEC-011 - Human approval boundaries

- Date: 2026-07-11
- Status: APPROVED
- Category: Safety

### Decision

The protocol must require human confirmation when evidence conflicts, authority is unclear, a significant action depends on inference, sensitive retention is proposed, or permission to act is insufficient.

### Reason

Recognizing uncertainty is not useful unless it changes what the agent is allowed to do.

### Consequences

- Confidence alone cannot authorize action.
- Conflicted claims cannot produce `TRUST`.
- Low-confidence inferred preferences cannot authorize significant changes.
- The interface must make blocked and approval-dependent actions visible.

---

## DM-DEC-012 - Private repository state during development

- Date: 2026-07-11
- Status: APPROVED
- Category: Repository

### Decision

Keep the Git repository local with no remote during development.

### Reason

The owner does not want the unfinished project publicly visible.

### Consequences

- Do not connect GitHub or another Git host.
- Do not upload source files.
- Local commits are allowed and required for safe checkpoints.
- Publication requires a separate explanation and explicit approval.

---

## DM-DEC-013 - Complete Version 1 product form

- Date: 2026-07-15
- Status: APPROVED
- Category: Product
- Supersedes: DM-DEC-007 (partially)

### Context

The repository audit (2026-07-15) established the complete Version 1 product form, replacing the earlier web-demo-first approach.

### Decision

Version 1 is a local developer tool containing: tool-neutral memory engine, gptbrain CLI, structured local memory storage, deterministic audit and authority engine, task-specific context compiler with explicit budgets, automatic pre-task retrieval, controlled post-task memory finalization, Codex adapter, Claude Code adapter, Antigravity adapter, generic adapter, local stdio MCP adapter, deterministic benchmark harness, and local visual dashboard.

### Reasons

- The product must work as a real developer tool, not just a demonstration website.
- A CLI and engine enable integration with multiple AI coding agents.
- The benchmark harness demonstrates measurable value.
- The dashboard provides visual access to memory state for human users.

### Consequences

- Engine and CLI are implemented before adapters.
- Adapters are implemented before the dashboard.
- All components are part of the Version 1 release.
- The dashboard is not described as post-Version-1.

### Alternatives considered

- Web-demo-first: Rejected because it prioritizes presentation over tool functionality.
- Engine-only without dashboard: Rejected because the dashboard is needed for the competition-ready release.

---

## DM-DEC-014 - Product name and gptbrain engine/CLI identity

- Date: 2026-07-15
- Status: SUPERSEDED
- Superseded by: DM-DEC-026
- Category: Product

### Context

The product name and command identity needed explicit recording to prevent confusion.

### Decision

- Product name: Doubtful Memory.
- Engine and CLI command: `gptbrain`.
- Canonical local project directory: `.gptbrain/`.
- Do not use `dm` as the CLI name.
- Do not use `.dm/` as the storage directory.

### Reasons

- `gptbrain` preserves the connection to the original GPTBrain.md origin.
- A single canonical name prevents confusion across documentation and code.
- `.gptbrain/` follows the convention of tool-specific dot-directories.

### Why superseded

Doubtful Memory remains the product name, but `gptbrain` and `.gptbrain` are now temporary centralized codenames rather than permanent final identities.

### Consequences

- All CLI documentation and implementation must use `gptbrain`.
- All storage references must use `.gptbrain/`.
- The product name remains "Doubtful Memory" in user-facing materials.

### Alternatives considered

- `dm` CLI name: Rejected to avoid ambiguity and maintain GPTBrain lineage.
- `.dm/` directory: Rejected for the same reason.

---

## DM-DEC-015 - CLI and engine before dashboard

- Date: 2026-07-15
- Status: APPROVED
- Category: Architecture

### Context

The implementation order needed explicit definition to prevent UI work from proceeding before the engine is verified.

### Decision

Implement the engine and CLI first, adapters and benchmarks next, visual dashboard afterward.

### Reasons

- The engine contains the core business logic and authority rules.
- Adapters depend on a working engine.
- The dashboard depends on engine data.
- Building the engine first ensures the product is a real tool, not a demonstration shell.

### Consequences

- No dashboard implementation until the core engine passes its release gates.
- Dashboard dependencies are deferred.
- Early phases can be tested entirely through the CLI.

### Alternatives considered

- Dashboard-first: Rejected because it risks building a visual shell without real functionality.
- Parallel development: Rejected because it risks UI/engine inconsistency and premature dependency installation.

---

## DM-DEC-016 - Dashboard remains a Version 1 deliverable

- Date: 2026-07-15
- Status: APPROVED
- Category: Scope

### Context

The implementation order (engine-first) could be misinterpreted as deferring the dashboard beyond Version 1.

### Decision

The local visual dashboard remains part of the final competition-ready Version 1 release. It is implemented later in the development sequence but is not a post-Version-1 feature.

### Reasons

- The dashboard provides visual access for human users and judges.
- A CLI-only product is less accessible for demonstration.
- The competition submission benefits from visual presentation.

### Consequences

- Dashboard work is planned in Phase 8 of the roadmap.
- Dashboard dependencies will be approved when Phase 8 begins.
- Dashboard scope is constrained to memory viewing and audit exploration.

### Alternatives considered

- Post-Version-1 dashboard: Rejected because the competition release needs visual presentation.

---

## DM-DEC-017 - .gptbrain/ JSON and JSONL storage

- Date: 2026-07-15
- Status: APPROVED
- Category: Architecture
- Supersedes: DM-DEC-007 (storage aspect)

### Context

Version 1 needs inspectable, local, Git-compatible storage.

### Decision

Use `.gptbrain/` directory with:
- One atomic JSON record per canonical memory.
- JSONL for append-only safe audit events.
- Atomic writes through temporary-file plus rename.
- Deterministic ordering where serialized output is tracked.
- Schema version on every controlled artifact.
- No database in Version 1 core.
- No permanent caching of generated context packs.
- Generated context returned in memory/stdout or stored temporarily under ignored runtime storage.
- Runtime-generated sensitive context must never be committed.
- Audit rules in source code with stable IDs, not in easily modified project configuration.

### Reasons

- JSON files are inspectable, diffable, and Git-friendly.
- JSONL safely supports append-only audit logs.
- Atomic writes prevent corruption.
- Deterministic ordering produces clean Git diffs.
- No database simplifies installation and reduces dependencies.

### Consequences

- The memory index must be maintained consistently with records.
- Schema versioning enables future migration.
- The `runtime/` directory must be Git-ignored.
- No SQLite, LevelDB, or other database engines in Version 1.

### Alternatives considered

- SQLite: Rejected for Version 1 to maintain zero-dependency target and Git compatibility.
- Single large JSON file: Rejected because it recreates the large-file problem.
- YAML: Rejected because JSON has better tooling and parsing support in Node.js.

---

## DM-DEC-018 - Node 22 minimum and Node 24 development

- Date: 2026-07-15
- Status: APPROVED
- Category: Technology
- Supersedes: DM-DEC-007 (runtime aspect)

### Context

The project needs a specific Node.js version policy.

### Decision

- Minimum supported Node.js version: Node 22.
- Current development environment: Node 24.
- Do not recommend Node 20.

### Reasons

- Node 20 and earlier are end-of-life or approaching end-of-life.
- Unsupported runtimes do not receive security patches.
- Node 22+ provides modern APIs (built-in test runner, improved `util.parseArgs`) that reduce dependency needs.
- Node 24 is the current release available in the development environment.

### Consequences

- `package.json` engines field will specify `>=22`.
- CI (if added) must test on Node 22 and Node 24.
- Node 20 compatibility issues are not bugs.

### Alternatives considered

- Node 20 minimum: Rejected because it is approaching end-of-life and lacks some APIs.
- Node 18: Rejected because it is already end-of-life.

---

## DM-DEC-019 - Initial zero-runtime-dependency target

- Date: 2026-07-15
- Status: APPROVED
- Category: Technology
- Supersedes: DM-DEC-007 (dependency aspect)

### Context

The initial core must minimize external dependencies.

### Decision

Target zero runtime dependencies where reasonable. Use Node.js built-ins for CLI argument processing, filesystem traversal, atomic filesystem operations, path handling, hashing, test execution, and basic terminal output.

Proposed initial development dependencies (not yet installed): `typescript`, `@types/node`.

Do not approve commander, chalk, fast-glob, gray-matter, tsx, Vitest, ESLint, Prettier, AJV, React, Vite, or the MCP SDK yet. They may be reconsidered later only if a verified requirement cannot reasonably be met with the platform or existing approved dependencies.

### Reasons

- Fewer dependencies reduce supply-chain risk.
- Node.js built-ins cover the core needs.
- Build-time-only TypeScript has no runtime cost.
- The approach maximizes portability and reduces install time.

### Consequences

- CLI parsing uses `util.parseArgs` or `process.argv`.
- Testing uses `node --test`.
- No runtime `node_modules` in production.
- Some convenience features require more code than a library would.

### Alternatives considered

- commander + chalk: Rejected for initial core; may be reconsidered if CLI complexity warrants it.
- Vitest: Rejected; Node built-in test runner is sufficient.
- AJV: Rejected; schema validation can be implemented with TypeScript types and manual checks.

---

## DM-DEC-020 - Automatic-update authority restrictions

- Date: 2026-07-15
- Status: APPROVED
- Category: Safety

### Context

Automatic memory maintenance must not enable uncontrolled rewriting.

### Decision

The lifecycle must distinguish owner-confirmed decisions, repository-verified observations, test-verified observations, agent observations, agent inferences, unknown information, conflicted information, and revoked information.

Mandatory rules:
- An AI inference can never become OWNER_CONFIRMED automatically.
- Agent-generated memories default to INFERRED or OBSERVED according to evidence.
- Material automatic updates must be validated and auditable.
- Replacements must preserve the superseded record and relationship.
- Destructive forgetting/redaction must preserve safe audit metadata.
- The MCP update capability must enforce the same authority rules as the CLI.
- The system must never treat its own generated summary as independent supporting evidence.

### Reasons

- Uncontrolled automatic updates would undermine the entire authority model.
- Owner decisions about scope, budget, and privacy must remain owner-controlled.
- Auditability requires preserving the chain of evidence.

### Consequences

- The update pipeline must validate authority before writing.
- Superseded records are archived, not deleted.
- Audit events record every material change.
- No shortcut path exists to bypass authority checks.

### Alternatives considered

- Unrestricted automatic updates: Rejected because it defeats the purpose of the authority model.
- No automatic updates: Rejected because manual maintenance after every task is impractical.

---

## DM-DEC-021 - Ephemeral context packs by default

- Date: 2026-07-15
- Status: APPROVED
- Category: Privacy

### Context

Context packs contain selected, ranked, and potentially sensitive memory content assembled for a specific task.

### Decision

Generated context packs are ephemeral by default. They are not permanently cached. They are returned in memory/stdout or stored temporarily under Git-ignored runtime storage only when necessary. Runtime-generated sensitive context must never be committed.

### Reasons

- Permanent caching creates stale context that contradicts the freshness model.
- Cached context packs could contain sensitive material that should not persist.
- Ephemeral packs force fresh retrieval and auditing on each task.

### Consequences

- Context packs do not accumulate in `.gptbrain/`.
- The `runtime/` directory is Git-ignored.
- Agents receive fresh context for each task.
- There is no "context history" to manage or clean up.

### Alternatives considered

- Persistent context cache: Rejected because it undermines freshness and creates privacy risk.
- Optional caching: May be reconsidered if performance requires it, with mandatory expiry and redaction.

---

## DM-DEC-022 - Deterministic benchmark methodology

- Date: 2026-07-15
- Status: APPROVED
- Category: Quality

### Context

The benchmark must demonstrate measurable value without relying on a hosted model or subjective claims.

### Decision

The core benchmark uses deterministic fixtures to measure: retrieved-memory precision, retrieved-memory recall, context size and estimated token size, budget compliance, stale-memory detection, conflict detection, revocation handling, authority protection, sensitive-content retention, deterministic outcome correctness, abstention or escalation when evidence is insufficient, and cross-adapter context equivalence.

Comparisons across: no project memory, original single GPTBrain.md, simple split-file memory, Doubtful Memory selective and audited context.

Optional human or model-assisted evaluation may be documented separately but cannot be required for the core benchmark.

### Reasons

- Deterministic fixtures produce repeatable, verifiable results.
- No hosted model dependency keeps the benchmark free and local.
- Objective measurements are more credible than subjective quality claims.
- Cross-adapter equivalence testing validates the canonical-source-of-truth architecture.

### Consequences

- Benchmark fixtures must be created and maintained.
- All measurements must be deterministic across runs.
- The benchmark can run offline.
- Subjective quality evaluation is optional, not required.

### Alternatives considered

- Model-based evaluation: Rejected as core requirement; may be supplementary.
- No benchmark: Rejected because measurable evidence of value is needed.

---

## DM-DEC-023 - Thin cross-agent adapters with canonical source of truth

- Date: 2026-07-15
- Status: APPROVED
- Category: Architecture

### Context

The product must work with multiple AI coding agents without each adapter maintaining separate memory.

### Decision

Each adapter is a thin translation layer between a specific AI coding agent and the gptbrain engine. No adapter maintains its own memory store. All adapters read from and write to the same canonical `.gptbrain/` storage through the engine. The same memory query through different adapters must produce equivalent results.

### Reasons

- A single source of truth prevents memory divergence between tools.
- Thin adapters are easier to maintain and test.
- Cross-adapter equivalence is testable.
- Business logic stays in the engine, not scattered across adapters.

### Consequences

- Adapter code is minimal translation logic.
- All authority, privacy, and audit rules are enforced by the engine.
- Adding a new adapter does not require duplicating business logic.
- Cross-adapter equivalence is a testable requirement.

### Alternatives considered

- Per-adapter memory stores: Rejected because it creates divergence and duplication.
- No adapters (CLI only): Rejected because the product must integrate with multiple agents.

---

## DM-DEC-024 - Antigravity as approved development agent

- Date: 2026-07-15
- Status: APPROVED
- Category: Development

### Context

The development agent used to build Doubtful Memory must be distinguished from the product's runtime dependencies.

### Decision

Antigravity IDE with Claude Opus 4.6 Thinking is the currently approved development agent. It is not a product runtime dependency. The Antigravity adapter (when built) enables Doubtful Memory to serve context to Antigravity, not the reverse.

### Reasons

- The development tool and the product being developed are separate concerns.
- Users of Doubtful Memory do not need Antigravity.
- The Antigravity adapter serves Doubtful Memory's context to Antigravity, not the other way around.

### Consequences

- No Antigravity-specific code in the core engine.
- The Antigravity adapter follows the same thin-adapter pattern as other adapters.
- Development-agent-specific configuration is not part of the product.

### Alternatives considered

- Antigravity as runtime dependency: Rejected; it is a development tool only.

---

## DM-DEC-025 - Canonical Phase 1 Memory Schema

- Date: 2026-07-19
- Status: APPROVED
- Category: Protocol

### Context

The Phase 1 memory core is now implemented. The protocol specification needed to reflect the actual running code's canonical field names to prevent confusion between the specification and the types.

### Decision

Adopt the explicit Phase 1 implementation field names in the protocol specification:
- `claim` is renamed to `statement`.
- `status` is renamed to `verificationStatus`.
- `permission` is renamed to `actionPermission`.
- Added `kind` (e.g., OBSERVATION, REQUIREMENT).
- Retained `recheckMethod` and `notes` as optional string fields.

Clearly distinguish between fields implemented in Phase 1 (e.g., deterministic lexical selection) and fields planned for later phases (e.g., token budgets, evidence mapping).

### Reasons

- Divergence between the specification and the implemented TypeScript interfaces (`MemoryRecord`, `ContextPack`, `AuditEvent`) creates developer confusion.
- The implemented names (`verificationStatus`, `actionPermission`) are more precise than the originally proposed single-word names.
- Documenting future fields clarifies that their absence in Phase 1 is intentional, not an oversight.

### Consequences

- All future code and documentation must use the new field names.
- The `PROTOCOL_SPECIFICATION.md` now matches `src/core/types.ts`.

---

## DM-DEC-026 - Temporary codename centralization

- Date: 2026-07-19
- Status: SUPERSEDED by DM-DEC-035
- Category: Product

### Context

The product remains "Doubtful Memory", but the CLI, engine, and storage directory needed a consistent temporary identifier until a final name is chosen.

### Decision

Use `gptbrain` for the CLI and engine, and `.gptbrain/` for the storage directory as temporary centralized codenames. Centralize their definitions in `src/core/identity.ts`. The CLI/storage rename will be a later controlled change. Doubtful Memory remains the product name. Runtime source must use centralized identity constants where technically possible.

### Reasons

- Hardcoding names across multiple files makes future renaming risky and difficult.
- Centralization allows development to proceed without committing permanently to a CLI name.

### Consequences

- All source code must use the constants from `identity.ts` rather than hardcoded strings.

---

## DM-DEC-027 - Phase 1 approved dependencies

- Date: 2026-07-19
- Status: APPROVED
- Category: Technology

### Context

Phase 1 requires explicit owner approval for any dependencies.

### Decision

The exact approved development dependencies for Phase 1 are:
- `typescript@6.0.3` — Apache-2.0
- `@types/node@22.20.1` — MIT
- `undici-types@6.21.0` — MIT, transitive development-only type package

There are zero runtime dependencies. The core engine and CLI use Node built-ins only.
There is no paid service, account, API key, hosted runtime, or runtime network requirement. Both direct dependencies have an approved development purpose.

### Reasons

- This maintains the zero-runtime-dependency target.
- These dependencies are strictly for build-time type checking and compilation.

### Consequences

- No other dependencies may be added without explicit owner approval.

---

## DM-DEC-028 - Phase 2 controlled mutation and evidence interface

- Date: 2026-07-20
- Status: APPROVED
- Category: Architecture and protocol

### Context

Phase 2 required usable create, update, revoke, redact, and evidence operations without allowing agents to bypass authority, privacy, archive, index, or audit invariants.

### Decision

- Use one canonical `UpdateCandidate` contract for `CREATE`, `UPDATE`, `REVOKE`, and `REDACT`.
- Expose controlled mutations through `gptbrain memory apply --input <candidate.json>`.
- Expose evidence through `gptbrain evidence add|list` and memory inspection through `gptbrain memory list|show`.
- Require optimistic concurrency for updates by matching the canonical `updatedAt` value.
- Prevent lower-authority candidates from overwriting higher-authority canonical records and require status/source alignment.
- Require stored supporting `OWNER_INSTRUCTION` evidence before promotion to, or mutation of, `OWNER_CONFIRMED` memory.
- Allow `REDACT` to bypass ordinary authority ordering because privacy removal has highest precedence, while still validating the candidate and writing safe audit metadata.
- Preserve pre-update and pre-revoke snapshots in archive.
- Never copy raw content removed by `REDACT` into archive or audit history.
- Rebuild the derived index and append a privacy-safe audit event before reporting mutation success.

### Reasons

- A single update contract gives the CLI and future adapters the same policy boundary.
- Optimistic concurrency prevents silent lost updates.
- Stored owner evidence is stronger than trusting an agent's self-declared authority level.
- Archive and audit behavior make material changes explainable and recoverable without retaining prohibited redacted content.

### Consequences

- Future adapters must call this engine boundary rather than edit JSON directly.
- Owner-confirmed promotion is deliberately a two-step evidence workflow.
- Multi-process file locking remains future hardening; Phase 2 guarantees atomic single-process batches and detects malformed state.

---

## DM-DEC-029 - Accelerated milestone delivery without removing Version 1 gates

- Date: 2026-07-20
- Status: APPROVED
- Category: Delivery

### Context

The owner needs to finish the competition project quickly while avoiding a sloppy release. Repeated tiny agent prompts and ZIP review cycles consumed more time than implementation.

### Decision

Keep all mandatory Version 1 requirements and stop-gate evidence, but group the remaining roadmap into larger delivery milestones:

1. Phases 3–4: budgeted retrieval, ranking, and automatic lifecycle.
2. Phases 5–7: adapters and deterministic benchmark.
3. Phases 8–9: dashboard, hardening, documentation, and submission package.

Run independent review and full documentation reconciliation once per grouped milestone instead of after every small edit.

### Reasons

- Larger vertical milestones reduce context loss and handoff overhead.
- Keeping the original acceptance criteria prevents speed from becoming hidden quality reduction.
- A tested engine-first sequence protects the central product value before visual polish.

### Consequences

- The numbered phases remain traceable in the roadmap.
- No mandatory feature is removed by this decision.
- Any future proposal to defer MCP, an adapter, benchmark coverage, or dashboard scope still requires a separate explicit owner decision.

---

## DM-DEC-030 - Deterministic Phase 3 ranking and bounded payload contract

- Date: 2026-07-22
- Status: APPROVED
- Category: Architecture and protocol

### Context

Phase 3 requires useful retrieval, complete safety explanations, and a hard context limit without embeddings, external services, random behavior, locale-dependent ordering, or a tokenizer dependency. Bounding the entire diagnostic document would make safety explanations compete with agent-consumable memory content.

### Decision

- Use deterministic lexical/tag retrieval; do not claim semantic retrieval.
- Apply privacy, revocation, conflict, expiration, permission, and audit-safety gates before ranking.
- Rank eligible memories with an additive score: relevance (20 per unique normalized matched tag plus 10 per unique normalized matched task word found in the statement), authority (`OWNER_CONFIRMED=50`, `REPO_VERIFIED=40`, `TEST_VERIFIED=35`, `OBSERVED=25`, `INFERRED=10`, otherwise 0), freshness (20/15/10/5/0 by age bands, with a 10-point due/conditional penalty), and safety (`TRUST=30`, `ASK_OWNER=10`, `RECHECK=0`).
- Sort by descending total score and use ordinal memory ID as the final tie-breaker.
- Permit `ASK_OWNER` and `RECHECK` only with explicit warnings and ranking penalties; never let confidence override a safety gate.
- Define the hard budget scope as `selected-memory-agent-payload`: memory ID, redacted statement, audit outcome, verification status, confidence, and output-safe tags.
- Keep diagnostics, exclusions, warnings, ranking details, and budget metadata outside that hard payload budget.
- Estimate each canonical contribution with `utf8-bytes-ceil-div-4` version `1.0.0`: `max(1, ceil(UTF8 byte length / 4))`. This is an estimate, not an exact vendor tokenizer.
- Accept budgets from 1 through 1,000,000 estimated tokens and default to 2,048.
- Select the highest-ranked prefix of complete contributions. Never truncate statements. If the first contribution does not fit, return a valid explained empty pack.
- Validate generated context packs strictly before CLI output.

### Reasons

- The additive formula is inspectable, deterministic, dependency-free, and testable.
- Ordinal ID comparison is stable across locales and machines.
- Separating bounded agent payload from diagnostics preserves both a hard capacity guarantee and complete safety explanations.
- A valid empty pack fails safely when the configured capacity cannot represent one complete memory unit.

### Consequences

- Ranking weights and estimator behavior are protocol commitments and require a new decision to change materially.
- Token estimates may differ from any particular model tokenizer and must be labeled accordingly.
- Phase 3 context generation remains ephemeral and storage-schema compatible with Phase 2.
- Automatic pre-task invocation and post-task finalization remain Phase 4 work.

---

## DM-DEC-031 - Durable lifecycle journal and independent proposal application

- Date: 2026-07-22
- Status: APPROVED
- Category: Architecture, safety, and protocol

### Context

Phase 4 must automate retrieval and routine memory maintenance without persisting task context, weakening authority, or claiming filesystem-wide transactions that the local JSON store does not provide.

### Decision

- Store only privacy-safe lifecycle correlation metadata under `.gptbrain/episodes/`; never store task text, selected statements, evidence content, or generated context packs.
- Use the explicit state machine `OPEN -> FINALIZING -> COMPLETED | COMPLETED_WITH_HELD_ITEMS`, with `FAILED` reserved for controlled recovery.
- Validate the whole request and classify every structurally valid proposal before mutation.
- Apply authorized proposals independently in deterministic input order through the existing Phase 2 mutation boundary. `HELD_FOR_OWNER`, `REJECTED`, and `NO_CHANGE` proposals never mutate canonical memory.
- Write a recovery journal before the first mutation and after every attempted mutation. An interrupted `FINALIZING` lifecycle cannot replay automatically; controlled inspection is required.
- Treat an identical completed finalization as idempotent and reject different content as `ALREADY_FINALIZED`.
- Require stored, independent evidence for automatic verified-state proposals; engine-generated context, summaries, lifecycle results, and audit output are not independent evidence.
- Implement the live `DM-REQ-LIFE-002` migration in Phase 4 as a narrow, one-time, explicit-vocabulary import that preserves the Markdown source.

### Consequences

- Phase 4 does not claim multi-file filesystem atomicity or multi-process locking.
- A crash after a canonical mutation but before its journal update fails closed for manual recovery rather than risking duplicate application.
- Owner confirmation is a held disposition and future interface concern; there is no weak approval shortcut or interactive prompt.
- The storage schema remains `1.0.0`; engine and package version become `0.4.0`.

---

## DM-DEC-032 - Dependency-free local adapter, MCP, and benchmark boundary

- Date: 2026-07-22
- Status: APPROVED
- Category: Architecture, dependency, protocol, privacy, and verification

### Context

Accelerated Phases 5-7 require five equivalent agent adapters, a local stdio MCP surface, and an objective deterministic benchmark. The owner explicitly reviewed the previously deferred MCP SDK question and directed the implementation to retain zero runtime dependencies.

### Decision

- Use one shared adapter registry with the exact identifiers `codex`, `antigravity`, `claude`, `generic`, and `mcp`; adapters translate only and delegate all memory behavior to the canonical engine.
- Install only project-local managed instruction blocks at the documented targets. Preserve bytes outside the marked block, fail closed on corrupt markers or unsafe paths, and make install/removal atomic, idempotent, and dry-run capable.
- Implement the local stdio MCP adapter with Node.js built-ins rather than `@modelcontextprotocol/sdk`.
- Pin the implemented MCP protocol revision to `2025-11-25`, JSON-RPC 2.0, and one UTF-8 JSON object per line. Support only local stdio; do not add HTTP, remote configuration, telemetry, or global installation.
- Keep the four required MCP tools thin and route task lifecycle operations through the shared `mcp` adapter.
- Compare `NO_MEMORY`, `MONOLITHIC_GPTBRAIN`, `SIMPLE_SPLIT_FILES`, and `DOUBTFUL_MEMORY` on the same deterministic fixture catalogue. Represent undefined precision/recall as `null` and exclude those values transparently from aggregate means.
- Advance the package and engine version to `0.7.0` while retaining storage schema `1.0.0`, zero runtime dependencies, and the temporary `gptbrain` codename.

### Consequences

- The SDK dependency is rejected for this implementation, not merely deferred. A future SDK addition requires a new owner-approved decision and dependency review.
- MCP-specific behavior is isolated and conformance-tested, but future protocol revisions remain an explicit compatibility risk.
- Benchmark output is reproducible and includes results that expose limitations; it is evidence, not a subjective claim of superiority.
- Phase 8 dashboard work remains outside this milestone.

---

## DM-DEC-033 - Positive lexical eligibility and auditable benchmark metrics

- Date: 2026-07-23
- Status: APPROVED
- Category: Retrieval, safety, validation, and verification

### Context

Independent owner verification found that the Phase 3 matcher used undocumented substring containment and context validation did not reject a selected entry declaring zero relevance. It also found that the Phase 7 candidate generated its fixture from implementation code, mislabeled six safety/privacy abstentions, combined prevention with detection, and credited no-memory behavior with policy classifications it did not perform.

### Decision

- Require every selected task-specific memory to have positive relevance from at least one exact Unicode-NFKC-normalized, case-folded, non-common task-term or tag match.
- Exclude zero-relevance records as `irrelevant` before ranking and budgeting. Authority, freshness, and safety rank only relevance-eligible records; no total-score threshold or undocumented mandatory-memory mechanism is introduced.
- Ignore one controlled set of common English task terms and reject substring-only matches. Duplicate normalized tags and terms count once.
- Make runtime context validation reject a selected entry with zero declared relevance.
- Treat `benchmark/fixtures/scenarios.json` as fixture-authored ground truth that generation never rewrites. Keep unsafe task relevance explicit while using separately labeled safety-adjusted relevance for precision and recall.
- Report TP, FP, FN, selected count, relevant count, micro and macro precision/recall, and explicit numerators and denominators. Undefined metrics are `null` and excluded from applicable means.
- Separate violation prevention, problem detection, unsafe exposure, secret leakage, escalation, abstention, budget compliance, and exact outcome. A configuration without a classifier receives `null` detection/escalation, not invented success.

### Consequences

- Exact lexical matching remains deterministic and intentionally is not semantic retrieval.
- The ranking weights and hard-budget estimator are unchanged; only task-relevance eligibility and documented term matching are corrected.
- Benchmark Version 2.0.0 artifacts replace the flawed candidate artifacts while the historical candidate audit remains unchanged as evidence of what was reported before correction.
- Phase 8 remains outside this checkpoint.

---
## DM-DEC-034 - Dependency-free loopback dashboard boundary

- Date: 2026-07-24
- Status: APPROVED
- Category: Architecture, dependency, privacy, security, and user interface

### Decision

Version 0.8.0 uses a Node built-in HTTP server bound exactly to `127.0.0.1`, local HTML/CSS/browser JavaScript, safe fixed fixtures, canonical audit/context functions, and the SHA-256-checked committed Version 0.7.0 benchmark. It adds no dependency, external resource, hosted backend, account, telemetry, database, model, upload, or deployment. APIs are narrow and read-only; strict methods, routes, schemas, origins, body limits, traversal refusal, privacy-safe errors, and restrictive security headers are mandatory. No dashboard execution may mutate source storage or persist a context pack.

### Consequences

The prior static-only note is superseded only by this local loopback interface; external networking remains prohibited. Package and engine advance to `0.8.0`; storage remains `1.0.0`; `gptbrain` remains temporary. Independent visual, keyboard, responsive, and security review is still required. Phase 9 remains out of scope.

---
## Pending decisions

The following matters are intentionally not decided yet:

- Final visual identity.
- Exact package versions (beyond typescript and @types/node).
- Any future dashboard framework or third-party package; Phase 8 adds none under DM-DEC-034.
- Import and export behavior.
- Whether users may create custom scenarios in Version 1.
- Final hosting platform.
- Final source-code visibility.
- Video-recording platform.
- Final submission wording.
---

## DM-DEC-035 - Approved Tamhees identity and controlled legacy-storage transition

- Date: 2026-07-25
- Status: APPROVED
- Category: Product identity, compatibility, protocol, and release boundary
- Supersedes: DM-DEC-014 and DM-DEC-026; supersedes only the `.gptbrain/` directory-name portion of DM-DEC-017

### Context

The owner approved the final pre-release product identity and directed a comprehensive active rename while preserving accurate historical decision, claim, and audit evidence. A direct directory rename without a controlled compatibility path could silently split or lose an existing user's memory.

### Decision

- The product name is **Tamhees**; the restrained Arabic detail is **تمحيص**; the tagline is **Memory under scrutiny.**
- The accessible opening explanation is: “Tamhees checks what an AI remembers before that memory is allowed to guide an action.”
- The package and only supported executable identity is `tamhees`; the canonical local storage directory is `.tamhees/`.
- The four local stdio MCP tools are exactly `tamhees_initialize_project`, `tamhees_begin_task`, `tamhees_finalize_task`, and `tamhees_status`. The old CLI and MCP namespace are not active aliases; this is a documented pre-release breaking change.
- Runtime identity, managed markers, adapter paths, and tool names are centralized in `src/core/identity.ts` where technically possible. The Antigravity rule is `.agents/rules/tamhees.md`.
- Stable `DM-*` identifiers remain unchanged for traceability. Accurate older names remain only in historical records, the original GPTBrain.md baseline/origin story, and explicit legacy-compatibility documentation.
- `tamhees migrate legacy-storage [--dry-run]` is the only supported `.gptbrain/` to `.tamhees/` directory transition. It accepts no caller-selected paths, validates the controlled store and path boundary, rejects links/reparse points and conflicts, never merges or overwrites, supports a byte-pure dry run, uses one same-parent rename where permitted, validates afterward, and preserves or restores the legacy store on failure.
- A containing-directory rename does not change the canonical storage schema, which remains `1.0.0`.
- Package and engine advance to Version `0.8.2`. Phase 8.2 remains an unstaged implementation candidate pending independent owner review. Phase 9, checkpointing, remote configuration, publication, upload, and deployment remain separately authorized actions.

### Consequences

- Active documentation, code, tests, generated instructions, UI, examples, and package metadata must use Tamhees identities.
- Existing users receive an explicit inspectable migration rather than silent dual stores or automatic merge behavior.
- Historical ledgers are not rewritten to pretend the earlier identity never existed.
- Naming approval is a product decision, not trademark clearance, uniqueness research, or publication approval.

## DM-DEC-036 — Applicability and controlled evidence bundles

- Date: 2026-09-20
- Status: IMPLEMENTED CANDIDATE under the owner's explicit engineering request;
  independent review pending, not release approval.
- Scope: required canonical PROJECT or conjunctive RESTRICTED environment/component/
  path scope; missing schema-1.0 scope defaults on read; UPDATE omission preserves
  target scope. Scope filters before ranking and never supplies authority.
- Lifecycle: optional proposedEvidence, complete preflight through existing mutation
  checks, evidence-before-memory journal ordering, no new runtime dependencies.
- Supersedes DM-DEC-031's independent application for invalid mixed proposals:
  preflight-invalid bundles now apply nothing. Holds remain reviewable without
  retaining proposed evidence. Runtime failure still requires manual recovery.
- MCP retains four tools; CLI tolerates exactly one initial BOM.
- Package/engine/schema versions are retained; older binaries cannot read new
  scoped records. Local caller trust and single-writer limitations remain explicit.

## DM-DEC-037 — Challenge submission: publication and static hosted demo

- Date: 2026-10-25
- Status: PREPARED, NOT APPROVED. Publication was declined for now (2026-10-25). Nothing is
  pushed or deployed until the owner approves. The DOO "Memory That Knows It Might Be Wrong"
  submission (deadline 2026-11-15) requires a public repository and a live demo URL.
- Publication (when approved): the source would be pushed to a public GitHub repository. The package stays
  `UNLICENSED` (all rights reserved) unless the owner records a separate license decision.
- Hosted demo: `scripts/build-static-site.mjs` builds a static site from the unchanged
  dashboard page and the compiled engine modules reachable from
  `src/dashboard/scenarios.ts`. `web/hosted-api.js` answers the dashboard's three
  `/api/*` requests in the visitor's browser; Node built-ins are mapped to small
  browser stand-ins via an import map (`web/shims/`). The benchmark JSON is
  pre-generated with the same integrity-checked loader. The build fails if a shipped
  module needs an unmapped Node built-in or global.
- Hosting: GitHub Pages through `.github/workflows/demo.yml` (verify → failure test →
  build → deploy). No server, account beyond GitHub, secret, cost, telemetry or runtime
  network request is added. A page-level CSP restricts scripts to the site itself and
  the hashed import map.
- Verification: all 7 scenarios × 2 budgets plus the scenario and benchmark routes are
  byte-identical between the hosted adapter and the loopback server.
- The local product boundary (DM-DEC-034 loopback dashboard) is unchanged.

## DM-DEC-038 — Defect fix: expired records behind permission rules

- Date: 2026-10-25
- Status: IMPLEMENTED. Confirmed defect, permitted by the RC2 freeze policy.
- Defect: audit precedence evaluates permission rules (`DM-RULE-AUTH-003/004/005`)
  before `DM-RULE-FRESH-001`. The context compiler excluded expired records only when
  the primary finding was `DM-RULE-FRESH-001`, so an expired `ACT_WITH_CAUTION`,
  `ASK_BEFORE_CHANGE` or unconfirmed `OWNER_CONFIRMED` record reached ranking. Context
  validation then rejected the whole pack (fail-closed), denying context for every task
  matching that record. No unsafe content was served. Found by `scripts/failure-test.mjs`.
- Fix: `compileContext` applies an independent expiry gate after relevance and scope and
  before ranking, using the same condition as freshness scoring. Exclusion reasons for
  irrelevant and out-of-scope records are unchanged.
- Not changed: audit rule precedence and outcomes, schema, benchmark ground truth and
  artifacts (regenerated byte-identical), package/engine version `1.0.0-rc.2`.
- Regression coverage: `test/regression-expired-permission.test.ts`.
- Also: the Windows-only PowerShell dry-run test is reported as skipped on non-Windows
  hosts so a clean clone passes on macOS/Linux; it still runs on Windows.

## DM-DEC-039 — Everyday memory commands and read-only inspector

- Date: 2026-10-25
- Status: IMPLEMENTED under the owner's direction to improve usability on the private
  development copy.
- Problem: creating or removing a memory required hand-writing a full update-candidate
  JSON file, and there was no human-readable answer to "what do you remember, and how
  sure are you?"
- Decision: add `remember`, `inspect`, `forget` and `revoke` (`src/core/quick.ts`).
  - `remember` builds a CREATE candidate from a statement plus a basis
    (`inferred` by default, or `observed`, `repo`, `test`, `unknown`) that sets an
    aligned source type, authority, default permission and review window. Owner
    confirmation is deliberately not offered; it still requires owner evidence.
  - `forget` is REDACT; `revoke` is REVOKE. Owner-confirmed targets need `--as-owner`,
    which is a declared (not authenticated) owner claim, as documented elsewhere.
  - All writes go through `applyUpdateCandidate`; `--dry-run` uses
    `previewUpdateCandidate` and writes nothing.
  - `inspect` is read-only (no audit events). Its `servable` flag mirrors the context
    compiler's eligibility gates; the rule-combination suite asserts they agree for
    all 18,000 combinations.
- Not changed: schema, audit rules and precedence, MCP tool set, benchmark.
