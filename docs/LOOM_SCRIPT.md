# Tamhees 3-5 minute walkthrough script

Do not record or upload from this task. This is the exact owner-facing script
for a later authorized recording.

## 0:00-0:35 - Problem

**Say:** “A project memory file improves continuity, but it can also preserve
stale decisions, AI guesses, contradictions, or sensitive content. More memory
is not automatically safer memory.”

**Show:** The opening Tamhees page and the three problem cards.

## 0:35-1:10 - Scrutiny before action

**Say:** “Tamhees checks source, freshness, current evidence, privacy, and
permission before remembered information can guide an action.”

**Interact:** Select **Watch one memory get checked**, pause once, then play.

**Expected:** The SQLite claim meets current Supabase evidence and ends at
`BLOCK_ACTION`, context exclusion, and an owner question.

## 1:10-1:55 - Exact CLI path

**Say:** “This guided lesson uses fixed safe fixtures and exact CLI syntax. The
page cannot run a shell or accept arbitrary commands.”

**Interact:** In **Guided CLI demonstration**, select **Run full demo**.

**Expected commands:**

```text
tamhees init
tamhees memory apply --input <safe-memory-fixture>
tamhees evidence add --input <safe-evidence-fixture>
tamhees audit
tamhees context --task "prepare the database migration"
```

**Expected:** The audit blocks the conflicting action and the context command
selects zero unsafe records.

## 1:55-2:50 - Real live audit

**Interact:** Choose **Repository changed**, then select
**Check whether the AI may act**.

**Say:** “The interface does not select this result. The local canonical audit
and context engine calculates it.”

**Expected:** `BLOCK_ACTION`, rule `DM-RULE-CONFLICT-001`, contradictory
evidence, no selected context, and an owner-resolution next step.

Briefly choose **Sensitive value appeared** and run it.

**Expected:** `FORGET_OR_REDACT`; no secret-like value appears.

## 2:50-3:35 - Integrations and evidence

**Say:** “Five adapters—Codex, Antigravity, Claude Code, generic, and local
stdio MCP—share one engine. Tamhees has zero runtime dependencies and makes no
runtime network request except its loopback-only dashboard.”

**Show:** Integrations, then benchmark evidence.

**Say:** “On 22 fixed scenarios, Tamhees produced the expected safe outcome 22
times. This proves deterministic fixture behavior, not universal superiority.”

## 3:35-4:00 - Close

**Say:** “Tamhees gives an agent useful project context while preserving the
right to doubt, recheck, block, redact, or ask the owner. Memory under
scrutiny.”
