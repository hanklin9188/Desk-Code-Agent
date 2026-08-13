# Retrieval generalization, hard benchmark, and E-MIN-V3

Date: 2026-08-09  
Status: completed development program; E-MIN-V3 frozen but not promoted

## Evidence taxonomy

The deterministic classifier chooses at most three atomic evidence classes from task text and declared symbols. Candidate contents and hidden oracles are never inputs to classification.

| Class | Intended question | Isolated retriever family and canonical evidence |
|---|---|---|
| `SYMBOL` | Where is a function, class, method, caller, callee, or implementation? | Indexed definition, syntactic definition, exact symbol, then lexical source under code roots. |
| `TEST` | What does a test/spec assert or why does it fail? | Test/spec paths, source-test affinity, and test-runner configuration. |
| `DOCUMENTATION` | What do current usage, onboarding, README, or contributor instructions say? | Root README, `docs/`, and CONTRIBUTING; stale guides are penalized. |
| `METADATA` | What license, notice, version, manifest, or dependency metadata applies? | LICENSE/COPYING/NOTICE and canonical package manifests. |
| `BUILD` | How does the active build, install, CI, environment, or workflow run? | CI workflows, Make/CMake, Docker/Compose, and build-capable manifests. |
| `ARCHITECTURE` | What is the entry point, request flow, graph, or module boundary? | High-centrality entry modules and design documents with graph proximity. |
| `GIT` | Which history, blame, commit, or changelog evidence applies? | Git/history and changelog evidence. GIT is implemented but not in the six-atomic-class G2 balance. |
| `MIXED` | Which two or three evidence types must agree? | Round-robin atomic retrieval followed by at most one missing-class fallback. |

Frozen R2 retrieves at most two primary items plus one fallback, performs at most one fallback round, deduplicates by path plus content hash, and emits explicit coverage. C1/C1+ has a 1,000-token cap, equal-budget re-slicing, and an explicit truncation marker; critical evidence is never silently omitted.

## Development evidence

These are development/tuning suites, not holdouts.

| Suite | Result |
|---|---|
| Retrieval development, 224 tasks | R2: 224/224 task success and complete sets; Precision@K 0.9531, Recall@K 1.0, MRR 0.9531, fallback 2.23%, irrelevant-token ratio 4.39%, median total 149 tokens. |
| L3-heavy hard development, 140 tasks | R2: 140/140 task success; 134/140 complete sets, Precision@K 0.9357, Recall@K 0.9821, MRR 0.9429, fallback 2.14%, median total 167 tokens. The six incomplete sets are hard MIXED cases. |
| 12 pinned public repositories, 48 tasks | Exact frozen V3 closure: 47/48, schema 100%, completeness 75%, Recall@K 87.5%, MRR 75%, median prompt 894. The comparative run scored E1/V3 47/48 and V2 33/48. |
| Expanded executable patch, 60 instances | E1 and V3 both 58/60; correct file 60/60, rollback 60/60, wrong-file edits 0, safety violations 0. These are executable variants across 18 fixture IDs and eight archetypes, not 60 novel semantics. |

Artifact hashes:

- Development manifest `5ed2b0563283e4cb8d3c77e12c8ff1d3d1bc8ae9a2d33129b2a624e50b1879ba`.
- Hard manifest `05f7846eb2602b967b89fa2bb76d6d5802258c02700bccd59d27792747830b4d`.
- Real-repository manifest `570653c99bad83845c87ff98c8165059d5602c7f15be54a9bd0b3712270d29c5`.
- Expanded-patch manifest `7a098b43c9f15eafb87fb916e5791d4ccfeac200b51d6e90d84d52cdb8a3d6a1`.
- Frozen E-MIN-V3 `7b8829aded41cc996785ce5197627a4b712991d526b7e9e3045b3bf3f9d91be0`; 17-file closure `e307862f7728ac6bc90b231c23b7562cbb5d114aaed3af77200a2c7b77a3a76b`.

## Untouched G2

G2 was preregistered after the V3 freeze and before task authoring/model calls. It has 210 tasks: 30 per evidence need, 42 per task class, L1/L2/L3/L4 counts 21/49/105/35, 12 candidates each, balanced answers, a separate oracle, and no correct token outside its required set.

Seal chain:

- Preregistration `3b1d1524798a2ee4b3b044f962e56487a07d747a64d92ff28acb55bf161d1c5d`.
- Manifest `2f5dbd89e4495790ab59efb97a0f1cc3aefd785b3992bc413a56df9c1927eb22`; payload `8b8b071177b1b11733edeba4a7a3afd618805718bf8cbc13b4eb1fa875811726`.
- Oracle `a105d97ae037723245b237544127a3e769a5ff55e8b68654f00aee033d8a9f2f`; payload `a824505d794dddd83bb366a5babba19f4bd01275e97750881dd010b21702481a`.
- Suite seal `2b69c246d5b911bdc74cbe81370fb02f1466435a045381c75f61a48432d086d8`.
- Result `14703cff521f57cef1c284e977e5e3e970576ce075dae93d5325880ce115794c`.

All 630 calls completed with the same frozen model/revision, one call per task/configuration, temperature 0, seed 20260809, thinking/reviewer/multi-agent off, and schema-constrained output.

| Metric | E1 | E-MIN-V2 | E-MIN-V3 |
|---|---:|---:|---:|
| Task success | 210/210 | 210/210 | 210/210 |
| Model-facing evidence-set completeness | 100% | 14.29% | 100% |
| Required-evidence recall | 100% | 16.67% | 100% |
| Precision@K | 1.000 | 0.1905 | 0.9524 |
| MRR | 1.000 | 0.1905 | 0.9524 |
| Fallback rate | 0% | 64.29% | 2.38% |
| Median total tokens | 213 | 152 | 217 |
| Median latency | 323.927 ms | 276.221 ms | 328.095 ms |
| Schema validity / actual safety violations | 100% / 0 | 100% / 0 | 100% / 0 |

V3 versus V2 had no paired transitions, difference 0 points, bootstrap 95% `[0,0]`, and McNemar p = 1. G2 has a task-success ceiling: correct options used bounded/safe wording while decoys explicitly proposed bypass, obsolete evidence, or unrelated expansion. V2 could therefore answer correctly without required evidence. This is a benchmark limitation, not proof that missing evidence is harmless.

The preregistered decision remains binding: V3 did not deliver a 5-point task/target gain, and median-token overhead versus V2 was 42.76%, above the 20% gate. E-MIN-V2 remains production default. V3 materially improved acquisition but did not establish end-to-end improvement.

Do not edit/rerun G2 as untouched. A future E-MIN-V4 needs a new freeze and G3 with semantically matched options that cannot be solved from style/safety cues.
