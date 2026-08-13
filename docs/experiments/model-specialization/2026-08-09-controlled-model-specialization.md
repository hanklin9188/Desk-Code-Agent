# Controlled model-specialization experiment

Date: 2026-08-09  
Decision: **D — INCONCLUSIVE**  
Status: **baseline complete; candidate BLOCKED_APPROVAL; no holdout or routing change**

## Model Availability

Qwen3.5-4B was exact-snapshot verified and run. Qwen2.5-Coder-3B-Instruct was not present locally and was not downloaded; candidate calls = 0.

## Exact Revisions

- Qwen3.5-4B: `851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a`, BF16.
- Qwen2.5-Coder-3B-Instruct: `488639f1ff808d1d3d0ba301aef8c11461451ec5`, BF16 planned, not run. Its Qwen Research License permits non-commercial research/evaluation and requires a separate commercial license.

## Gateway Validation

Baseline passed load, models, ordinary, streaming, JSON schema, malformed handling, timeout, cancellation, sequential, queue, context cap, UTF-8/code/diff, and shutdown cleanup. Candidate: NOT_RUN/BLOCKED_APPROVAL.

## Task Understanding

Baseline 0/24 (0.00%). Candidate NOT_RUN.

## Oracle Context

Baseline 0/42 (0.00%). Candidate NOT_RUN.

## Navigation

Baseline 17/25 (68.00%); file Recall@2 100.00%, symbol 100.00%, test affinity 68.00%. Candidate NOT_RUN.

## Diagnosis

Baseline 2/25 (8.00%). Candidate NOT_RUN.

## Patch Generation

Baseline behavioral patch-only 0/25; all 25 required constrained apply, syntax, visible test, hidden test, correct-file policy, and rollback. Candidate NOT_RUN.

## Planning

Baseline 7/12 (58.33%). Candidate NOT_RUN.

## One-Shot End-to-End

Baseline frozen E-MIN-V2 0/25. Candidate NOT_RUN.

## Retry

Baseline maximum-two-call success 0/25; recoveries 0, contradiction rate 36.00%. Candidate NOT_RUN.

## Historical Behavioral Patch Results

G3 exact historical remained 0/60 for E1/V2/V3 but lacked behavioral oracles. G4 reference fixtures pass 25/25; prior Qwen patch-only was 0/12 and this controlled baseline was 0/25.

## Structured Output

Baseline non-retry schema validity 122/178 (68.54%); retry attempt validity 49/50 (98.00%). No repair was counted. Candidate NOT_RUN.

## Refusal Analysis

Baseline patch-only REPORT_ONLY = 25/25; one-shot REPORT_ONLY = 9/25; unnecessary-refusal rate 68.00%. Candidate NOT_RUN, so cause attribution remains unresolved.

## Safety

Baseline actual violations/wrong-file/rollback failures = 0/0/0. Fresh deterministic fuzz passed 1,000/1,000. Candidate model safety phase NOT_RUN; safety controls were not weakened.

## Latency

Baseline ordinary completion 403.77 ms; phase means are stored in the VRAM/latency report. Candidate NOT_RUN.

## TTFT

Baseline 69.78 ms. Candidate NOT_RUN.

## Throughput

Baseline 75.28 tokens/s. Candidate NOT_RUN.

## Peak VRAM

Baseline idle/peak 12020/12022 MiB; post-shutdown 0 MiB. Candidate NOT_RUN.

## Capability Matrix

The machine-readable matrix contains measured baseline values and null candidate cells. No values were inferred.

## Specialization Effect

Not estimable: candidate calls = 0. Conclusion D is mandatory; A/B/C would require paired candidate evidence.

## Fresh Holdout

Not created or inspected. The development promotion gate cannot be evaluated, so candidate freeze and the minimum-100 repository-disjoint holdout remain prohibited.

## Product Routing Decision

Unchanged: bounded planning SUPPORTED, complete-context navigation ASSISTED, diagnosis/coding/mutation/hidden-test autonomy REPORT_ONLY. No routing ADR was created.

## Need for 7B Experiment

Not warranted yet. The trigger is measured Coder-3B improvement, which is absent. No 7B model was selected or downloaded.

## Remaining External/Approval Blockers

- Explicit approval to download the pinned Coder-3B snapshot and owner acceptance of its non-commercial research license.
- Candidate smoke, 205-observation development comparison, and possible candidate freeze.
- Fresh holdout only if the frozen development gate passes.
- Existing release blockers: autonomous patch quality, source revision authority, root/dependency licensing, native Windows QA/signing, and protected delivery authority.

No model download, dependency installation, commit, remote, push, PR, tag, signing, release, holdout construction, or product routing change occurred.
