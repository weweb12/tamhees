# Doubtful Memory - Decision Register

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
- Status: APPROVED
- Category: Technology

### Decision

Use Vite, React, TypeScript, local structured data, deterministic TypeScript audit rules, and a static production build as the initial technical direction.

Exact packages and versions must be reviewed before installation.

### Reason

This stack supports a polished interactive demonstration without requiring a backend, database, account system, or hosted runtime.

### Consequences

- The initial product will run as a local web application.
- Core scenarios can be bundled with the application.
- The production output can be statically hosted later if approved.
- Dependency count must remain controlled.

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

## Pending decisions

The following matters are intentionally not decided yet:

- Final visual identity.
- Exact package versions.
- Exact claim schema.
- Audit-rule priority order.
- Import and export behavior.
- Whether users may create custom scenarios in Version 1.
- Final hosting platform.
- Final source-code visibility.
- Video-recording platform.
- Final submission wording.