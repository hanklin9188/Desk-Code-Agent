# G3 failure decomposition and G4 development report

Date: 2026-08-09  
Status: **COMPLETE — autonomous patch remains STOP-SHIP; no new candidate or holdout created**

## G3 Failure Causes

The revision-2 matrix contains 1,398 failures. Retrieval is the largest individual primary cause at 689 (49.28%). Task understanding is 387 (27.68%), patch generation 180 (12.88%), reasoning/output-contract failure 98 (7.01%), evidence composition 41 (2.93%), and policy block 3 (0.21%). The combined model-facing boundary is 706/1,398 (50.50%), slightly above retrieval. This taxonomy is post-hoc diagnostic evidence only and did not tune V2/V3.

## Historical Patch

The original exact metric remains 0/60 for E1, V2, and V3. "Exact" means constrained apply + language parser + byte-identical historical after-content + no unrelated edit + rollback. None of the 60 tasks has a pinned behavioral oracle, so old visible/hidden behavior is **NOT_AVAILABLE/NOT_RUN**, not measured 0%. The new G4 reference oracles validate 25/25 fixtures, while Qwen patch-only behavior is 0/12 and selected REPORT_ONLY on all 12.

## Onboarding

G3 binary 0/96 per candidate is preserved. Exact-path scoring misclassified location-qualified citations, and hash-only answer retention prevents honest retroactive semantic component scoring. On fresh G4 development with complete evidence and ten explicit components, exact-all is 0/24, component accuracy 0%, citation accuracy 23.75%, missing-component rate 16.67%, and schema validity 83.33%. All returned component statuses were NOT_ESTABLISHED, so all-or-nothing scoring is not the sole cause.

## Oracle Evidence Experiment

Normal retrieval passed 0/42; exact oracle evidence passed 1/42 (2.38%). Perfect evidence selection therefore does not remove the main failure boundary. Larger oracle contexts also reduced schema validity from 90.48% to 69.05%, confirming an evidence-composition/output-budget interaction rather than a retrieval-only problem.

## Navigation Ceiling

Strict success was task-only 0/12, exact-file 3/12, exact-symbol 0/12, and complete source+visible-test 6/12. Exact-file disclosure produced 11/12 correct paths but only 5/12 correct root causes. Navigation is assisted, not safe-default factual synthesis.

## Diagnosis Ceiling

Diagnosis-only passed 2/12 (16.67%); schema validity was 5/12. It remains REPORT_ONLY.

## Patch Generation Ceiling

Patch-only passed 0/12 behavior oracles despite exact root cause, relevant source, visible test, and target requirement. All 12 schema-valid responses chose REPORT_ONLY, so no patch reached compile or tests. Autonomous mutation remains disabled.

## Planning Ceiling

Structured planning passed 12/12 under complete evidence and machine-checked file/order/dependency/test fields. This supports only bounded read-only planning; it is not semantic implementation or behavior evidence.

## Retry Depth and E-ITER

1-call, maximum-2-call, and maximum-3-call each passed 0/12. Two calls used 2.238× mean tokens, recovered no failures, and contradicted the patch route in 100% of tasks. Maximum-3 stopped at mean 2 calls because no distinct verifier evidence remained. The preregistered E-ITER gate failed, so no candidate ID/hash was created.

## Long-Horizon V3 Analysis

V2/V3 transitions were both-pass 3, V2-only 0, V3-only 7, both-fail 26. Two V3-only passes came from complete initial evidence; five came from the task-aware initial evidence head start plus bounded evidence additions. The scorer measures status and exact citations, not patch behavior, so V3 remains unpromoted.

## Capability Ceiling and Product Tiers

- SUPPORTED: bounded structured planning only (12/12 development precision).
- ASSISTED: complete-context navigation (6/12).
- EXPERIMENTAL: none.
- REPORT_ONLY: diagnosis, onboarding, open-ended coding, hidden-test work, and all mutation.

Routing is deterministic and does not use model self-confidence.

## Stronger Model / Future Holdout

The controlled protocol is ready, but the stronger model is deliberately unselected and requires explicit approval before selection or acquisition. Candidate and future-holdout gates are frozen. Because no candidate qualified, the future G4 holdout was not created or inspected.

## Safety, UI, and Runtime Regression

Fresh regression runs passed: 100 index mutation cycles; security fuzz 1,000/1,000; UI soak 200,000 events with zero truth loss, reconnect failure, stale state, or duplicate notification. UI render p95 was 6.02 ms and peak RSS growth 228.01 MiB. The full design/type/test/build gate passed with 680 design files, zero warnings/errors, 22 test files, and 89 tests. The immutable selected crash-recovery PASS remains hash-verified.

## Remaining Blockers

Autonomous patch quality is stop-ship. No release, commit, remote, push, PR, tag, signing, model download, or holdout construction occurred. Stronger-model acquisition, Windows installer/accessibility/signing evidence, root-license/external metadata, and protected release authority remain external or approval-gated.
