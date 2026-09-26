# Changelog

All notable local Tamhees release candidates are documented here. Tamhees is
currently unpublished and no public software license has been granted.

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
