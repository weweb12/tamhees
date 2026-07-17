# Doubtful Memory - Project State

## Purpose

This file records the project's current working position.

Update it after meaningful work sessions. It should describe the present state, not serve as a permanent history log. Users are not responsible for manually updating routine state after every task — the system handles automatic state maintenance.

## Status summary

- Project: Doubtful Memory
- Current phase: Phase 0 — Specification realignment (completing)
- Overall status: In progress
- Development environment: Windows, local only, Node 24
- Development agent: Antigravity IDE with Claude Opus 4.6 Thinking
- Repository location: `C:\Projects\doubtful-memory`
- Git branch: `main`
- Latest verified commit: `1c6bc6f` - `docs: establish Doubtful Memory project controls`
- Git remote: None
- External services: None
- Paid services: None
- Application dependencies: Not installed
- Application code: Not started
- Packages installed: None
- Last updated: 2026-07-15

## Current objective

Complete Phase 0 specification realignment, then proceed to Phase 1 core vertical slice.

## Completed work

- Reviewed the two existing project-planning PDFs.
- Confirmed that development will proceed without waiting for the unavailable official challenge brief.
- Expanded the goal beyond the Doo challenge into an independently useful product.
- Confirmed the local-first and zero-budget requirements.
- Confirmed that external or potentially paid services require prior owner approval.
- Created the local project folder outside OneDrive.
- Verified Node.js, npm, Git, and VS Code.
- Initialized the local Git repository.
- Confirmed that no Git remote exists.
- Created the initial control folders and files.
- Populated all initial project-control documents.
- Created first verified local Git commit (`1c6bc6f`).
- Phase 0: Realigned specification with approved architecture corrections.
- Phase 0: Superseded DM-DEC-007 (Vite/React stack) with engine-first decisions.
- Phase 0: Created AGENTS.md, README.md, and .agents/rules/doubtful-memory.md.
- Phase 0: Created docs/ARCHITECTURE.md, docs/PROTOCOL_SPECIFICATION.md, docs/IMPLEMENTATION_ROADMAP.md.
- Phase 0: Appended 12 new decisions (DM-DEC-013 through DM-DEC-024).
- Phase 0: Added engine/CLI/adapter/benchmark requirements.
- Phase 0: Appended 13 new risks (DM-RISK-013 through DM-RISK-025).
- Phase 0: Updated memory claims and audit history.

## Current files in focus

- All project-control and specification documents.

## Locked constraints

- Core development must remain local.
- Default project budget is zero.
- No paid APIs or services.
- No external service without prior explanation and owner approval.
- No cloud database.
- No hosted AI model.
- No authentication in Version 1.
- No telemetry.
- No real secrets or credentials in examples.
- No publishing or uploading without owner approval.
- No application implementation before the specification is approved.
- No knowingly fake or broken functionality.
- Important audit decisions must be deterministic and explainable.
- Engine and CLI must be implemented before dashboard.
- Zero runtime dependencies where reasonable.
- Node 22 minimum, Node 24 development.
- An AI inference can never become OWNER_CONFIRMED automatically.

## Open questions

- The official Doo challenge detail page remains unavailable.
- Official judging criteria remain unverified.
- Official submission requirements remain unverified.
- Final package versions have not been selected (beyond typescript and @types/node).
- The final visual direction has not been approved.
- The final claim schema has not been approved (proposed in protocol specification).
- Detailed audit decision rules have not been approved.
- The final public publishing method has not been selected or approved.

## Current blockers

There are no blockers preventing local planning and development.

The unavailable official challenge brief is a submission risk, but it does not prevent development because the product is being designed for broader independent usefulness.

## Known immediate risks

- Building a documentation template instead of a working product.
- Creating audit rules that appear arbitrary or inconsistent.
- Making unsupported claims that the product is completely unique.
- Expanding Version 1 beyond what can be completed and tested properly.
- Accidentally adding external dependencies or services without review.
- Scope expansion delays the competition release.
- Development agent accidentally performs destructive work.

Detailed risks are maintained in `RISK_REGISTER.md`.

## Definition of the current phase being complete

Phase 0 (Specification realignment) is complete when:

- All documentation is internally consistent.
- All specification files exist and reflect the approved architecture.
- Superseded decisions are marked and replaced.
- New decisions, requirements, risks, claims, and audit records are appended.
- No document claims application functionality exists.
- All IDs are unique within their namespace.
- Cross-references resolve correctly.
- The specification state passes owner review.

## Next phase

Phase 1 — Core vertical slice.

## Next immediate action

Dependency approval and implementation of the first tested gptbrain vertical slice: `gptbrain init`, one validated memory record, local store, context output, one deterministic audit, Node built-in tests.

## Safe restart instructions

When resuming work:

1. Read `AGENTS.md` (routing table).
2. Read this file.
3. Check `git status`.
4. Review the current objective and blockers.
5. Perform only the next immediate action unless the project state is updated first.