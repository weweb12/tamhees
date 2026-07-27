# Changelog

All notable local Tamhees release candidates are documented here. Tamhees is
currently unpublished and no public software license has been granted.

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
