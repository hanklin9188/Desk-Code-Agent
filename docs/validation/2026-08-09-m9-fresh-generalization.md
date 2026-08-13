# M9 fresh generalization and product-default validation — 2026-08-09

Status: **PRIMARY GATE PASS / E-MIN-V2 RETAINED WITH LIMITATION**.

## Frozen candidate

- Candidate: E-MIN-V2.
- Frozen artifact: `config/production/emin-v2-frozen-2026-08-09.json`.
- Artifact SHA-256: `74924a733d297de18e6e2eb7ee2a6369417ec43aa146ac11380c6f653affc5bd`.
- Source-closure SHA-256: `bb8c8b9abc4d863691446f3ff4523a68489a6139425acddd05ead5df6043cdf8`.
- Holdout seal SHA-256: `40edbccaffdbb22022633cbb97d5a8c1eda45012596ecac0b77df14f3ab3616e`.
- Model/tokenizer revision: Qwen/Qwen3.5-4B `851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a`.
- Runtime: vLLM 0.26.0, BF16, thinking disabled, temperature 0, RTX 4080 SUPER.

The candidate, task generator, oracle, prompts, K=2, C1, seed policy, thresholds, and decoding settings were frozen before the first accepted primary request and were not changed after outcomes.

## Fresh holdout

150 unique tasks: Coding 45, Diagnosis 25, Repository navigation 25, Review 16, Analysis 15, Safety 24. Difficulty: L1 24, L2 42, L3 66, L4 18. All required subcategories and five independent provenance classes are represented. The maximum within-holdout token-set Jaccard was 0.690; maximum overlap with the prior 108-task suite was 0.114.

Primary run: `m9-fresh-holdout-g1-2026-08-09T06-37-31-981Z`. It executed 300 primary calls and 120 preregistered stability calls with no post-start exclusions.

## E1 fresh result

- 150/150, 100%; Wilson 95% CI `[0.9750, 1.0000]`.
- Median/p95 tokens: 302/318.
- Median/p95 latency: 345.132/389.898 ms.
- Median/p95 TTFT: 57.554/81.540 ms.
- Mean/median model calls: 1/1.
- Actual safety violations: 0; correct L4 report-only: 18/18; unnecessary refusals: 2.

## E-MIN-V2 fresh result

- 150/150, 100%; Wilson 95% CI `[0.9750, 1.0000]`.
- Median/p95 tokens: 301/317.
- Median/p95 latency: 342.473/388.591 ms.
- Median/p95 TTFT: 56.420/82.378 ms.
- Mean/median model calls: 1/1; mean/median tool calls: 2/2.
- Actual safety violations: 0; correct L4 report-only: 18/18; unnecessary refusals: 2.

## Paired comparison

- E1-only wins: 0.
- E-MIN-only wins: 0.
- Both pass: 150.
- Both fail: 0.
- Difference: 0 pp; paired bootstrap 95% CI `[0, 0]`; exact McNemar p = 1.
- Fixed 30-task stability subset agreement across seeds 20260809, 17, and 29: 100%.
- Preregistered product rule: `B_RETAIN_NONINFERIOR_SAFER`.

Every category and every difficulty stratum was 100% for both configurations. This does not imply the task distribution was maximally difficult; the supplemental real-repository result below is therefore part of the claim boundary.

## Retrieval generalization

Controlled holdout Symbol Top-2/declared fallback: Precision@2 0.670, Recall@2 0.760, MRR 0.983, median first relevant rank 1, missing first relevant 0, fallback 3.33%, fallback success 100%, irrelevant-token ratio 0.240, and full-required-evidence failure rate 47.33%.

The MRR hypothesis passed, but the preregistered retrieval-failure threshold ≤10% failed. On four pinned public repositories, E-MIN Recall@2 was 0.514 with a 66.7% fallback rate. Failures were:

- `real-p-limit-overview`: Top-2 returned `index.d.ts` and `test.js` but omitted required `index.js`.
- `real-sample-license`: fallback returned no license evidence.

No K, fallback, prompt, or context change was made. See immutable `fresh-retrieval-report.json` SHA-256 `39fa21c20d911bada7a459906e50bedea64dedc54b820f598d0674cd64d6c00b`.

## Context generalization

C1 produced zero attributable failures on the 150 controlled tasks, although the evaluator flagged missing caller (71), test (51), callee (11), and metadata (7) roles. The public-repository supplement had 2/12 evidence/context-attributable failures. C1 is therefore `MIXED`: effective on the controlled holdout, incomplete for two real repository intents. The frozen 1,000-token cap and formatting remain unchanged.

## Safety generalization

- Model-facing Safety: 24/24 for both configurations.
- L4: 18/18 for both configurations.
- Deterministic adversarial execution: 20/20, zero actual violations, external writes, or network calls.
- Covered README/source/issue/fake SYSTEM/encoded injection, shell metacharacters, symlink and traversal, secret redaction, GitHub redirection, fake/expired/mismatched/replayed approvals, patch allowlists/budgets, and `NOT_RUN ≠ PASS`.

## Real patch corpus

The sealed corpus has 24 changes across six TypeScript/Python/mixed repository families. E1 and E-MIN-V2 each selected 23/24 correct patches and finished 23/24 hidden-test verified. Both had 24/24 schema validity, application, compile, targeted tests, regression tests, correct-file selection, and rollback correctness, with zero wrong-file edits, unnecessary lines, or safety violations.

The initial execution artifact (`116eef...`) is preserved but invalid for Python test success because file-path unittest invocation changed the import root. The corrected artifact (`d3754d60...`) replayed the stored 48 selections with zero model calls and module-invoked tests; prompts, selections, tasks, and oracles did not change.

## Real repositories

Four license-compatible public repositories were pinned read-only at exact commits: p-limit, Click, full-stack-fastapi-template, and sampleproject; 438 files, 62,432 LOC, and 12 tasks. E1 scored 12/12. E-MIN-V2 scored 10/12 with paired E1-only 2, E-MIN-only 0, both pass 10. E-MIN median tokens were 151 versus 529 and latency 405.057 versus 412.087 ms.

This supports partial navigation/analysis generalization, not full unseen-repository generalization. All four worktrees remained clean at the pinned commits.

## Specialist multi-agent results

- Architecture, 12 tasks: single 12/12; specialist 12/12; median tokens 636.5→1326; unsupported evidence selections 9→10.
- Difficult diagnosis, 15 triggered tasks: no escalation 15/15; critic 14/15; recovery 0; introduced regression 1; median tokens 637→1306.
- Explicit review, 16 tasks: machine-only 16/16; reviewer 16/16; regression detections 0; median tokens 646.5→1332.5.

All three remain experimental and global multi-agent remains disabled. The first specialist run is preserved as invalid because vLLM rejected unsupported JSON Schema `uniqueItems` before inference; the corrected run changed only schema compatibility.

## Fresh Skill admissions

R09 remains production for task-conditional C1 packaging with traceable omissions. No new Skill was promoted. R01, R04, R08, R17, R18, R21, R22, and R26 remain experimental. R21/R26 protections remain code-enforced and cannot be disabled merely to manufacture an unsafe control arm. The frozen admission registry was not changed after holdout.

## Cost and VRAM

Primary E-MIN/E1 median ratios: tokens 0.997; latency 0.992; calls 1.0. Patch E-MIN cost was modestly higher (603 vs 557.5 median tokens; 415 vs 375 ms). Specialist paths roughly doubled tokens and latency without benefit.

The primary report's peak VRAM value `0` is an invalid sampler result, not zero use: this driver exposes compute-process memory as `N/A`. A post-run device observation while vLLM was resident was 12,358 MiB used of 16,376 MiB, but it is not a peak measurement. Peak VRAM is therefore `UNAVAILABLE_SAMPLER_INCOMPATIBLE` and must not be claimed.

## Production decision

Retain E-MIN-V2 under preregistered decision B, with the public-repository retrieval limitation explicitly recorded. ADR 0010 governs. No frozen architecture or production routing changed in this evaluation generation.

## UI/product QA

M8 run `m8-ui-performance-2026-08-09T06-54-15-004Z` passed: 100,000-event replay in 454.454 ms, 220,044 events/s, 2,000 retained UI rows, zero truth events dropped; render median/p95 1.206/2.347 ms; reduced motion and automated accessibility PASS. Manual color contrast, Windows screen reader, Windows installer, and native package QA remain unexecuted external/platform gates.

## M10 and remaining blockers

- Quantization experiment is prepared but `BLOCKED_APPROVAL`: no pinned reduced-precision snapshot was acquired or substituted.
- Linux native packaging is blocked by missing administrator-installed system libraries.
- Windows installer, keyboard, screen-reader, upgrade, uninstall, and signing QA require a Windows host/certificate.
- Source commit, remote configuration, push, PR, tag, release, and external delivery remain approval-gated and were not performed.
- Peak VRAM must be measured with a compatible device-level sampler in a future preregistered run.

The integrated immutable report directory is `docs/experiments/runs/m9-fresh-generalization-report-2026-08-09T06-56-47-244Z`.
