# Tamhees - Judge-Facing Website Specification

> Working document for the Doo challenge: **Memory That Knows It Might Be Wrong**
> Product: **Tamhees**
> Website role: Explain and demonstrate the real local product through a polished local interactive experience.
> Current candidate: Version 0.8.2, unstaged, pending independent owner review. Phase 9 has not started.

## 1. Website purpose

The website is the challenge demonstration and product explanation layer for Tamhees.

It is not the core product, a browser extension, or a fake dashboard. The actual product is a local deterministic engine, CLI, structured memory store, lifecycle system, adapters, benchmark, and local dashboard. The website makes that system understandable and testable for a judge who may spend only a few minutes on the submission.

The website must answer seven questions quickly:

1. What is Tamhees?
2. What problem does it solve?
3. Why is an ordinary memory file not enough?
4. What exactly happens before an AI agent acts?
5. What does the live audit demonstrate?
6. How can a developer use it with Codex, Antigravity, Claude, generic agents, or local MCP?
7. What is implemented today, and what remains limited?

## 2. Challenge alignment

Visible challenge title:

**Memory That Knows It Might Be Wrong**

Visible challenge question:

> How can AI remember without becoming inaccurate, invasive, or overconfident?

The website should map the challenge language directly to demonstrated behavior:

| Challenge problem | Product response | Website proof |
|---|---|---|
| Inaccurate memory | Provenance, freshness, evidence comparison, conflict detection | SQLite memory conflicts with current Supabase evidence and cannot produce TRUST |
| Invasive memory | Sensitivity classification, secret-like detection, redaction-before-retention | An obviously fake key-like value becomes `FORGET_OR_REDACT` and never appears in history |
| Overconfident memory | Verification status, confidence separated from authority, permission-to-act | An agent inference cannot become owner-confirmed or authorize a major change |
| Excessive context | Ranked task-specific retrieval with a hard budget | A budget control selects only the safest, most relevant memories and explains exclusions |
| Uncontrolled updates | Authority-safe lifecycle and auditable mutations | A proposed update is accepted, rejected, or escalated through deterministic rules |

Do not state that the detailed challenge brief or judging criteria were reviewed unless that becomes verified later.

## 3. Audience

### Primary audience

Doo judges evaluating originality, usefulness, execution quality, clarity, and challenge fit.

### Secondary audience

- Developers using AI coding agents.
- Teams maintaining long-running repositories.
- Technical reviewers inspecting the implementation.
- Potential collaborators or employers evaluating the owner's work.

### Expected audience knowledge

Assume judges understand AI products but may not know:

- `AGENTS.md` or `CLAUDE.md` conventions;
- memory-bank workflows;
- provenance and authority vocabularies;
- context budgets;
- how stale project instructions cause unsafe code changes.

Use plain language first. Put technical detail behind expandable explanations, question-mark tooltips, or a "View rule trace" control.

## 4. Core message

### Primary headline

**Project memory that knows when it might be wrong.**

### Supporting line

**Tamhees helps AI coding agents remember decisions without blindly trusting stale, private, or overconfident context.**

### One-sentence product explanation

**It stores project memory as evidence-backed claims, checks those claims against current reality, and decides whether an agent may trust, recheck, ask, block, or forget them.**

### Primary judge takeaway

The strongest moment is not when the system remembers. It is when the system refuses to act because its memory conflicts with current evidence.

## 5. Success criteria

A successful website enables a first-time judge to:

- understand the problem within 15 seconds;
- run the primary contradiction demonstration within 45 seconds;
- see why the outcome occurred without reading documentation;
- understand the privacy and overconfidence demonstrations within two minutes;
- distinguish the working product from planned capabilities;
- find the repository, architecture, benchmark, and Loom links easily;
- use the complete experience by keyboard;
- use the website on desktop, tablet, or mobile without clipped content or uncontrolled horizontal scrolling.

## 6. Honesty rules

The website must never imply functionality that does not exist.

### Required labels

Every capability must be classified internally as:

- `IMPLEMENTED`
- `VERIFIED`
- `PLANNED`
- `LIMITATION`

Only implemented, tested engine behaviors may power interactive demonstrations.

If a demonstration uses static fixture data, state:

> This scenario uses safe deterministic fixture data and the same audit rules as the local engine.

Do not imply that:

- the website controls every coding agent automatically;
- a cloud service or AI model is performing the audit;
- real credentials are scanned or stored;
- the product has proven market demand;
- Tamhees is the first project-memory system;
- all secret formats can be detected;
- integrations are complete before adapter tests pass;
- the project was built to an unverified judging criterion.

## 7. Information architecture

The recommended experience is a single-page interactive story with anchored sections and optional detail panels.

### Top navigation

Items:

- Problem
- Live Audit
- Context Budget
- How It Works
- Evidence
- Limitations
- Repository

The navigation should remain compact, keyboard accessible, and visible after the hero. On mobile, use an accessible disclosure menu.

### Page sequence

1. Hero.
2. The ordinary-memory problem.
3. Three failure modes.
4. Primary interactive contradiction audit.
5. Privacy and overconfidence scenarios.
6. Budgeted context compiler.
7. Lifecycle demonstration.
8. Architecture and agent integration.
9. Deterministic benchmark evidence.
10. Practical use workflow.
11. Limitations and trust boundaries.
12. Challenge alignment.
13. Repository, Loom, and final call to action.

## 8. Hero section

### Goal

Explain the product before asking the judge to interact.

### Recommended content

Eyebrow:

`DOUBTFUL MEMORY / LOCAL AI MEMORY AUDITOR`

Headline:

**Project memory that knows when it might be wrong.**

Body:

**AI coding agents remember project decisions to work faster. But old, inferred, or sensitive memory can become dangerous. Tamhees checks what an agent remembers before that memory is allowed to control an action.**

Primary button:

**Run the contradiction audit**

Secondary button:

**See how it works**

Status strip:

- Local-only
- Deterministic
- No API key
- Explainable outcomes
- Zero runtime dependencies for the core engine

### Hero visual

Use a compact animated pipeline:

1. A memory card enters from the left.
2. A current-evidence card enters from the right.
3. They meet in an audit core.
4. A visible conflict appears.
5. The output becomes `BLOCK_ACTION` or `ASK_OWNER`.

The animation must communicate meaning, not act as decoration. Provide `prefers-reduced-motion` behavior that shows the final static state.

## 9. Problem section - ordinary memory versus doubtful memory

### Heading

**Remembering is not the same as knowing.**

### Two-column comparison

#### Ordinary project memory

- Stores: "This project uses SQLite."
- Often omits where that information came from.
- May remain unchanged after the repository migrates.
- May be repeated with high confidence.
- Can influence code without asking whether it is still true.

#### Tamhees

- Stores the statement as a claim.
- Records provenance and verification status.
- Tracks freshness and review conditions.
- Compares current evidence.
- Separates confidence from permission.
- Refuses unsafe action when memory and reality disagree.

### Progressive disclosure

Place a small accessible question-mark control next to terms such as:

- Provenance
- Freshness
- Authority
- Action permission
- Context budget

Each control opens a short plain-language definition and a technical "Read more" expansion.

## 10. Three failure modes

Use three large cards with simple language and a short animated example.

### Inaccurate

Headline:

**The project changed. The memory did not.**

Example:

The memory says SQLite, while current repository evidence indicates Supabase.

Result:

`BLOCK_ACTION`

### Invasive

Headline:

**Useful context should not become secret storage.**

Example:

An obviously fake API-key-like string is submitted as memory.

Result:

`FORGET_OR_REDACT`

### Overconfident

Headline:

**An agent's inference is not the owner's decision.**

Example:

An agent infers a design preference and attempts to authorize a material redesign.

Result:

`ASK_OWNER`

Do not rely on outcome color alone. Always show the text label, icon, short reason, and next step.

## 11. Primary interactive demonstration

### Scenario title

**The database decision that no longer matches reality**

### Initial layout

Use three columns on desktop and a vertical sequence on mobile:

1. Remembered claim.
2. Current evidence.
3. Audit result.

### Remembered claim card

Example fixture:

- ID: `DM-MEM-DEMO-001`
- Statement: The project uses SQLite for local persistence.
- Source: Owner decision recorded during initial architecture.
- Verification: `OWNER_CONFIRMED`
- Confidence: `HIGH`
- Last verified: safe fixed fixture date
- Sensitivity: `INTERNAL`
- Permission: `ASK_BEFORE_CHANGE`
- Recheck: Inspect package metadata and database configuration.

### Current evidence cards

- `package.json` includes a Supabase client.
- Current configuration points to Supabase.
- The prior SQLite directory is absent.
- Owner approval for a migration is not present.

### Judge controls

- **Run audit**
- **Reset scenario**
- **Inspect claim**
- **Inspect evidence**
- **View rule trace**
- Optional scenario selector

### Audit animation

When the judge runs the audit:

1. Highlight provenance.
2. Highlight current repository evidence.
3. Draw the two statements into the audit core.
4. Display a conflict marker.
5. Prevent the action card from moving into the "Execute" state.
6. Reveal the final result and safe next step.

### Result content

Outcome:

`BLOCK_ACTION`

Plain-language explanation:

**The remembered database decision conflicts with current repository evidence. The system cannot determine whether this is an approved migration or an accidental change.**

Permission consequence:

**Do not generate database-dependent changes from either assumption.**

Recommended next step:

**Ask the owner whether Supabase is an approved replacement, then update or revoke the old memory through the controlled lifecycle.**

Technical detail panel:

- Triggered rule IDs.
- Evidence examined.
- Rule precedence.
- Deterministic input/output summary.
- Safe fixture disclaimer.

## 12. Scenario selector

All scenarios must execute through the same shared audit logic.

Required scenario set:

| Scenario | Primary concept | Expected outcome |
|---|---|---|
| Architecture conflict | Inaccurate memory | `BLOCK_ACTION` |
| Expired technical claim | Stale memory | `RECHECK` |
| Inferred owner preference | Overconfidence | `ASK_OWNER` |
| Fake secret-like value | Invasive retention | `FORGET_OR_REDACT` |
| Superseded instruction | Revocation | `BLOCK_ACTION` |
| Supported current fact | Safe memory | `TRUST` |

Each scenario needs:

- safe deterministic data;
- an expected outcome;
- reset behavior;
- a visible reason;
- triggered rules;
- evidence summary;
- permission consequence;
- next action;
- automated coverage in the shared engine or browser-compatible test suite.

## 13. Privacy demonstration

### Goal

Show that privacy behavior is implemented, not merely promised.

### Interaction

Display an input prefilled with an obviously fake key-like value labeled as test data.

Example:

`dm_fake_key_DO_NOT_USE_123456789`

When the judge submits it:

1. The raw value visually collapses into a redacted token.
2. Persistence is rejected or a controlled redaction tombstone is created.
3. Audit history displays only safe metadata.
4. The UI explicitly states that the raw value was not placed in history, export, or context.

### Mandatory disclaimer

**Pattern-based detection is defensive and cannot prove that content is safe. Real credentials should never be submitted to the demonstration.**

Never use a string that could be mistaken for a real credential.

## 14. Overconfidence demonstration

### Claim

"The owner prefers purple interfaces."

### Provenance

Agent inference from a previous discussion.

### Proposed action

Replace the entire application design system.

### Required behavior

- Confidence does not create authority.
- Agent inference cannot become `OWNER_CONFIRMED` automatically.
- The proposed material action requires explicit owner evidence.
- Outcome: `ASK_OWNER` or `BLOCK_ACTION`, depending on recorded permission.

Use a simple authority ladder animation. The inferred claim may move up to observation or repository verification only when matching evidence exists. It must visibly stop before owner-confirmed authority without owner evidence.

## 15. Budgeted context compiler demonstration

This section demonstrates why Tamhees is better than rereading an unbounded Brain.md file.

### Heading

**Give the agent the right memory, not every memory.**

### Inputs

- Task description.
- Context budget control.
- Optional preset tasks.

Recommended preset tasks:

- "Change the project database adapter."
- "Update the responsive navigation."
- "Prepare a local release build."

### Visual layout

Left:

- Search/task input.
- Budget slider or segmented values.
- Available memory cards.

Center:

- Ranking pipeline: relevance, authority, freshness, audit safety.

Right:

- Selected context.
- Excluded memories.
- Estimated budget used and remaining.
- Compliance indicator.

### Required behavior

- The selected-memory payload never exceeds its configured estimate.
- Lower-ranked items become `OVER_BUDGET` exclusions.
- Safety exclusions happen before budget selection.
- Every selected and excluded memory has a controlled reason plus plain-language explanation.
- Changing the budget changes selection deterministically.
- No context pack is permanently stored.
- The UI explains that token estimates are deterministic approximations, not exact provider tokenization.

### Important copy

**The original Brain.md approach reread everything. Tamhees retrieves only the safest relevant claims that fit the task budget.**

## 16. Lifecycle demonstration

This section becomes interactive only after Phase 4 is implemented and verified.

### Three-step flow

1. **Before the task** - retrieve a safe, budgeted context pack.
2. **During the task** - the coding agent works using that context.
3. **After the task** - proposed memory updates pass schema, evidence, privacy, concurrency, and authority validation before persistence.

### Required demonstration

- One safe observation is accepted.
- One attempted authority escalation is rejected.
- One owner-level decision is held for confirmation.
- The audit trace records the decision without storing prohibited content.

### Key message

**Automatic maintenance does not mean uncontrolled rewriting.**

## 17. Architecture section

### Goal

Make the big picture understandable without overwhelming the primary story.

### Recommended diagram

Use a vertical architecture flow:

1. Coding agents.
2. Thin adapters.
3. `tamhees` CLI and engine.
4. Memory store, evidence, audit, context compiler, lifecycle.
5. Local `.tamhees/` JSON and JSONL.

### Invariants shown beside the diagram

- One canonical memory source.
- Adapters contain no audit business logic.
- No hosted AI model is required.
- No runtime network access.
- Deterministic decisions.
- Local storage.
- Auditable changes.
- Context is ephemeral by default.

### Product identity note

Use **Tamhees** publicly. Mention `tamhees` only as the temporary local engine/CLI codename.

## 18. Agent integration section

Explain the final intended workflow without overstating completion.

### Generic workflow

1. Install or copy Tamhees into a local project.
2. Initialize `.tamhees/`.
3. An adapter or CLI retrieves task-specific context before work.
4. The agent works using the returned context.
5. The agent proposes memory updates after work.
6. The engine validates and finalizes allowed updates.
7. Owner-level uncertainty is escalated instead of guessed.

### Integration cards

- Codex
- Antigravity
- Claude Code
- Generic CLI/file agent
- Local MCP-capable agent

Each card must show `IMPLEMENTED`, `VERIFIED`, or `PLANNED` based on actual adapter evidence at release time.

## 19. Deterministic benchmark section

This section should use real Phase 7 output.

### Baselines

1. No persistent memory.
2. Original monolithic `GPTBrain.md` approach.
3. Simple split-file memory.
4. Tamhees.

### Metrics

- Retrieval precision.
- Retrieval recall.
- Estimated context size.
- Budget compliance.
- Stale-memory detection.
- Conflict detection.
- Revocation handling.
- Authority protection.
- Sensitive-content retention prevention.
- Correct deterministic outcome.
- Abstention or escalation when evidence is insufficient.
- Cross-adapter context equivalence.

### Presentation

Use a compact comparison table and a few focused visual metrics. Do not invent scores. Do not claim subjective answer quality unless supported by a separately approved evaluation.

Add a button:

**View benchmark methodology**

This opens fixture definitions, measurement rules, and limitations.

## 20. Practical use section

### Heading

**Use it before an AI agent changes your project.**

### Example workflow

```powershell
npm ci
npm run build
node dist/src/cli.js init
node dist/src/cli.js context --task "Change the database adapter" --max-tokens 800
node dist/src/cli.js audit
```

Use only commands that exist in the final verified release. Update this block when the CLI stabilizes.

### Short explanation

Tamhees does not require the owner to reread or manually rewrite a giant brain file before every prompt. The lifecycle retrieves relevant context and validates proposed updates automatically while escalating owner-level decisions.

## 21. Limitations and trust boundaries

This section is mandatory and should be visually honest rather than hidden in fine print.

Required limitations:

- Deterministic lexical/rule-based retrieval is not human understanding.
- Local token estimates may differ from a specific model tokenizer.
- Pattern detection cannot identify every possible secret.
- Owner evidence is not cryptographically signed in Version 1.
- The system cannot force an unrelated coding agent to obey unless the agent uses an adapter or workflow that invokes it.
- Version 1 does not intercept every tool action automatically.
- A false or malicious evidence record can still require owner review.
- The detailed Doo judging criteria remain unverified unless later confirmed.
- The dashboard is an interface over the engine, not an independent authority.

### Recommended heading

**A system that doubts memory should also state its own limits.**

## 22. Challenge-alignment section

Use the visible challenge wording, then show direct mapping:

### Inaccurate

Claims can expire, conflict with evidence, or require recheck.

### Invasive

Sensitive retention is restricted and secret-like content is rejected or redacted.

### Overconfident

Confidence is separate from authority, and agent inference cannot silently become an owner decision.

Close with:

**Tamhees does not make AI memory perfect. It makes memory accountable.**

## 23. Final call to action

Primary links at release:

- View repository
- Open live demonstration
- Watch two-minute walkthrough
- Read protocol
- View benchmark

Do not display placeholder links as functional buttons. Disable and label unfinished artifacts during development, then remove placeholder states before submission.

## 24. Visual design direction

### Overall character

- Technical but human.
- Precise but not clinical.
- Calm confidence rather than alarmist security imagery.
- Mostly black and white with purposeful color.
- High-density information presented through progressive disclosure.

### Recommended palette

Base:

- Near-black: `#09090B`
- Elevated black: `#111114`
- White: `#FAFAFA`
- Muted text: `#A1A1AA`
- Borders: `#27272A`

Brand accent:

- Electric violet: `#A855F7`
- Bright magenta-violet: `#D946EF`

Outcome colors:

- TRUST: green `#22C55E`
- RECHECK: amber `#F59E0B`
- ASK_OWNER: blue `#3B82F6`
- BLOCK_ACTION: red `#EF4444`
- FORGET_OR_REDACT: pink-red `#F43F5E`

Every outcome must include text and iconography; color alone is insufficient.

### Typography

Use a clean interface sans-serif with a restrained monospace face for IDs, rules, evidence, and commands. Prefer locally bundled open-source fonts or a strong system-font stack. Do not require a runtime font request.

### Component language

- Rounded but not overly soft cards.
- Thin borders and subtle elevation.
- High-contrast primary buttons.
- Compact badges for status and authority.
- Evidence cards visually distinct from memory cards.
- Rule traces use a readable vertical timeline.
- Technical IDs use monospace.
- Tooltips and detail panels must be keyboard accessible.

## 25. Animation specification

Animations should explain state transitions.

### Required meaningful animations

1. Memory and evidence converge into the audit engine.
2. A conflict prevents the action from reaching execution.
3. A secret-like value becomes redacted before storage.
4. An inferred claim stops at the owner-authority boundary.
5. Ranked memory cards rearrange when the task or budget changes.
6. Lower-ranked cards move into an over-budget exclusion tray.
7. Lifecycle steps transition from pre-task to task to finalization.

### Motion constraints

- No long intro that delays access.
- Primary controls respond immediately.
- Avoid excessive parallax or cursor-following effects.
- Avoid animation that changes data without user intent.
- Support `prefers-reduced-motion`.
- Preserve final information when motion is disabled.
- Maintain 60fps on an ordinary laptop where practical.

## 26. Responsive behavior

### Desktop

- Three-column audit comparison.
- Persistent section navigation.
- Side-by-side architecture and explanation.

### Tablet

- Two-column where practical.
- Result moves below memory/evidence.
- Navigation remains readable.

### Mobile

- Single-column story.
- Sticky action area only when it does not cover content.
- Cards use full available width.
- Tables become labeled card rows or horizontally constrained accessible regions.
- Technical traces default collapsed.

Test at representative widths such as 360, 390, 768, 1024, and 1440 pixels.

## 27. Accessibility requirements

- Semantic landmarks and heading hierarchy.
- Keyboard access to every scenario and disclosure.
- Visible focus indicators.
- Buttons use native behavior.
- No essential drag-only interaction.
- Accessible names for icons.
- Outcome labels do not rely on color.
- Text and controls meet appropriate contrast expectations.
- Live audit results use a polite live region without repeatedly interrupting the user.
- Tooltips are available by focus and not pointer-only.
- Reduced-motion support.
- Scenario reset restores a predictable focus position.
- Charts include text or table equivalents.

## 28. Technical implementation boundaries

### Required architecture

- Local production build served by Node built-in HTTP on 127.0.0.1.
- No hosted backend or remote listener.
- No account.
- No cloud database.
- No hosted AI model.
- No API key.
- No telemetry.
- No runtime external network dependency for core interaction.
- Safe deterministic fixture data.
- Shared or equivalently generated audit behavior from the canonical engine.

### Framework decision

DM-DEC-034 resolves Phase 8: Node built-ins and local assets, with no framework or added dependency. React, Vite, animation libraries, CDNs, and hosted assets remain unapproved.

Prefer:

- TypeScript.
- Browser-compatible shared domain logic.
- CSS and SVG for core explanatory animation.
- Bundled local assets.
- Minimal direct dependencies.

Avoid:

- CDN scripts.
- Runtime analytics.
- remote fonts required for layout;
- fake API loading states;
- decorative heavy 3D scenes that obscure the product;
- a second implementation of audit rules that can drift from the CLI.

## 29. Suggested component inventory

- `SiteHeader`
- `HeroAuditAnimation`
- `StatusStrip`
- `OrdinaryVsDoubtfulComparison`
- `FailureModeCard`
- `ScenarioSelector`
- `MemoryClaimCard`
- `EvidenceCard`
- `AuditCore`
- `OutcomePanel`
- `RuleTrace`
- `PermissionConsequence`
- `SafeNextStep`
- `PrivacyDemo`
- `AuthorityLadder`
- `BudgetControl`
- `RankedMemoryList`
- `BudgetMeter`
- `LifecycleTimeline`
- `ArchitectureDiagram`
- `IntegrationStatusCard`
- `BenchmarkTable`
- `LimitationCard`
- `QuestionTooltip`
- `RepositoryCTA`
- `SiteFooter`

Components must not own separate audit business logic. They consume canonical engine results.

## 30. Website state model

The main scenario experience should have explicit states:

1. `READY`
2. `AUDITING`
3. `RESULT`
4. `DETAIL_OPEN`
5. `RESETTING`
6. `ERROR`

Requirements:

- The audit state is brief and deterministic, not an artificial long loading sequence.
- Errors explain recovery.
- Reset returns to the selected scenario's initial state.
- Switching scenarios does not leak the prior result.
- URLs may optionally encode the selected scenario without storing sensitive content.

## 31. Content tone

Use short direct sentences.

Preferred:

- "Memory says SQLite."
- "Current evidence points to Supabase."
- "The agent does not have authority to decide whether this migration was approved."
- "Action blocked. Ask the owner."

Avoid:

- vague marketing superlatives;
- unexplained protocol vocabulary;
- claiming that AI is conscious or literally doubts itself;
- fear-based security language;
- large paragraphs in the primary interaction;
- calling deterministic rules an AI model.

## 32. Test plan

### Functional

- Every scenario produces its documented result through shared logic.
- Input changes alter calculated output.
- Reset works.
- Rule trace matches engine rule IDs.
- Evidence displayed matches evaluated evidence.
- Budget never exceeds the documented measured payload.
- No context persists unintentionally.
- No fake control exists.

### Regression

- Engine fixtures match browser results.
- Outcome names and precedence match protocol documentation.
- README walkthrough matches the final interface.
- Screenshot and Loom scenarios use the same final fixture data.

### Accessibility

- Keyboard-only journey.
- Focus order.
- Focus visibility.
- Screen-reader names.
- Contrast.
- Reduced motion.
- Live-result announcement.

### Responsive

- 360px mobile.
- 390px mobile.
- 768px tablet.
- 1024px laptop/tablet landscape.
- 1440px desktop.

### Privacy and security

- No real secret fixtures.
- No secret-like test value appears in persisted browser storage or logs.
- No telemetry requests.
- No external runtime request required for core demonstration.
- No untrusted HTML injection from editable fixture fields.
- No unsafe URL handling.

### Build

- Clean install.
- Typecheck.
- Unit and integration tests.
- Production build.
- Built assets load from a local static server.
- No development-only dependency is required at runtime.

## 33. Performance targets

- Useful hero content visible immediately.
- Main audit interaction ready without a long initialization.
- Keep animation and bundle weight proportional to the demonstration.
- Avoid loading every technical detail before it is requested.
- Use code splitting only if it materially improves the final build without complicating reliability.
- Do not optimize benchmark numbers before measuring actual performance.

## 34. Repository and evidence links

At release, the website should link directly to:

- README.
- Protocol specification.
- Architecture.
- Audit-rule mapping.
- Benchmark methodology and output.
- Setup instructions.
- Safe example scenarios.
- Source code for the shared engine logic.
- Loom walkthrough.

Use descriptive labels rather than raw URLs.

## 35. Loom storyboard

Target duration: approximately 90-120 seconds unless official rules specify otherwise.

### 0-15 seconds - Problem

"AI coding agents remember project decisions, but memory can become stale, invasive, or overconfident."

### 15-35 seconds - Product

"Tamhees stores project knowledge as claims with evidence, freshness, sensitivity, and permission to act."

### 35-70 seconds - Primary audit

Run the SQLite/Supabase conflict. Show the refusal to act and the rule trace.

### 70-90 seconds - Privacy and budget

Show fake-secret redaction and task-specific budgeted context.

### 90-110 seconds - Architecture and usefulness

Show local engine, CLI, adapters, deterministic benchmark, and zero-runtime-network boundary.

### 110-120 seconds - Close

"Tamhees does not make AI memory perfect. It makes memory accountable."

The Loom must use the final website and verified build. Do not record against temporary UI or outdated results.

## 36. Build sequence

### Website preparation before Phase 8

- Keep this specification aligned with product behavior.
- Finalize scenario fixtures only after audit and lifecycle behavior stabilize.
- Feed real benchmark output into the evidence section after Phase 7.
- Approve exact UI dependencies before installation.

### Phase 8 implementation

1. Use the approved dependency-free loopback boundary from DM-DEC-034.
2. Create the static application shell.
3. Integrate browser-compatible shared engine logic.
4. Build primary contradiction scenario.
5. Add remaining scenarios.
6. Add context-budget and lifecycle demonstrations.
7. Add architecture, benchmark, limitations, and challenge sections.
8. Complete responsive and accessibility work.
9. Verify production build.

### Phase 9 release

1. Run cross-artifact consistency review.
2. Finalize README and setup guide.
3. Capture screenshots.
4. Record Loom.
5. Prepare submission summary.
6. Verify every link privately.
7. Obtain owner approval before repository publication, hosting, video upload, or submission.

## 37. Website definition of done

The website is done only when:

- the first screen explains the product and primary action;
- the contradiction scenario runs through real deterministic logic;
- privacy, revocation, staleness, inference, and safe trust scenarios work;
- context-budget behavior is real and explainable;
- lifecycle behavior reflects the verified engine;
- every outcome includes text, evidence, rule trace, permission consequence, and next action;
- no result is hard-coded presentation text pretending to be an audit;
- planned integrations are labeled honestly;
- benchmark numbers come from the deterministic harness;
- no account, API key, hosted model, telemetry, or hosted backend is required;
- keyboard, responsive, reduced-motion, and contrast checks pass;
- production build succeeds;
- repository, website, README, protocol, benchmark, screenshots, Loom, and submission text agree;
- the owner approves any external publication.

## 38. Final judge story

The judge should leave with this sequence in mind:

1. Project memory helps an AI agent continue work.
2. That memory can become wrong, private, or too authoritative.
3. Tamhees stores memory as a claim with evidence and limits.
4. The claim is audited against current reality before action.
5. When evidence conflicts, the agent refuses to guess.
6. When information is sensitive, it is rejected or redacted.
7. When context is large, only safe relevant claims enter the task budget.
8. Updates are validated after the task instead of silently rewriting project truth.
9. The same local engine can serve different coding agents.
10. The system is useful not because it remembers everything, but because it knows when memory should not be trusted.

## 39. Phase 8 local implementation note

Version 0.8.0 is independently verified and checkpointed locally: Node built-in HTTP on `127.0.0.1`, local assets, seven canonical safe-fixture scenarios, and SHA-256-checked benchmark evidence. It adds no dependency, external resource, persistence, telemetry, account, model, database, upload, or deployment. Automated security, privacy, deterministic, semantic, responsive, and reduced-motion checks pass together with visual review at 1440×900, 1024×768, and 390×844 and an independent Chromium keyboard-only audit. Real assistive-technology, physical-device, judge-comprehension, release, and publication review remain pending; Phase 9 has not started.

## 40. Phase 8.1 owner-directed visual correction

The owner rejected the original Phase 8 visual design and explanation, not the verified canonical engine. Version 0.8.1 therefore changes the local presentation layer while preserving all seven deterministic scenarios, API contracts, benchmark integrity checks, loopback and security boundaries, privacy-safe rendering, and zero runtime dependencies.

### Visual direction and information hierarchy

The corrected experience is predominantly white and soft white, with black and charcoal text. Industrial blue is limited to connector lines, small labels, focus and selected states, diagram illumination, pale teaching surfaces, and soft depth. Semantic green, amber, and red communicate outcomes. The broad content frame is approximately 1440 pixels with larger system-font body copy and a wide, unboxed hero beginning at the left content boundary.

The page sequence is: what the product is; why blind trust in memory is dangerous; the four checks; the real live audit; deterministic benchmark evidence; the five local adapter entry points; honest Version 1 limitations; and a final local call to action. Plain language precedes implementation detail. The audit result is absent until execution, explains why and what happens next before exposing IDs and rule traces, and shows context budget controls prominently only for the hard-budget example.

### Native animation specification

The hero contains a semantic HTML and inline-SVG teaching diagram. A remembered SQLite decision and current Supabase repository evidence enter from opposite sides, connectors draw into the audit core, Source, Freshness, Current evidence, and Permission to act resolve in sequence, and the engine ends at BLOCK ACTION with an owner-review next step. The approximately 8–10 second educational sequence pauses before restarting and has a visible Pause/Play control, an adjacent static text alternative, offscreen and page-hidden suspension, and no live announcements from decorative state changes.

One-time intersection-triggered reveals connect the four checks, introduce sections, and animate the benchmark comparison. The live audit begins its real API request immediately and uses a presentation-only five-stage path while awaiting the canonical response; the interface never invents an intermediate or final outcome. UI transitions use short transform-and-opacity changes. Reduced-motion mode exposes every meaningful final state immediately, disables repeated educational motion, and retains all content and controls.

### Source and licensing boundary

Awwwards animation collections supplied visual inspiration only for page rhythm, SVG motion, and scroll-triggered presentation; no showcased website source was copied. Anime.js and Motion supplied conceptual interaction references only for staged timelines, line drawing, stagger, and reveal behavior. Neither library was installed, bundled, copied, or imported, and no Motion+ or premium example was used. All implemented animation code is original and uses native CSS, semantic HTML, inline SVG, IntersectionObserver, document visibility events, and browser platform behavior. No third-party code, animation dependency, hosted asset, font, script, style, API, or network request was added.

This remains a Phase 8 correction candidate. It does not start Phase 9 and does not authorize staging, commit, upload, deployment, or publication.
## 41. Phase 8.2 approved identity and guided CLI candidate

The active identity is Tamhees, with the restrained Arabic detail تمحيص, executable/package name `tamhees`, canonical storage `.tamhees/`, tagline “Memory under scrutiny.”, and opening explanation “Tamhees checks what an AI remembers before that memory is allowed to guide an action.” The old GPTBrain.md reference appears only in the origin story as the useful monolithic experiment that grew costly and unsafe to trust blindly.

A prominent guided CLI lesson precedes the live audit. It exposes five fixed presentation states: `tamhees init`, memory apply with `<safe-memory-fixture>`, evidence add with `<safe-evidence-fixture>`, `tamhees audit`, and task context for “prepare the database migration.” The lesson has Run full demo, Next step, Reset, direct step selection, pause/play, a labelled contained log, concise announcements, and a complete non-animated equivalent. It accepts no command input and calls no shell. Its first three outputs are fixed teaching copy; outcome, permission, recommended next step, and selected/excluded context are derived from the existing strict canonical architecture-conflict audit response.

The live audit first explains its safety-check purpose and the three-stage model: remembered claim, current proof, and safe action permission. After execution, it shows decision, canonical reason, permission consequence, recommended next step, and selected/excluded context before a collapsed evidence/rule trace. Protocol IDs never precede comprehension.

The candidate retains white/soft-white surfaces, black typography, restrained industrial blue, semantic outcome colors, the native hero teaching animation, responsive layouts, keyboard operation, offscreen and page-hidden pause, and reduced-motion final states. Benchmark data remains derived from the integrity-checked deterministic artifact. Limitations remain explicit: exact lexical/tag retrieval, estimated rather than provider-exact tokens, pattern-based secret detection, a limited local stdio MCP subset, fixed safe fixtures, and no universal enforcement claim.

### Owner hero follow-up

The desktop hero now uses a 1,510-pixel maximum frame with viewport-responsive outer margins and a measured 60/40 copy-to-visual split. The copy begins at the main content boundary, the headline has a 940-pixel maximum measure with balanced `clamp()` typography and natural wrapping, and the supporting explanation can reach 760 pixels. At the verified 1536 x 864 and 1440 x 900 viewports the headline resolves to two broad editorial lines; at 390 x 844 it remains two readable lines with no clipping or horizontal page overflow. Tablet and mobile retain a single-column stack.

The hero diagram is a purpose-built memory-scrutiny pipeline rather than an orbit. The owner claim and repository evidence enter at the top, converge on a Tamhees chamber, pass visibly through Source, Freshness, Current evidence, and Permission gates, and end with BLOCK ACTION, the owner question, and a labelled context exclusion. The panel uses its full vertical area, and every meaningful label remains visible throughout the 10-second emphasis cycle so the complete lesson is understandable in a screenshot. Pause/Play, offscreen suspension, page-hidden suspension, and the reduced-motion final state remain native and dependency-free.

Industrial blue now defines connector paths, blueprint grid lines, chamber chrome, technical borders, focus rings, section bands, guided CLI depth, live-audit progress, benchmark emphasis, integration cards, and informational callouts. White remains dominant, black remains the primary text color, and green, amber, and red retain labelled semantic outcome meaning.
Version 0.8.2 is implementation evidence only. Independent owner visual, CLI, assistive-technology, device, judge-comprehension, release, and publication review remain pending. No staging, checkpoint, upload, deployment, publication, or Phase 9 work is authorized here.
