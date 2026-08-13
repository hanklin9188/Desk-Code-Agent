# E-EDIT Repository-Disjoint Untouched Holdout — Final Report

Date: 2026-08-11  
Sessions: A, B and C complete  
Scientific outcome: `E_EDIT_HOLDOUT_GATE_FAIL`  
Product decision: `KEEP_MUTATION_DISABLED`

## Experiment Identity

- Candidate `E-EDIT-P2-V1`:
  `7abdcd7cfe84b3e3e6844ecc81c8a4c783a9af53e45dcbb0489fa0e157a32fbc`
- Holdout preregistration V2:
  `5e1d4ece269cd807f625ef7f0c41b1867dce5600f25e4080bfcf02746e4833c5`
- Holdout seal V2:
  `51b7c6d79d7f07eab84017488aeae6aa8a061430af36eda3df34348b76f9f823`
- Model: Qwen3.5-4B revision
  `851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a`, BF16, vLLM 0.26.0

## Holdout

- 15 pinned repository-disjoint repositories
- 120 tasks
- 80 mutation-required
- 15 natural failure-recovery
- 10 REPORT_ONLY/unsupported
- 15 safety/adversarial
- Difficulty: 30 L2, 60 L3, 30 L4
- Scope: 75 single-file, 20 multi-file evidence/single-target, 25 non-mutation
- Model population: 95 mutation tasks per one-shot condition
- Policy population: 25 tasks per condition, zero model calls

## Baseline One-Shot

- Calls: 95
- Valid actions: 0
- Strict behavioral success: 0/95
- Hidden success: 0/95
- Classification: 90 REPORT_ONLY, 5 syntactically invalid edits
- Wrong-file attempts, safety violations and rollback failures: 0

## E-EDIT One-Shot

- Calls: 95
- Valid actions / patch construction: 89/95
- Syntax PASS: 71/95
- Visible-test PASS: 33/95
- Hidden-test PASS: 42/95
- Strict behavioral success: 23/95 (24.21%)
- Wrong-file attempts, safety violations and rollback failures: 0

## Paired Comparison

- Both pass: 0
- Baseline only: 0
- E-EDIT only: 23
- Both fail: 72
- Difference: +24.21 percentage points
- 10,000-repetition task-paired bootstrap 95% CI: +15.79 to +32.63 pp
- Repository-cluster bootstrap 95% CI: +16.84 to +32.63 pp
- Exact two-sided McNemar p-value: `2.384185791015625e-7`

## Hidden Tests

Baseline passed 0/95 hidden tests and E-EDIT passed 42/95. Only 23 E-EDIT
edits passed both visible and hidden behavior, so hidden PASS alone is not
treated as strict task success.

## Retrieval Generalization

Exact-source selection and inclusion were both 90/95 in both conditions. Five
paired tasks were retrieval misses. This is below the development result of
50/50 and is recorded as a real secondary generalization limitation; E-MIN-V2
was not modified after observing it.

## Retry

The frozen retry prerequisite required E-EDIT one-shot success of at least
29/95 with zero safety and rollback failures. E-EDIT achieved 23/95, so retry
was `NOT_ELIGIBLE_ZERO_CALLS`.

- Eligible execution branch: no
- Calls: 0
- Recoveries, contradictions, repeated patches and added cost: not applicable

## Failure Decomposition

Earliest primary failure counts:

| Cause | Baseline | E-EDIT |
|---|---:|---:|
| RETRIEVAL | 5 | 5 |
| ACTION_VALIDATION | 90 | 6 |
| SYNTAX_TYPE | 0 | 17 |
| VISIBLE_TEST | 0 | 34 |
| HIDDEN_TEST | 0 | 10 |

For accepted edits failing syntax or behavior, `MODEL_REASONING` is recorded as
a secondary inference, not as directly observed chain-of-thought evidence.
P2 clearly reduces interface refusal/validation friction, but 66 accepted edits
still failed strict behavior or syntax.

## Safety

- Wrong-file attempts: 0
- Actual safety violations: 0
- Rollback failures: 0
- Patch-interface security regression: 1,540/1,540 instances across 77
  structural templates PASS
- Rejected-action apply attempts: 0

## Performance

| Metric | Baseline | E-EDIT |
|---|---:|---:|
| Input tokens | 17,172 | 18,977 |
| Output tokens | 22,345 | 5,769 |
| Total tokens | 39,517 | 24,746 |
| Median end-to-end latency | 3,224.27 ms | 876.09 ms |
| p95 end-to-end latency | 3,669.59 ms | 1,304.23 ms |
| Effective output tokens/s | 73.11 | 68.00 |

E-EDIT used 37.38% fewer total tokens and 72.24% less total latency. Session-B
rows did not record TTFT or inference-time idle/peak VRAM, so those fields are
`NOT_MEASURED`; cleanup GPU 0 MiB is not misrepresented as inference telemetry.

## Product Mutation Decision

`KEEP_MUTATION_DISABLED`.

E-EDIT missed the 57/95 promotion threshold, the 29/95 assisted-only floor and
ADR 0014's 25% reconsideration threshold. Zero safety violations demonstrate
the deterministic runtime boundary, not sufficient semantic correctness.

## E-EDIT Status

`RESEARCH_ONLY_MUTATION_INTERFACE`.

E-EDIT remains an experimental runtime capability. It is not admitted as a
production Skill, assisted patch route, experimental bounded mutation route or
autonomous candidate.

## Need for 7B Model Tournament

Scientifically justified for a future controlled study: 89 valid actions but
only 23 strict successes indicate that model semantic coding capability is a
material post-interface ceiling. Retrieval misses remain a separate limitation,
so this is not a claim that scale alone will solve the problem.

## 7B Tournament Protocol Status

`PROTOCOL_ONLY_NOT_AUTHORIZED`.

The prepared `PRACTICAL_LOCAL_MODEL_TOURNAMENT` names
Qwen2.5-Coder-7B-Instruct, FIM-7B and SWE-agent-LM-7B without selecting a
revision. No model was downloaded or executed. Reduced precision on the 16 GB
GPU would make it a practical comparison rather than a pure scale experiment.
Separate preregistration, exact revision/license approval and a new untouched
holdout are required before any product claim.

## Regression Validation

- Design validation: 1,213 files, 39 Skills, 24 schemas, 5 agents, zero errors
- TypeScript: PASS
- Tests: 26 files, 130 tests PASS
- Production web build: PASS
- UI replay: 100,000 events, zero dropped truth events, PASS
- Extended UI/runtime QA: PASS; CANCELLED never rendered as verified
- Reduced motion and automated accessibility: PASS
- Windows screen-reader/native installer: NOT_RUN/BLOCKED_EXTERNAL
- Boundary-aware secret scan: PASS
- Artifact checksum and source-closure validation: PASS
- Model cache/weight Git exclusion: PASS

## Runtime Cleanup

- vLLM/model/launcher processes: absent
- Port 8000: clear
- GPU memory: 0 MiB after cleanup
- Ephemeral API key and serving state: absent
- Temporary holdout fixtures: absent
- Git worktrees: exactly one repository root

## Remaining Protected / External Blockers

- Any 7B, quantized or other model acquisition requires explicit approval.
- Git commit, remote, push, PR, tag, release and signing remain unauthorized.
- Root project license and remaining authoritative dependency metadata remain
  unresolved.
- Native Linux packaging is blocked by system dependencies.
- Windows installer, screen-reader, upgrade/uninstall and signing QA remain
  unavailable without a Windows host and signing material.

Canonical machine-readable evidence:
`docs/experiments/patch-interface/E_EDIT_HOLDOUT_RESULTS_INDEX.v1.json`.
