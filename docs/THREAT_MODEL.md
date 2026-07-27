# Tamhees local threat model

## Scope

This is a concise engineering threat model for the local Version 1 release
candidate. It is not a formal external security audit or certification.

## Protected assets

- Canonical memory, evidence, audit, lifecycle, archive, and index artifacts.
- Owner authority and the distinction between evidence, observation, inference,
  and approval.
- Secret-like or sensitive input that must not enter retained memory or context.
- Source repository bytes, deterministic benchmark evidence, and local judge
  fixtures.

## Trust boundaries and assumptions

Tamhees trusts the local operating system, Node.js runtime, and an owner who
controls the project directory. Files, CLI input, adapter requests, MCP input,
and dashboard HTTP requests are untrusted. A local attacker who can arbitrarily
replace process memory, the Node runtime, or all project files is outside this
model; malformed or adversarial controlled artifacts inside the project remain
in scope.

## Principal threats and controls

| Threat | Control | Residual limitation |
|---|---|---|
| Traversal, symlinks, junctions, reparse points, or boundary escape | Resolved project boundary, path-safety checks, fixed controlled paths, link refusal, allowlisted artifacts | Filesystem guarantees vary; legacy migration documents best-effort rollback |
| Corrupt or unknown controlled artifacts | Strict schemas, unknown-field rejection, version checks, fail-closed reads | Recovery may require owner inspection |
| Authority escalation | Provenance/status invariants, owner-evidence requirements, controlled mutation policy | Cooperative tools cannot prove a human identity |
| Secret-like input | Pattern-based rejection/redaction before persistence and output | Pattern detection is defensive, not universal secret discovery |
| Interrupted lifecycle or migration | Progress journals, replay fingerprints, reconciliation, rollback validation | Storage loss or hostile concurrent mutation can require manual recovery |
| Adapter instruction tampering | Exact managed markers, byte preservation, modification refusal, project-local targets | Adapters are cooperative instructions, not enforcement over unrelated software |
| Malformed or abusive MCP input | Strict JSON-RPC schemas, initialization state, bounded line and duplicate-ID windows, stdio only | A local caller can still consume its own process resources within OS limits |
| Dashboard Host/Origin/body/route abuse | Loopback-only bind, exact Host and Origin checks, method/route/static allowlists, body limit, restrictive headers | No authentication is provided; other local processes can reach loopback |
| Benchmark substitution | Fixed fixture hash, committed artifact hash, strict validation, exact-byte regeneration | Fixture results do not establish external or universal validity |
| Browser injection or persistence | Text-node rendering, no unsafe HTML APIs, no inline executable content, no browser storage, local assets only | Browser and extension security remain platform responsibilities |

## Production-source review

The release gate scans for provider SDKs, network clients outside the approved
loopback server, telemetry, environment-dependent product behavior,
`child_process`, shell execution, `eval`, `Function`, unsafe DOM APIs, browser
persistence, hard-coded user paths, realistic credentials, and broad deletion.
Tests may spawn the local CLI and MCP process; the production engine does not.

## Operational guidance

Keep `.tamhees/` project-local, review proposed memory changes, treat
`ASK_OWNER`, `RECHECK`, `BLOCK_ACTION`, and `FORGET_OR_REDACT` as real gates,
and do not expose the loopback dashboard beyond the local machine. Back up
important projects before filesystem migration.
