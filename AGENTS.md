# Doubtful Memory — Agent Rules

## Read this first

Every AI coding agent must read this file before performing work on this repository.

This file defines the minimum required behavior. It does not replace task-specific instructions from the project owner.

## Routing table

Load only the files relevant to your task. Do not read all project documents for every task.

| Task type | Required reading |
|-----------|-----------------|
| Any task | `AGENTS.md` (this file), `PROJECT_STATE.md` |
| Architecture or scope change | `PROJECT_BRAIN.md`, `DECISIONS.md`, `docs/ARCHITECTURE.md` |
| New feature or requirement work | `REQUIREMENTS_AND_ASSUMPTIONS.md`, `docs/PROTOCOL_SPECIFICATION.md` |
| Risk assessment or safety review | `RISK_REGISTER.md` |
| Memory engine or protocol work | `docs/PROTOCOL_SPECIFICATION.md`, `docs/ARCHITECTURE.md` |
| Adapter or integration work | `docs/ARCHITECTURE.md`, `REQUIREMENTS_AND_ASSUMPTIONS.md` |
| Benchmark work | `docs/ARCHITECTURE.md`, `REQUIREMENTS_AND_ASSUMPTIONS.md` |
| Dashboard or UI work | `REQUIREMENTS_AND_ASSUMPTIONS.md`, `docs/ARCHITECTURE.md` |
| Roadmap or phase planning | `docs/IMPLEMENTATION_ROADMAP.md`, `PROJECT_STATE.md` |
| Memory claim or audit review | `memory/MEMORY_CLAIMS.md`, `memory/MEMORY_AUDIT.md` |

## Mandatory rules

### Preserve user changes

1. Run `git status` before modifying files.
2. Inspect existing diffs before editing files with uncommitted changes.
3. Never discard, revert, reset, or overwrite unrelated user changes.
4. Never use `git checkout -- .`, `git reset --hard`, `git clean -fd`, or similar destructive commands.
5. Never force-push.

### No unauthorized additions

1. Never install packages or dependencies without an approved decision in `DECISIONS.md`.
2. Never add external services, paid functionality, hosted models, telemetry, authentication, or deployment without explicit owner approval.
3. Never add accounts, API keys, cloud databases, or remote services.
4. Never publish, upload, or configure a Git remote without owner approval.
5. Never create costs or billing obligations.

### Evidence and verification

1. Distinguish verified evidence from inference in all documentation and memory updates.
2. Never claim work is complete without running required tests or verification.
3. Never treat the agent's own generated summary as independent supporting evidence.
4. Never elevate an inference to `OWNER_CONFIRMED` status automatically.
5. Run all required tests before reporting success.

### Documentation updates

1. Update `PROJECT_STATE.md` after material work.
2. Update relevant memory artifacts when project-level facts change.
3. Record new decisions in `DECISIONS.md` when scope, architecture, cost, privacy, or safety changes.
4. Do not add frequently changing status to `PROJECT_BRAIN.md`.

### Completion report

Every material task must end with a structured report containing:

1. Outcome: `COMPLETED`, `BLOCKED`, or `PARTIAL`.
2. Summary of changes made.
3. Files created or modified.
4. Tests run and results.
5. Verification commands executed.
6. Any unresolved issues or assumptions.
7. Recommended next action.

### Privacy and safety

1. Never store real secrets, credentials, API keys, or unnecessary personal data.
2. Use obviously fake values in examples and tests.
3. No telemetry or runtime network requests.
4. Redact sensitive content before persistence, logging, or export.

### Local-only operation

1. All work must operate locally.
2. No internet-dependent functionality in the core product.
3. No external service integration without owner approval.
4. No deployment or hosting configuration without owner approval.
