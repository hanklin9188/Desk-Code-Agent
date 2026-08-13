# ADR 0009 — Hybrid bounded agent architecture

Status: Accepted locally, holdout confirmation required  
Date: 2026-08-09

## Context

The immutable six-task pilot `m9-e1-e7-2026-08-09T01-18-51-568Z` showed monotonic harness degradation: E1 83.33%, E4 33.33%, E7 16.67%. E6 multi-agent also added 109.77% median tokens and 99.75% latency over E5 while reducing success.

The pilot was valuable but confounded. E3 used the same query (`export`) for every task and removed visible task/source details. E4 changed both evidence and formatting. E6 passed a free-form conversational handoff. E7 injected duplicated natural-language policy.

An expanded 108-task synthetic suite then isolated retrieval, context, reviewer, instruction load, and conditional routing. Evidence is recorded in:

- `docs/experiments/runs/m9-harness-recovery-diagnostic-2026-08-09T04-32-48-950Z/result.json`
- `docs/experiments/runs/m9-harness-recovery-final-2026-08-09T04-43-33-470Z/result.json`
- `docs/experiments/runs/m9-harness-recovery-optimized-2026-08-09T05-00-34-145Z/result.json`

## Decision

Desk Code Agent adopts a hybrid bounded architecture:

```text
Default
  immutable task artifact
  → exact-symbol Top-2 retrieval (hybrid Top-2 fallback)
  → C1 task + relevant source
  → one Qwen agent call
  → deterministic patch / verification / policy / rollback runtime

Optional experiment-only path
  measurable specialist candidate trigger
  → explicit experiment flag or user request
  → structured handoff
  → specialist call
```

The default agent mode is `SINGLE`. Multi-agent, semantic Reviewer, and full natural-language Skill injection are disabled by default. Their candidate triggers remain observable, but a trigger does not authorize execution until the pattern passes its own task-specific paired gate.

Invariant safety remains code-enforced: worktree isolation, path allowlists, patch budgets, trusted command registry, `shell:false`, timeout/cancellation/output caps, secret redaction, untrusted-content separation, rollback, exact approval binding, and canonical GitHub target enforcement.

Only model-facing instructions required for the current task class are disclosed. Task Contract, policy, verification state, and evidence metadata remain structured artifacts; they are not repeated verbatim into every model call.

## Evidence

- Symbol Top-2: 106/108 in diagnostic, Precision@2 1.0, MRR 1.0.
- Hybrid Top-5: 103/108 despite Recall@K 1.0 and 42.82% irrelevant-token ratio.
- C1: 106/108 at 164 median tokens.
- C5: 105/108 at 279 median tokens.
- Machine-only reviewer baseline: 56/57.
- Always reviewer: 53/57, three false rejects, zero regression detections.
- Conditional reviewer: 55/57, one false reject and one false approval.
- Generation 2 E5 single: 318/324; E6 conditional specialist: 315/324.
- E-MIN-V2 follow-up: 324/324, 136 median tokens, one model call, zero wrong-action attempts.

The E-MIN-V2 result was tuned after inspecting the same suite and therefore requires a fresh holdout before it is a generalization estimate.

## Consequences

Positive:

- Lower prompt and latency cost.
- Fewer instruction/evidence conflicts for the 4B model.
- Safety and verification no longer depend on model compliance.
- Agent topology follows measured value rather than product branding.
- Retrieval/context/reviewer components have isolated, replayable gates.

Trade-offs:

- The default is no longer “multi-agent by default.”
- Specialist patterns remain unavailable in production until they show positive marginal value.
- Exact-symbol retrieval needs a bounded hybrid fallback for tasks without an identifiable symbol.
- The current evidence is synthetic and multiple-choice/action based; real patch/repository holdout work remains.

## Rejected alternatives

- Always-on multi-agent/reviewer: measured quality regression and cost increase.
- Full C5 wrapper: more tokens with lower success.
- Recall-maximizing Top-5 retrieval: more noise and lower task success.
- Removing deterministic protections to match direct-prompt cost: rejected; safety and verifiability are product invariants.

## Revisit criteria

Revisit when a fresh holdout or external task-specific suite demonstrates at least +5 pp in its target category, zero safety/critical regressions, schema validity ≥99%, and justified token overhead for a specialist or Reviewer pattern.
