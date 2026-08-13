# G3 generalization, reliability, and quality–cost validation

Date: 2026-08-09  
Results index: `benchmarks/g3/G3_RESULTS_INDEX.json` (fa9a4680cd409af1f9eb774fb2282d41147bcf6f165f23d8b8c719df5c43a063)  
Machine-readable report: `docs/experiments/G3_FINAL_REPORT.json` (83a0f971a2c5d8135e36dc97d917c21331843ac8ba2553ae7ea95056b5e1e3be)

## G3 Design

24 new pinned public repositories were split 6 development / 6 validation / 12 holdout at repository level. The corpus contains 5,166 files and 902,911 LOC across Python, JavaScript/TypeScript, Go, Rust, C/C++, and JVM projects. G3 contains 192 primary open-ended tasks (96 holdout), 36 long-horizon tasks, 60 executable historical patch tasks, a 192-task dedicated onboarding corpus, and a 48-task validation ablation subset. Primary difficulty distribution is L1 24, L2 72, L3 72, L4 24.

G2 is formally classified as a ceiling/regression benchmark: E1, V2, and V3 were each 210/210, with no pairwise discrimination and material option-cue risk. It remains useful for deterministic regression, safety, and reproducibility but not ranking or generalization claims.

## Cue Audit

The accepted authoring revision has 0 answer options, 0 lettered-option markers, 0 exact required-path leaks, and no model-visible category/difficulty field. Maximum pairwise prompt-token Jaccard is 0.8621, below the sealed 0.9 limit. Authoring v1 was rejected before sealing/model calls at Jaccard 1.0 and remains preserved.

## E1 vs V2 vs V3

| Configuration | Holdout success | Wilson 95% | Evidence complete | Required recall | Wrong-file outputs | Actual safety violations | Median tokens | Median latency |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| E1 | 6/96 (6.25%) | 2.90%–12.97% | 65.63% | 79.17% | 27 | 0 | 349 | 2134.9 ms |
| E-MIN-V2 | 3/96 (3.13%) | 1.07%–8.79% | 41.67% | 50.00% | 20 | 0 | 243 | 1848.8 ms |
| E-MIN-V3 | 2/96 (2.08%) | 0.57%–7.28% | 50.00% | 66.67% | 33 | 0 | 1176 | 2332.1 ms |

V3 versus V2 was -1.04% with candidate-only/baseline-only/both-pass/both-fail = 0/1/2/93; paired and repository-cluster bootstrap 95% intervals were both -3.13% to 0.00%, McNemar p=1. Safe-outcome accuracy was E1 20/48, E-MIN-V2 12/48, E-MIN-V3 18/48; actual unsafe mutation rate was 0 for all three. TTFT was not available from the non-streaming primary endpoint and is measured separately below.

## Long-Horizon Results

| Configuration | Final success | First attempt | Recovery / opportunities | Mean iterations | Repeated actions | Model calls | Total tokens |
|---|---:|---:|---:|---:|---:|---:|---:|
| E1 | 6/36 | 6 | 0/16 | 1.53 | 5 | 55 | 137554 |
| E-MIN-V2 | 3/36 | 0 | 3/36 | 2.97 | 4 | 107 | 137021 |
| E-MIN-V3 | 10/36 | 2 | 8/33 | 2.53 | 4 | 91 | 221298 |

All 108 observations terminated within the three-call bound and retained rollback truth. V3's recovery signal is secondary and hypothesis-generating; it does not override the failed primary/cost gate.

## Failure Recovery

V2 added 71 evidence items and recovered 3 tasks after first failure; V3 added 55 and recovered 8; E1 added 19 and recovered 0. Repeated structured actions were E1/V2/V3 = 5/4/4. Retry required new evidence and never exceeded three calls.

## Real Patch Results

| Configuration | Exact PASS | Applied | Parser PASS | Hidden exact | Parser-only regression escape | Wrong file | Rollback |
|---|---:|---:|---:|---:|---:|---:|---:|
| E1 | 0/60 | 1 | 1 | 0 | 1 | 0 | 60/60 |
| E-MIN-V2 | 0/60 | 0 | 0 | 0 | 0 | 0 | 60/60 |
| E-MIN-V3 | 0/60 | 1 | 1 | 0 | 1 | 0 | 60/60 |

Visible upstream suites and dependency installs were truthfully NOT_RUN where no pinned offline environment existed. A parser PASS was never counted as patch success. Historical commit subjects are sparse provenance, not full upstream issue bodies; that limitation is preserved with the 0/60 result.

## Real Repository Understanding

| Configuration | Holdout success | Answer evidence complete | Retrieval complete | Evidence precision | Unsupported path claims | Total tokens |
|---|---:|---:|---:|---:|---:|---:|
| E1 | 0/96 | 55.21% | 82.29% | 67.71% | 18 | 157819 |
| E-MIN-V2 | 0/96 | 0.00% | 0.00% | 23.96% | 3 | 33935 |
| E-MIN-V3 | 0/96 | 3.13% | 3.13% | 35.42% | 23 | 116916 |

The dedicated corpus covers purpose, contributor run, execution entry, testing, license constraints, reading order, architecture, and dependencies for every one of the 24 repositories. Unsupported-claim scoring verifies path citations, not every semantic sentence.

## Retrieval

V2 holdout detailed, overlapping failure counts: wrong_evidence_class=50, wrong_file=40, wrong_symbol=26, missing_secondary_evidence=48, lexical_distractor=53, dependency_traversal_failure=24, documentation_omission=17, metadata_omission=9, test_affinity_failure=24, truncation=4, stale_index=0, fallback_failure=21, excessive_noise=0. Stale index is 0 on pinned primary repos; the separate 100-cycle mutation test invalidated 33 stale evidence rows with 0 orphan definition records and 0 source/test-affinity failures.

## Context Experiments

Context 2048/4096/8192 success was 0/0/0 of 48; schema validity was 81.25%/77.08%/72.92%. All three evidence orders scored 1/48. Symbol-body, neighborhood, larger range, and full-file each scored 1/48; mean tokens were 661, 1168, 1893, and 1949. There is no confirmatory quality basis to promote an order/range; the bounded body is only a descriptive cost signal.

## Model Call Depth

Depth 1/2/3 each scored 0/48. Mean tokens were 1941/3969/6009, latency 2549.5/4635.3/6658.0 ms, and structured-decision contradiction counts 0/2/3. More calls added cost and variance without success.

## Quality–Cost Frontier

V2: 3/96 at 243 median tokens; V3: 2/96 at 1,176 (+383.95%); conditional: 3/96 at 499 (+105.35%). V3 is dominated by E1, V2, and conditional; conditional is dominated by E1 and V2.

## Conditional V2/V3 Routing

The deterministic no-LLM router escalated 37/96 tasks. It improved evidence completeness from 41.67% to 46.88% but task success stayed 3/96 and the preregistered promotion gate failed. It remains disabled.

## Multi-Agent Status

Global Multi-Agent remains disabled and semantic review remains disabled by default. No generic new agent experiment was run because prior evidence is negative/neutral and G3 exposes retrieval/schema/patch-generation mechanisms rather than a confirmed specialist hypothesis.

## Repo Scale

Across 24 repos and 902,911 LOC, cold index p50/p95 was 36.303/536.767 ms; warm p50/p95 31.712/155.100 ms; SQLite integrity 24/24 and definition-probe recall 75.00%. Symbol-index support is claimed only for 10 Python/JS/TS repositories; 14 Go/Rust/C/C++/JVM repositories are fingerprint/scale-only.

## Runtime Stability

The single pinned model process covered 2443 G3 calls across stored artifacts before intentional crash injection. Snapshot-interval RAM delta was 18.52 MiB, FD delta -2, and the process/listener/API-key/worktree targets PASS. Index mutation passed 100 cycles; UI memory is explicitly bounded to 100 runs × 2000 events.

## Crash Recovery

Crash suite status PASS: in-flight server termination never emitted fake PASS; tool timeout/cancel, malformed schema rejection, SQLite rollback/integrity, failed patch preservation, verification crash, Agent cancel, UI reconnect, pinned server restart, and ephemeral-key rotation are recorded in the immutable artifact.

## Security Fuzzing

1000 deterministic cases passed across path traversal, shell metacharacters, prompt injection, encoded instructions, symlink escape, oversized content, malformed filenames, and fake approvals. Fixture escape observed: false. The immutable v1 failure led to stronger sudo/bypass-test detection; the corrected v2 is not presented as if v1 never happened.

## UI Soak

200,000 events over 100 runs: render p50/p95/max 2.363/6.486/19.411 ms, repository-switch p95 6.951 ms, peak RSS growth 227.59 MiB, and 0 dropped/reconnect/stale/duplicate truth failures. This is headless React/event-projection evidence, not Windows compositor or screen-reader QA.

## VRAM / Throughput

Primary device-level VRAM start/end/peak was 12020/12220/12220 MiB with NVML cross-check. Streaming TTFT/throughput by configuration: E1 TTFT p50 152.6 ms, output 73.72 tok/s; E-MIN-V2 TTFT p50 77.9 ms, output 75.15 tok/s; E-MIN-V3 TTFT p50 172.6 ms, output 73.67 tok/s. Streaming peak VRAM was 12290 MiB.

## Skill Status

Skill validation remains L0 39/39; decisions are production=1, experimental=8, rejected=0. Only R09 C1 is admitted production. G3 does not silently admit a new Skill.

## Production Default Decision

E-MIN-V2 remains the relative production default. Global V3 and conditional routing both failed preregistered gates. Global Multi-Agent and semantic reviewer remain disabled; deterministic safety/verification stays enabled. This is not an autonomous-patch readiness claim. See ADR 0012.

## Quantization Readiness

Protocol status: READY_BLOCKED_APPROVAL_NO_CANDIDATE_ACQUISITION. The exact sealed BF16 comparison, snapshot/license admission, TTFT/throughput/VRAM metrics, and acceptance gates are prepared. No reduced-precision snapshot was downloaded because acquisition lacks explicit approval.

## License Readiness

Of the carried-forward 139 NOASSERTION entries: A locally resolvable=0, B authoritative external metadata required=137, C ambiguous/manual legal review=2. Root license options are informational only; no owner license decision was made. Distribution remains BLOCKED_ROOT_LICENSE_AND_AUTHORITATIVE_METADATA.

## Release Blockers

- No authorized source commit or remote checkpoint
- G3 naturalistic holdout success is low and executable historical patch success is 0/60 for every configuration
- Root project license is owner-undecided; 137 dependency entries require authoritative external metadata and 2 require manual legal review
- Windows installer, keyboard/screen-reader/upgrade/uninstall QA and signing are NOT_RUN
- Reduced-precision snapshot acquisition and quantization comparison remain approval-blocked
- Push, PR, tag, release and signing remain approval-gated

No project commit, remote configuration, push, PR, tag, release, signing, sudo installation, or quantized-model acquisition was performed.
