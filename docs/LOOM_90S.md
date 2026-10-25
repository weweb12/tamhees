# 90-second walkthrough script

This matches the captioned submission video scene for scene, so the captions double as a
voice-over script if you re-record with narration. Everything shown is the real front page
of the demo and the real CLI output. A longer 3–5 minute version is in
[LOOM_SCRIPT.md](LOOM_SCRIPT.md).

**Before recording:** open the live demo at 1280×720 or larger, and run
`npm ci && npm run build` once so `npm run failure-test` starts instantly.

| Time | Show | Say (caption) |
|------|------|-----|
| 0:00–0:06 | Title card | "Memory that knows it might be wrong. Tamhees checks what a coding agent remembers before that memory is allowed to guide an action." |
| 0:06–0:16 | Front page, then *The problem in one picture* | "Coding agents remember your project between sessions. When the project changes, that memory goes stale, and the agent becomes confidently wrong." |
| 0:16–0:23 | Step 1, before checking | "These memories look safe. The project has changed since, but nobody told the agent." |
| 0:23–0:38 | Click **Let Tamhees check the project** | "Tamhees reads the project's own files. 'Uses SQLite' is now blocked: the project uses Supabase. A deleted file is caught too, and React is confirmed. The agent never sees the blocked memories." |
| 0:38–0:48 | Step 2 → click **Forget this** | "Some memories are about you, the owner. 'Forget that' really forgets: the text is erased for good, and only a tombstone remains." |
| 0:48–1:00 | Step 3 → click **Can the agent redesign the app based on this?** | "The 'I might be wrong' moment: the agent is very sure about a guess. High confidence is not your approval. The agent may look and explain, but must ask you before changing anything." |
| 1:00–1:20 | Terminal: `npm run failure-test` | "The same engine from the command line: six ways memory goes wrong, each one tested." |
| 1:20–1:29 | End card | "Memory under scrutiny. Write, retrieve, forget, notice. Deterministic, local, no AI API, 400+ tests. Give the agent context. Keep the right to doubt it." |

**Tips:** pause a second on each result before moving on; if you narrate, the captions
can be read almost word for word.
