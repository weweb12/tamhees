# Two-year thesis: agent memory done right

Tamhees started with one Markdown file. It made my coding agents better, until it grew
too large to trust. Old decisions, AI guesses and a pasted credential all sat side by
side, equally authoritative. The file gave continuity. It never gave verification.

Within two years, I expect memory to stop being a feature and become infrastructure.
Every agent will remember. The difference will be whether it remembers *responsibly*.
Three shifts follow.

**1. Memories become claims, not notes.** A useful memory will carry where it came
from, who confirmed it, when it was last checked, what it applies to, and what it is
allowed to authorize. "The owner prefers purple" written by an agent and "use Supabase"
confirmed by the owner are different kinds of things and must be stored that way.

**2. Doubt moves before action, not after the incident.** Retrieval will become a
checkpoint. Before memory guides a change, it gets compared with current evidence. A
contradiction blocks the action. An expired fact asks for a recheck. A confident guess
asks the owner. Saying "I might be wrong" is a safety feature, not a weakness.

**3. Forgetting becomes a first-class operation.** People will expect to ask "what do
you remember about me?" and "forget that", and to see it actually happen: raw text
erased, an auditable tombstone left behind. Agents that cannot forget will not be
trusted with anything worth remembering.

None of this needs a bigger model: just deterministic rules, provenance and a
human-readable audit trail. Memory that sits beside any agent, not inside one vendor,
also lets teams switch tools without losing their safeguards.

The goal is not an agent that remembers everything. It is an agent whose memory you can
question, correct and overrule. That is the difference between a tool and a colleague.
