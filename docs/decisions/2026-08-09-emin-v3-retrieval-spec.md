# E-MIN-V3 retrieval development specification

Status: IMPLEMENTATION / DEVELOPMENT ONLY  
Baseline: immutable E-MIN-V2  
Decision owner: local evaluation; production promotion requires frozen evidence and a new holdout

## Problem

E-MIN-V2 is non-inferior on Fresh Holdout G1 but its Symbol Top-2 policy misses documentation, metadata, build, and multi-class evidence. Its G1 required-evidence failure rate is 47.33%, and it scored 10/12 on the pinned four-repository supplement versus E1 at 12/12. Increasing K is not an acceptable solution because prior experiments showed context noise can reduce Qwen task success.

## Acceptance criteria

1. E-MIN-V2 artifact and its 15-file source closure continue to validate byte-for-byte.
2. The deterministic classifier emits at most three atomic evidence classes, one primary class, bounded symbols, a primary budget of two, and one maximum fallback round.
3. Retriever families cover SYMBOL, TEST, DOCUMENTATION, METADATA, BUILD, ARCHITECTURE, and GIT through one compact interface.
4. R0, R1, R2, and R3 are compared on at least 200 development tasks with hidden required-evidence sets stored separately from task inputs.
5. Retrieval reports include evidence-set completeness, Precision/Recall/MRR, class coverage, fallback, duplicates, irrelevant tokens, retrieved tokens, and latency, stratified by evidence class.
6. A separate L3-heavy hard development benchmark measures repository reasoning, not prompt length.
7. E-MIN-V3 remains single-call, single-agent, reviewer-off, with C1/C1+ context no larger than the frozen budget.
8. A candidate can freeze only if retrieval evidence improves required-evidence coverage and end-to-end evidence-dependent success without a critical class regression, safety violation, or more than 20% token overhead.
9. Holdout G2 is preregistered and authored only after the candidate is frozen; none of G1, the original 108 tasks, development tasks, hard tasks, or original four public-repository tasks may be reused.

## Module and interfaces

`services/task-aware-retrieval` is a new generation-specific deep module. It owns classification, family ranking, deterministic class coverage, one fallback, deduplication, and C1+ packaging. It does not alter `services/repo-intelligence`, `services/harness-runtime`, or any frozen E-MIN-V2 source-closure file.

The model receives only task text and minimal primary/supporting evidence. Rankings, coverage, policy metadata, hidden evidence sets, and internal IDs remain runtime artifacts.

## Out of scope

- No semantic embeddings or new model snapshot.
- No extra evidence-classification LLM call.
- No global Multi-Agent or semantic Reviewer rerun.
- No Git/GitHub publication, signing, release, or owner license selection.
- No use of development outcomes as fresh generalization evidence.

## Security and rollback

Repository text remains untrusted and is redacted before context packaging. Retrieval is read-only. E-MIN-V3 is isolated by new paths and can be disabled by selecting the unchanged E-MIN-V2 configuration. Deterministic patch, verification, approval, and rollback controls remain independent from model quality.
