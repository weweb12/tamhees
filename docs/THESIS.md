# Two-year thesis: agent memory done right

Tamhees started with one Markdown file, my "GPTBrain". It was amazing. My coding agent
remembered my project between sessions and made fewer mistakes. Then it grew. On
every task the agent had to read the whole file again, and I could see where that ends:
usage limits, slower answers, and the important line buried on page twenty. Old
decisions, guesses and things that were no longer true sat next to the real facts, all
looking equally certain.

The next two years make this problem much bigger. Agents will not be able to hold
one very large, complex project in their head. Now imagine two projects, or ten, each
changing every week. Reading everything every time will not work, and trusting everything
will be worse.

So memory done right, for me, means three things:

1. **Read less, check more.** The agent gets a small pack of what matters for this task,
   inside a hard budget, not the whole brain.
2. **Every memory knows how sure it is.** Where it came from, when it was last true, what
   it applies to, and whether it is allowed to change anything. A guess is labelled as a
   guess, and an AI can never promote its own guess to an owner decision.
3. **Memory notices when it is wrong.** When the project changes, old memory is checked
   against it and blocked, rechecked or forgotten before the agent acts. When the owner
   says "forget that", it is really gone.

None of this needs a bigger model: just rules that give the same answer every time, and
an audit trail a person can read.

Tamhees is my first step. It helps your coding agent stop hallucinating from bad memory
and avoid the mistakes that old or wrong memory causes. This is just the beginning
of the line.
