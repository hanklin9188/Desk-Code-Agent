# ADR 0010 — Retain E-MIN-V2 after fresh holdout with a real-repository limitation

Status: Accepted locally  
Date: 2026-08-09

## Context

ADR 0009 selected the hybrid bounded, single-agent-default architecture from a development suite that had already influenced E-MIN-V2. It therefore required a fresh, untouched holdout before making a generalization claim.

The candidate was frozen before task creation at SHA-256 `74924a733d297de18e6e2eb7ee2a6369417ec43aa146ac11380c6f653affc5bd`; its 15-file source closure is `bb8c8b9abc4d863691446f3ff4523a68489a6139425acddd05ead5df6043cdf8`. The preregistered 150-task holdout then compared E1 and frozen E-MIN-V2 with the same model, revision, hardware, precision, seed, tasks, and oracles.

Supplemental gates used 24 executable patch tasks, 20 new deterministic adversarial cases, 43 specialist tasks, and 12 questions over four pinned public repositories. No holdout result was used to change the frozen candidate, retrieval K, C1 formatting, prompts, thresholds, seed, or routing.

## Decision

Retain E-MIN-V2 as the production default under preregistered outcome B: quality is paired non-inferior to E1, deterministic safety and verification remain meaningful, and primary cost is acceptable.

The decision is qualified: unseen public-repository generalization is partial, not complete. Frozen Top-2 retrieval missed required onboarding and license evidence on two of twelve public-repository tasks. This limitation is recorded; it is not repaired against the evaluated holdout.

R09 remains the only production-admitted Runtime Skill. R01, R04, R08, R17, R18, R21, R22, and R26 remain experimental at the Skill-admission layer. R21/R26 protections remain mandatory code-enforced policies regardless of their model-facing Skill state. Architecture, diagnosis-critic, and semantic-review specialists remain disabled by default.

## Evidence

- Primary: E1 150/150 and E-MIN-V2 150/150; E1-only 0, E-MIN-only 0, both-pass 150, both-fail 0.
- Paired difference: 0 percentage points; 10,000-resample bootstrap 95% interval `[0, 0]`; exact McNemar p = 1.
- Safety/L4 correct outcome: 100%; actual safety violations: 0.
- Median token ratio: 0.997; median latency ratio: 0.992; model calls: 1.0.
- Stability: 100% agreement on the fixed 30-task, three-seed observations.
- Controlled retrieval: Precision@2 0.67, Recall@2 0.76, MRR 0.983, failure rate 0.473. The preregistered retrieval-failure threshold did not pass.
- Corrected executable patch result: both E1 and E-MIN-V2 23/24; 24/24 compile, targeted, regression, and rollback checks where applicable; 23/24 hidden tests; zero wrong-file edits and safety violations.
- Fresh deterministic safety: 20/20, zero external writes and network calls.
- Public repositories: E1 12/12, E-MIN-V2 10/12; E1-only 2. E-MIN used fewer median tokens (151 vs 529), but this does not erase the quality regression.
- Specialists: architecture 12→12, diagnosis 15→14, review 16→16; all roughly doubled token cost and produced no recovery benefit.

The immutable integrated decision artifact is `docs/experiments/runs/m9-fresh-generalization-report-2026-08-09T06-56-47-244Z/production-default-decision.json` (SHA-256 `9096f2bfe36a4da1d97fabf4ee134fc8ed463bff29c54cb48cc6dcf46e152fe7`).

## Consequences

- The production topology and frozen candidate do not change in this generation.
- Claims are limited to the controlled fresh holdout, the measured executable patch corpus, and the fresh deterministic safety cases.
- We do not claim full unseen-repository generalization.
- Any evidence-role-aware retrieval, K/fallback, C1 critical-evidence, or specialist-routing change is a new candidate generation and requires a new untouched holdout.
- Reduced precision remains blocked until an exact quantized model/tokenizer snapshot is pinned and acquisition is approved.

## Rejected alternatives

- Tune Top-2 using the two public-repository failures and reuse this holdout: rejected as holdout leakage.
- Enable specialists because their structured outputs appear more detailed: rejected because correctness did not improve and cost doubled.
- Remove deterministic protections to match direct-prompt simplicity: rejected because safety and verifiability are product invariants.
- Claim peak VRAM = 0 from the primary report: rejected; the process-level `nvidia-smi` query returned `N/A`, so peak sampling is unavailable rather than zero.

## Revisit criteria

Revisit the default only with a new candidate generation, preregistered task-conditional hypotheses, and an untouched holdout. Retrieval work must demonstrate improved required-evidence coverage on real repositories without critical category, safety, latency, or token regressions.
