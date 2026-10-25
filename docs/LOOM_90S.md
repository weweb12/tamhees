# 90-second walkthrough script

This matches the captioned submission video scene for scene, so the captions double as a
voice-over script if you re-record with narration. Everything shown is the real demo and
the real CLI output. A longer 3–5 minute version is in [LOOM_SCRIPT.md](LOOM_SCRIPT.md).

**Before recording:** open the live demo at 1280×720 or larger (browser zoom 110–125% helps
readability), and run `npm ci && npm run build` once so `npm run failure-test` starts
instantly.

| Time | Show | Say (caption) |
|------|------|-----|
| 0:00–0:06 | Title card | "Memory that knows it might be wrong. Tamhees checks what a coding agent remembers before that memory is allowed to guide an action." |
| 0:06–0:13 | Top of the demo | "Coding agents remember your project. Some of it is outdated, some is a guess, and some should never have been kept." |
| 0:13–0:20 | **Inspector**, before checking | "These are memories the agent is confident about. Nobody has told it the project changed." |
| 0:20–0:24 | Click **Let Tamhees check the repository** | "Tamhees reads the project's own files and checks each claim by itself." |
| 0:24–0:33 | The SQLite memory, now red | "'Uses SQLite' was trusted. The project now uses Supabase, so it is BLOCKED and withheld from the agent." |
| 0:33–0:39 | The Jest and build-script memories | "The wrong test tool and a missing build script are caught the same way. Nothing is guessed." |
| 0:39–0:49 | The owner's memory → click **Forget** | "Some memories are about you, the owner. 'Forget that' really forgets: the text is erased, only a tombstone remains, and the agent can no longer see it." |
| 0:49–1:09 | **Live audit → AI guessed without approval → Check whether the AI may act** | "The 'I might be wrong' moment: a confident AI guess about what the owner wants. High confidence is not approval. The agent may look and explain, but must ask the owner before changing anything." |
| 1:09–1:22 | Terminal: `npm run failure-test` | "The same engine from the command line: six ways memory goes wrong, each one tested." |
| 1:22–1:30 | End card | "Memory under scrutiny. Write, retrieve, forget, notice. Deterministic, local, no AI API, 400+ tests. Give the agent context. Keep the right to doubt it." |

**Tips:** pause a second on each result before moving on; if you narrate, the captions
can be read almost word for word.
