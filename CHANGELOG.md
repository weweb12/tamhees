# Changelog

All notable local Tamhees release candidates are documented here. Tamhees is
currently unpublished and no public software license has been granted.

## Unreleased - DOO submission (2026-10-25)

- New short front page for judges (DM-DEC-052): one sentence, the problem in three cards,
  one guided three-step demo (Tamhees notices an outdated memory, "forget that" erases one,
  a confident guess still asks the owner), three points and two links. The complete
  dashboard is unchanged and one click away at `/details`.
- The web demo's Inspector has a **Forget** button on every memory, including a new memory
  about the owner (DM-DEC-051). It runs the same tombstone code as `tamhees forget`: the text
  disappears from the page and the response, and the memory is withheld from the agent.
  The REDACT tombstone now lives in one pure function (`src/core/redaction.ts`).
- The page menu highlights the section you are reading, including tall sections.
- Added `tamhees doctor [--fix]` (DM-DEC-050). One unreadable file, such as a git merge
  conflict, used to stop every command with no way forward. The doctor explains each
  problem in plain words and `--fix` repairs what can be undone: damaged files go to
  `.tamhees/quarantine/` (never deleted), valid audit events are kept, the index is rebuilt.
  It also reports interrupted tasks (which changes were saved, which to check), stale write
  locks, and memories holding a secret-like value stored before its pattern was recognized.
  Store errors now end with *Run "tamhees doctor" for details and a safe fix.*
- Installing the command from a fresh clone now works or explains itself (DM-DEC-049). Before,
  `npm install -g .` reported success but created no `tamhees` command; `npm ci` now builds
  automatically, and installing without it prints the two commands to run. README gains an
  "Install the command" section.
- Agent instruction blocks (`CLAUDE.md`, `AGENTS.md`, ...) now tell the agent how to read
  RECHECK and ASK_OWNER, and how to use `inspect`, `remember` and `observe`; the MCP block
  includes ready-to-paste config for Claude Code, Cursor and VS Code. Unmodified rc.2 blocks
  are upgraded in place by `adapter install`; modified blocks are still refused.
- `tamhees observe` reads monorepo workspace folders (`backend/`, `frontend/`, `packages/*`),
  parses Python dependencies with extras, recognizes Docker, Turborepo, Redis and more, and
  checks path-scoped memories against their own folder (DM-DEC-048).
- Retrieval ignores generic task words such as "add", "fix", "new" and "file", and links
  everyday product words to their area (DM-DEC-047). Precision on a realistic set: 67% → 88%.
- Secret detection now also refuses JWT/Bearer tokens, credentials inside URLs, Slack
  tokens and webhooks, bare Stripe keys and Google API keys (DM-DEC-046).
- Faster at scale (DM-DEC-045): on 1,500 memories a write drops from 1.7 s to 0.33 s.
  Files are read in parallel with one safety check each, the store is loaded once per
  write, and the audit log rolls into sealed 4 MiB segments so appends stay cheap.
- Fixed: MCP clients on protocol revisions other than `2025-11-25`, or sending optional
  spec fields such as `_meta` or clientInfo `title`, could not connect (DM-DEC-044).
- Fixed: concurrent writers (DM-DEC-043). Simultaneous writes collided on IDs, lost audit
  events and could silently overwrite a memory that had reported success. All writes now
  go through a project write lock, and create-if-absent is atomic.
- Fixed: an expired memory whose permission rule precedes the expiry rule could reach
  context ranking, making context validation reject the whole pack. Expiry is now
  enforced independently before ranking (DM-DEC-038). Benchmark artifacts unchanged.
- Added `npm run failure-test`: drives the real CLI through contradictory facts, stale
  data, an AI guess, privacy revocation and a refused secret, asserting each outcome.
- Added the static hosted demo (`npm run site`) and GitHub Pages workflow (DM-DEC-037).
- Added judge documents: `SUBMISSION.md`, `docs/ARCHITECTURE_SNAPSHOT.md`,
  `docs/THESIS.md`, `docs/LOOM_90S.md`.
- The Windows-only PowerShell packaging test is skipped on macOS/Linux.
- Added `test/rule-combinations.test.ts`: every combination of authority status, source,
  permission, sensitivity, freshness, evidence, supersession and confidence (18,000
  records) must yield a valid context pack and never serve or trust an unsafe record.
  Run against the original rc.2 context compiler, it reports 498 broken packs (DM-DEC-038).
- CI deploys the hosted demo only when the repository is public.
- Retrieval matches equivalent terms (DM-DEC-042): plural folding, a fixed synonym table
  (`db` = `database`, `auth` = `authentication`) and one-way specific-to-general links
  (`postgres` → `database`, `vitest` → `test`). Sibling technologies never match each
  other. Benchmark artifacts are byte-identical.
- Added the dashboard **memory inspector** (DM-DEC-041): "What does the agent remember, and
  how sure is it?" A fixture project's memories are shown with source, status,
  confidence, freshness and plain-language outcome; **Let Tamhees check the repository**
  runs the real observer and shows which memories flip to blocked or confirmed. The
  hosted demo serves it in the browser with byte-identical responses.
- Added `tamhees observe` (DM-DEC-040): Tamhees now notices some wrong memories by
  itself, checking technology, script and file-path claims against an allowlist of
  repository manifests and recording SUPPORTS or CONTRADICTS evidence. The failure test
  gained a self-detection step.
- Added everyday commands `remember`, `inspect`, `forget` and `revoke` (DM-DEC-039).
  They build candidates for the existing mutation boundary, so every authority,
  privacy, archive and audit rule still applies. `inspect` is a read-only memory
  inspector that also reports expiry or review dates hidden behind a
  higher-precedence audit rule.

## 1.0.0-rc.2 - 2026-09-21

- Added deterministic PROJECT/RESTRICTED memory scope and task applicability filtering.
- Added same-finalization evidence and memory bundles, available through the existing MCP lifecycle.
- Added compatibility for exactly one leading UTF-8 BOM in CLI JSON input.
- Strengthened whole-bundle preflight, evidence-before-memory journal handling and failure stops.
- Preserved narrow scope on legacy UPDATE; normalized old records to PROJECT on read;
  protected scope labels during sensitive retention and redaction.
- Updated release identity and benchmark artifact metadata; benchmark ground truth and metrics are unchanged.

The accepted engineering basis passed independent Windows QA: 294/294 complete tests,
44/44 focused tests and 26/26 adversarial scenarios. Final verification on 2026-09-26
passed under official Windows Node 22.23.2 x64: 294/294 complete, 44/44 focused,
24/24 release/migration, byte-identical benchmark and RC2 PowerShell dry-run.
`NODE22_RC2_CHECK_PASSED` was recorded; product source remained unchanged.
The local RC2 source is frozen. No publication or new Windows portable build is
included in this freeze.

## 1.0.0-rc.1 - 2026-07-27

### Added

- Release-hardening documentation, judge demonstration guide, FAQ, and
  owner-gated release checklist.
- Local threat model and third-party dependency notices.
- A path-safe, dry-run-first local distribution workflow for future source and
  portable Windows x64 archives.
- Automated release-consistency checks.

### Verified locally

- Clean dependency installation, type checking, production build, complete
  test suite, focused dashboard suite, deterministic benchmark generation, CLI
  workflow, adapters, MCP, lifecycle, migrations, and loopback dashboard.
- Zero runtime dependencies and exactly two approved direct development
  dependencies.

### Still gated

- Independent execution on Node 22, real assistive-technology and physical
  device review, owner judge-comprehension and second-laptop portable review,
  publication, and challenge submission.

## 0.8.2 - 2026-07-27

- Renamed the active product, package, CLI, storage directory, adapters, MCP
  tools, and dashboard identity to Tamhees.
- Added explicit fail-closed migration from a lone valid `.gptbrain/` store to
  `.tamhees/`.
- Completed the wide scrutiny-pipeline hero and fixed-fixture guided CLI lesson.
