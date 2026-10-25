# 90-second walkthrough script

For the DOO submission video. Record the hosted demo in a browser plus one terminal.
A longer 3–5 minute version is in [LOOM_SCRIPT.md](LOOM_SCRIPT.md).

**Before recording:** open the live demo, and in a terminal run `npm ci` and
`npm run build` once so `npm run failure-test` starts instantly.

| Time | Show | Say |
|------|------|-----|
| 0:00–0:12 | Demo top of page | "Agents remember things. Some of it is outdated, some is a guess, and some should never have been kept. Tamhees checks a memory *before* it's allowed to guide an action." |
| 0:12–0:30 | **Live audit → Repository changed → Check whether the AI may act** | "The agent remembers 'use SQLite', but the repo now uses Supabase. Result: **BLOCK_ACTION**. The memory is withheld from context and the agent is told to ask which decision is current." |
| 0:30–0:52 | **AI guessed without approval → Check** (the "I'm not sure" moment) | "Here the memory is a confident AI guess. Tamhees still shows it to the agent, but labelled **INFERRED, ask owner**. In plain words: *I might be wrong about this; confirm before changing anything.* High confidence never counts as approval." |
| 0:52–1:02 | **Memory became stale → Check** | "Past its review date, so it's **RECHECK**: verify before trusting." |
| 1:02–1:20 | Terminal: `npm run failure-test`, then scroll to *Privacy revocation* and *Summary* | "The same engine through the real CLI. When I revoke a personal memory, the raw text is erased from every file, including the archive and audit log. Only a tombstone remains. A secret-like value is refused before it's ever stored." |
| 1:20–1:30 | Architecture snapshot or benchmark section | "Write, retrieve, forget: deterministic, local, no AI API. Memory you can question, correct and overrule. That's Tamhees." |

**Tips:** keep the cursor on each result headline for a second; zoom the browser to
110–125% so the outcome labels are readable in the video.
