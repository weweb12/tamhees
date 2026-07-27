# Tamhees Version 1 release checklist

Status legend: **PASS** is mechanically or locally verified; **OWNER** requires
owner-controlled evidence; **BLOCKED** prevents public release.

| Gate | Status | Evidence |
|---|---|---|
| Identity, CLI, storage, adapters, and MCP consistency | PASS | Automated release checks and complete suite |
| Clean `npm ci`, typecheck, build, and tests | PASS | Isolated clean-copy verification |
| Zero runtime dependencies; two approved direct dev dependencies | PASS | `npm ls --all`, lockfile review |
| Dependency vulnerability audit | PASS | `npm audit` on the existing lockfile |
| CLI and isolated lifecycle/migration smoke | PASS | Release smoke transcript |
| Dashboard security and seven canonical fixtures | PASS | Focused suite and browser review |
| Benchmark exact-byte regeneration | PASS | Two SHA-256-identical generations |
| Clean install and project-local removal | PASS | Isolated-copy and exact-path cleanup |
| Threat model and license/notice documentation | PASS | `docs/THREAT_MODEL.md`, `THIRD_PARTY_NOTICES.md` |
| Node 22 baseline execution | OWNER | Node 22 is not installed on this machine |
| Real assistive-technology review | OWNER | Screen reader/AT owner session required |
| Physical desktop/mobile device review | OWNER | Owner-controlled devices required |
| Judge-comprehension review | OWNER | Independent human review required |
| Public software license decision | BLOCKED | Package remains `UNLICENSED`; all rights reserved |
| Private portable Windows x64 second-laptop review | OWNER | Local generation and no-install smoke are authorized after the checkpoint; owner hardware review remains |
| Publication, deployment, upload, and challenge submission | BLOCKED | Separate explicit owner authorization required |

The release candidate may not be called final Version 1 while an owner or
blocked gate remains.
