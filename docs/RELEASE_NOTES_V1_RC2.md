# Tamhees 1.0.0-rc.2 release notes

RC2 carries forward the accepted, independently Windows-QA-approved engineering
implementation. Release preparation changed identity, documentation and proven
line-ending noise only; final freeze updates acceptance documentation only. It adds
no feature, dependency, hosted service or telemetry.

## Changes since RC1

- Deterministic PROJECT/RESTRICTED memory scope, with environment/component/path
  applicability checked before context ranking.
- Same-finalization evidence and memory bundles, accessible through the existing
  four-tool MCP lifecycle without separate CLI evidence ingestion.
- Exactly-one-leading-UTF-8-BOM compatibility for CLI JSON input.
- Whole-bundle preflight, evidence-before-memory journaling, failure stops and a
  same-process finalization guard.
- Legacy scope normalization, preservation of narrow scope on legacy UPDATE,
  scope-aware privacy/redaction and supporting-reference validation.

Storage schema remains `1.0.0`; package and engine are `1.0.0-rc.2`. The new benchmark
artifacts change only engine-version metadata. RC1 results and checksums remain
historical; ground truth and all 22 fixed scenario results are unchanged.

## Verification and remaining gates

The accepted engineering basis passed independent Windows Node 24.11.1 QA:
294/294 complete tests, 44/44 focused tests, 26/26 adversarial scenarios, real
PowerShell packaging dry-run, and 88/88 manifest matches with no confirmed defect
within the tested scope. These are basis results, not a claim of Node 22 execution.

RC2 Linux Node 24.19.0 verification passes typecheck/build, 44/44 focused tests,
benchmark regeneration and all 293 executable regression tests. The complete
294-test command still encounters the Windows-only powershell.exe ENOENT check.
Final independent Windows verification on 2026-09-26 used official Node 22.23.2
x64 after checking the official SHA-256. Locked npm ci, 294/294 complete tests,
44/44 focused tests, 24/24 release/migration tests, CLI identity, byte-identical
benchmark regeneration and the RC2 PowerShell dry-run passed. The final marker was
`NODE22_RC2_CHECK_PASSED`; no product source changed during that verification.
Both Windows/Node 22 gates are closed. The `node >=22` declaration is unchanged;
execution evidence covers 22.23.2, not every Node 22 minor version.

## Known limitations

- No multi-process locking; callers must coordinate one writer per project.
- Evidence truth depends on external observation, not independent engine inspection.
- Local owner identity is declared, not cryptographically authenticated.
- Active redaction does not universally erase historical archives or external evidence.
- Older binaries cannot understand newly scoped records; downgrade requires a backup.
- No ambient repository watcher or autonomous begin/finalize interception.
- No whole-bundle filesystem transaction or automatic interrupted-bundle recovery.
- Pattern secret detection and policy matching do not prove universal detection.

Real assistive-technology and physical-device evaluation, judge-comprehension,
public license selection and publication remain separate gates. The package remains
private and UNLICENSED. The owner authorized the local release commit and annotated
tag `v1.0.0-rc.2`. No remote, push, publication or deployment exists. Raw
machine-specific QA evidence is kept outside the product payload.

Pending final native-Windows portable build from frozen commit. Follow the
separately supplied build handoff to generate a fresh package and SHA-256. Never
relabel an RC1 portable archive or its checksum as RC2.

The RC2 core engine is frozen. Further core modifications require a confirmed
defect, failed release verification or an explicit new post-challenge development
decision. Website, publication and submission work are outside this freeze.
