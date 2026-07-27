# Benchmark baselines

The deterministic harness compares four local configurations in fixed order:

1. `NO_MEMORY` returns no memory.
2. `MONOLITHIC_GPTBRAIN` exposes the complete fixture set as one undifferentiated context.
3. `SIMPLE_SPLIT_FILES` performs deterministic lexical file-style matching without Tamhees audit policy.
4. `TAMHEES` invokes the production context compiler, including ranking, explanations, privacy filtering, and hard budget enforcement.

All configurations consume the same fixture records and expected relevance labels. No model, network call, or external service participates.
