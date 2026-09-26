# Tamhees 1.0.0-rc.2 release checklist

PASS denotes evidence for the stated build/runtime only. PENDING denotes work
not performed; OWNER and BLOCKED require separate owner-controlled decisions.
Historical RC1 results remain in its release notes and private evidence.

| Gate | Status | Evidence / next action |
|---|---|---|
| Accepted engineering Windows QA | PASS | Node 24.11.1: 294/294 complete, 44/44 focused, 26/26 adversarial; PowerShell dry-run passed |
| RC2 package/engine/CLI/release identity | PASS | Current release-consistency tests; version 1.0.0-rc.2 |
| RC2 Linux typecheck/build/regression | PASS within environment | 293 tests pass; the remaining Windows PowerShell execution is unavailable |
| RC2 focused submission tests | PASS | 44/44 on Linux Node 24.19.0 |
| RC2 benchmark regeneration | PASS | Identical regeneration; only engine metadata differs from RC1; ground truth unchanged |
| Runtime dependencies and lockfile | PASS | Zero runtime dependencies; unchanged locked development dependencies |
| RC2 clean dependency installation | PASS | Independent isolated Windows Node 22.23.2 verification ran locked npm ci |
| RC2 Windows release dry-run | PASS | Independent native PowerShell run: RC2, Node 22.23.2 x64, DRY_RUN_OK; no directory/archive created |
| Actual Node 22 execution | PASS | Official Node 22.23.2 x64 with checksum verified: 294/294 complete, 44/44 focused, 24/24 release/migration; NODE22_RC2_CHECK_PASSED |
| Current dependency vulnerability audit | PENDING | Not rerun during this offline release-preparation pass; historical results are not a current audit |
| Historical dashboard security/fixtures | PASS for engineering basis | Existing regression checks retained; no UI redesign in RC2 |
| Real assistive-technology / physical-device review | OWNER | Human/device evaluation remains separate |
| Judge-comprehension review | OWNER | Independent human review required |
| Public software license decision | BLOCKED | UNLICENSED; all rights reserved |
| New portable Windows x64 build and checksum | PENDING | Final native-Windows build from frozen commit/tag via supplied handoff; never reuse RC1 bytes/checksum |
| Portable second-laptop review | OWNER | Applies to the newly generated portable package when authorized |
| Publication, deployment and challenge submission | BLOCKED | No authorization in this task |

Final independent Windows verification on 2026-09-26 preserved product source and
benchmark bytes. RC2 is frozen locally under annotated tag `v1.0.0-rc.2`; further
core changes require a confirmed defect, failed release verification or an explicit
new post-challenge development decision. Raw QA transcripts, temporary paths and
local machine information are private release evidence, not product source. The
source handoff preserves Git history; Git metadata is not a runtime distribution payload.
