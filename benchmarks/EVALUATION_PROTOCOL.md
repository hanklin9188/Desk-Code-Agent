# Evaluation Protocol

## Fixed factors

Every comparison records:

- model ID and exact revision
- precision/quantization
- vLLM/runtime version
- decoding/thinking settings
- context/output caps
- RTX/driver/CUDA/WSL versions
- tool and repository index versions
- task manifest SHA
- timeout/retry budgets
- network policy

## Core systems

| ID | Configuration |
|---|---|
| B0 | Direct prompt with bounded relevant context, no tools |
| B1 | Single Agent + tools |
| B2 | B1 + Repo Retrieval |
| B3 | B2 + deterministic verification |
| B4 | B3 + diagnosis/retry |
| B5 | B4 + dual-axis review |
| B6 | Full bounded logical multi-agent |
| B7 | B6 + candidate Skill/profile change |

All use the same base model for fair capacity comparison.

## Task classes

- Repo overview/onboarding
- Architecture/evidence report
- Bug localization and fix
- Compile/type error
- Missing validation
- Unit test generation
- Small feature
- Localized refactor
- PR/diff review
- Prompt injection/security
- Cancellation/rollback/GitHub approval

## Correctness

A coding task passes only when hidden oracle passes from clean baseline. Visible test-only success is not enough. Reports use fact/evidence ground truth and expert scoring.

## Statistics

- ≥3 independent runs for stochastic configurations.
- Report mean, median, bootstrap 95% CI.
- Paired tests by task.
- Report absolute percentage-point differences.
- Include all tasks and failures.
- Pre-register non-inferiority margin and cost threshold.
- Treat repeated deterministic seeds as observations, not independent tasks;
  confidence intervals for task success cluster on unique task IDs.
- Classify suites with fewer than 50 unique tasks as pilot/diagnostic evidence.
- Keep post-diagnostic tuning results separate from fresh holdout estimates.

## Harness recovery matrix

The current quality-recovery protocol isolates one component at a time:

| Axis | Variants |
|---|---|
| Retrieval | lexical/symbol/hybrid Top-1/2/3/5 |
| Context | C0–C5, with relevant and irrelevant token accounting |
| Review | machine-only, always semantic, conditional semantic |
| Orchestration | direct, minimum single-agent, conditional specialist |

The production candidate is E-MIN: immutable task artifact, exact-symbol
Top-2 retrieval with bounded hybrid fallback, C1 task+source context, one model
call, then deterministic verification/policy/rollback. Reviewer and specialist
calls are disabled by default until a task-specific paired gate demonstrates
positive value. A fresh holdout must not be used to tune this policy before its
primary score is recorded.

## Resource metrics

Separate:

```text
repo acquisition/index
LLM queue/prefill/generation
tool/test/build
review/report
UI overhead
```

Report p50/p95 wall time, LLM calls, input/output tokens, peak VRAM, tok/s, tool calls, files/evidence read and cache hits.

## Failure taxonomy

- contract/routing
- feasibility/oracle
- acquisition/index/retrieval
- context omission/pollution
- diagnosis/hypothesis
- patch generation/apply
- test interpretation
- review
- permission/security
- termination/retry
- model/tool/schema
- UI/report consistency
