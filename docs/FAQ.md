# Frequently asked questions

## Is Tamhees another coding agent?

No. It is a local memory scrutiny engine used beside cooperative agents.

## Why is a normal memory file insufficient?

A file preserves text but does not prove provenance, currentness, privacy, or
permission. Tamhees makes those dimensions explicit and auditable.

## What happens before an agent acts?

Tamhees retrieves positively relevant records, audits privacy and authority,
ranks eligible context, enforces a hard whole-record budget, and explains every
selection or exclusion.

## Why does SQLite versus Supabase block?

The remembered SQLite decision materially conflicts with current repository
evidence for Supabase. Confidence cannot resolve that conflict, so the action is
blocked and the owner is asked.

## Can unsafe memory leak through context?

Known blocked, revoked, expired, conflicted, or privacy-prohibited records are
excluded. Secret-like detection is deliberately pattern-based and cannot
guarantee detection of every possible secret.

## Do adapters behave differently?

No. Codex, Antigravity, Claude Code, generic, and MCP adapters share the same
canonical begin/finalize lifecycle boundary. Managed instruction files preserve
user bytes and refuse tampering.

## Does the benchmark prove Tamhees is universally better?

No, and the results are not universal. It proves reproducible behavior on 22 fixed,
fixture-authored scenarios.
It separates precision, recall, authority, freshness, exposure, escalation,
abstention, budget, and exact outcome.

## Does Tamhees use AI APIs, cloud storage, telemetry, or accounts?

No. The product is local-only with zero runtime dependencies. The dashboard
binds to loopback and uses local assets.

## Can Tamhees tell by itself that a memory is wrong?

Partly, and deliberately conservatively. `tamhees observe` checks technology claims
against dependencies, lockfiles and config files, script claims against package.json,
and file paths against the project. It contradicts a technology only when a competing
one is present, and it skips negated or ambiguous statements instead of guessing.
Other claims still rely on evidence supplied by the agent or owner.

## How does the hosted demo work without a server?

The hosted pages are the same pages the local dashboard serves. Their API requests are
answered inside your browser by the compiled engine modules, so every audit and context
result is the real engine's, byte-identical to the local server. Nothing is sent anywhere.

## Is it security audited or production-certified?

No. It has automated adversarial tests and a local engineering threat model,
not a formal external audit or certification.

## What are the known limits?

Retrieval is lexical, widened only by fixed synonym and concept tables, not semantic.
Token counts are a deterministic estimate, not a vendor tokenizer. Secret detection is
pattern-based. Owner identity is declared, not cryptographically authenticated. Agents
have to cooperate and call Tamhees; it does not intercept them. See
[THREAT_MODEL.md](THREAT_MODEL.md) for the full list.
