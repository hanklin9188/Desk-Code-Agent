# ADR 0016 — No model promoted after the practical local 7B tournament

Status: Accepted locally  
Date: 2026-08-11

## Context

The disclosed 95-task E-EDIT P2 screening compared the existing Qwen3.5-4B
BF16 reference with two valid scored 7B candidates under a matched online FP8
per-tensor W8A8 profile. A third candidate, SWE-agent-LM-7B, had two consumed
post-call length/truncation failures and is permanently excluded from ranking.

Qwen2.5-Coder-7B achieved 7/95 strict behavioral success versus the reference's
23/95. FIM-7B achieved 29/95. Paired FIM-7B versus Qwen Coder 7B was +23.16
percentage points with task bootstrap 95% CI `[13.68, 32.63]`, repository
cluster CI `[14.74, 31.25]`, and exact McNemar `p=0.00001049`. FIM-7B versus
the 4B reference was +6.32 points, but the task CI `[-3.16, 15.79]`, cluster CI
`[0, 12.5]`, and McNemar `p=0.2863` do not establish a material gain.

FIM-7B reaches exactly the frozen 29/95 assisted floor but misses the 33/95
research threshold, 40/95 strong-candidate threshold, and 57/95 product
threshold. The preregistration explicitly states that rank or a single absolute
floor is insufficient: paired evidence, safety, feasibility, provenance, and a
new repository-disjoint untouched product validation must also pass.

## Decision

Choose `NO_MODEL_PROMOTED` and retain `KEEP_MUTATION_DISABLED`.

FIM-7B is the strongest scored research candidate and is eligible only for a
new, separately sealed `BEST_7B_BOUNDED_RETRY_PROTOCOL`. It is not a
`PRODUCTION_MODEL_CANDIDATE`, an enabled assisted-patch route, an experimental
mutation route, or an autonomous patch candidate.

The tournament supports `MATERIAL_FIM_AGENTIC_GAIN` against the matched generic
7B control. It does not support a pure scale claim: the generic 7B model
regressed against the 4B reference, and the reference/candidate precision also
differs (BF16 versus FP8).

## Consequences

- Product mutation remains disabled and E-EDIT P2 remains research-only.
- M3 remains `INFRASTRUCTURE_BLOCKED_NOT_SCORED`; no Session-D rerun or repair
  is allowed.
- The next scientific experiment is the protocol-only bounded M2 retry study.
  It requires a new immutable generation and separate call authorization.
- A product-facing assisted patch claim still requires a new repository-
  disjoint untouched validation after any candidate passes its research gate.
- Deterministic allowlists, hard isolation, verification, approval and rollback
  remain mandatory and model-independent.
- No commit, remote, push, PR, tag, release or signing action is authorized.

## Rejected alternatives

- Promote M2 because it ranked first: rejected by the all-gates winner policy.
- Enable assisted patch suggestion at exactly 29/95: rejected because an
  absolute floor is not the complete product gate.
- Treat M1 as evidence for scale: rejected because it materially regressed.
- Rank or rerun M3: rejected because its sealed condition is infrastructure-
  blocked and its calls are consumed.
- Increase model size immediately: rejected until the bounded retry and
  semantic failure evidence justify a different experiment.
