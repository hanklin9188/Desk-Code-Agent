# ADR 0011 — Retain E-MIN-V2 after frozen E-MIN-V3 and untouched G2

Status: Accepted locally  
Date: 2026-08-09

## Context

ADR 0010 identified symbol-Top-2 failures on documentation and metadata. A new development program implemented deterministic evidence classification, isolated retriever families, coverage, one fallback, and C1/C1+ before freezing E-MIN-V3 at `7b8829aded41cc996785ce5197627a4b712991d526b7e9e3045b3bf3f9d91be0`, closure `e307862f7728ac6bc90b231c23b7562cbb5d114aaed3af77200a2c7b77a3a76b`.

The 210-task G2 suite was preregistered, authored, sealed, dry-validated, and run without changing candidates or sealed inputs.

## Decision

Retain E-MIN-V2 as production default. Preserve E-MIN-V3 as frozen, non-promoted development evidence.

G2 task success was 210/210 for E1, V2, and V3: difference 0 points, bootstrap 95% `[0,0]`, McNemar p = 1. V3 failed the material-improvement gate. Median total tokens were 217 versus V2's 152, a 42.76% overhead that failed the 20% gate. Safety, schema, bounded-fallback, and no-critical-regression gates passed.

V3's acquisition result was material but insufficient for promotion: completeness 100% versus 14.29%, recall 100% versus 16.67%, Precision@K/MRR 0.9524 versus 0.1905, and fallback 2.38% versus 64.29%.

## Benchmark diagnosis

G2 had a task-success ceiling. Correct options used bounded/safe language while decoys proposed bypass, obsolete evidence, or unrelated expansion. The model could choose without required evidence. This is recorded after the immutable run; G2 is not edited or rerun as untouched.

## Consequences

- E-MIN-V2 and R09:C1 remain shipped/default.
- V3, G2 manifest/oracle/seal, and results remain immutable evidence.
- Task-aware retrieval is not silently enabled through a UI/config alias.
- G2 may not tune a future candidate; E-MIN-V4 requires a new freeze and G3 with semantically matched options.
- Windows installer, signing, root license, and source revision remain separate release gates.

## Rejected alternatives

- Promote solely on retrieval metrics: rejected because end-to-end/cost gates failed.
- Rewrite G2 choices and call a rerun untouched: rejected as leakage.
- Treat V2 100% as proof evidence is unnecessary: rejected because V2 completeness/recall were independently poor and option cues explain the ceiling.
