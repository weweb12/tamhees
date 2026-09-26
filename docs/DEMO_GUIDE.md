# Tamhees judge demonstration guide

## The problem in one minute

A monolithic `GPTBrain.md`-style file can preserve useful continuity, but it
mixes current facts with stale decisions, AI inference, sensitive content, and
revoked instructions. Reading more memory does not prove that the memory is
safe or authorized.

Tamhees is a local deterministic scrutiny layer. It stores claims with
provenance, evidence, freshness, privacy, and action permission; audits them
before use; and gives an agent only a small task-relevant context pack.

## Five-minute path

1. Run `npm ci`, then `npm run verify`.
2. Start `npm run dashboard` and open the exact printed loopback URL.
3. In the hero, select **Watch one memory get checked**. Pause and resume the
   animation to show that the final safety state remains understandable.
4. In **Guided CLI demonstration**, select **Run full demo**. The five
   allowlisted presentation steps mirror exact Tamhees commands but cannot run a
   shell or accept arbitrary input.
5. In **Live local demonstration**, choose **Repository changed** and select
   **Check whether the AI may act**.
6. Point out `BLOCK_ACTION`: the old “Use SQLite” owner claim conflicts with
   current Supabase repository evidence. The agent may not continue the
   database-dependent change.
7. Show that the conflicted memory is excluded from ephemeral task context and
   the next step is to ask the owner which decision is current.
8. Briefly run the remaining six fixtures. They produce `RECHECK`,
   `BLOCK_ACTION`, `ASK_OWNER`, `FORGET_OR_REDACT`, and `TRUST` through the same
   canonical engine.
9. Open the benchmark explanation. It proves deterministic outcomes on 22 fixed
   fixtures, not universal model quality or market demand.

## One engine, five adapters

Codex, Antigravity, Claude Code, the generic adapter, and local stdio MCP call
the same lifecycle and context engine. They add no hosted service, interception
claim, account, telemetry, or runtime dependency.

## Honest limits

Retrieval is exact normalized lexical/tag matching; token counts are a
deterministic estimate; secret detection is pattern-based; adapters require
cooperation; and the dashboard uses safe fixed fixtures. Real
assistive-technology, physical-device, judge-comprehension, external-validity,
publication, and submission review remain owner gates.

## Engine applicability and bundle check

In a temporary initialized project, begin a lifecycle and put its returned ID in
`examples/finalize-with-evidence.json`. Finalize that file to create the parser
claim and repository evidence together. Request parser context with
`{"environment":"staging"}` via `--scope-input`: it is out-of-scope. Change the
file to `{"environment":"production"}`: the scoped claim becomes eligible,
subject to normal audit and relevance gates. The scope examples do not require
external services. Automated equivalents are in `test/submission-engineering.test.ts`.

The fixed dashboard fixtures do not demonstrate these new inputs; use the real
CLI or MCP workflow. Repository evidence is supplied by the external agent and
must truthfully describe its observation; the engine does not inspect files itself.
