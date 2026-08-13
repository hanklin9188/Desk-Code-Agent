# ADR 0015 — Keep mutation disabled after the E-EDIT untouched holdout

Status: Accepted locally  
Date: 2026-08-11

## Context

The frozen `E-EDIT-P2-V1` candidate passed its development-only interface gate
and was evaluated without tuning on a sealed 15-repository, 120-task holdout.
The mutation population contained 95 tasks; 25 policy tasks were evaluated by
deterministic zero-call oracles.

With the same Qwen3.5-4B revision, E-MIN-V2 retrieval, C1 context, verification,
hidden tests and rollback, P0_EXACT achieved 0/95 strict behavioral success and
P2 E-EDIT achieved 23/95. P2 produced 89 valid actions, but only 23 passed both
visible and hidden behavior. Paired counts were 0 both-pass, 0 baseline-only,
23 E-EDIT-only and 72 both-fail. Wrong-file attempts, actual safety violations
and rollback failures were zero.

The frozen promotion gate required at least 57/95 E-EDIT successes. Its
assisted-only floor required at least 29/95. Both failed. The bounded retry
prerequisite also required 29/95, so no retry call was authorized. Fresh
retrieval measurement found exact-source selection and inclusion on 90/95,
which is a real secondary regression from development and must not be hidden by
attributing every failure to model reasoning.

## Decision

Choose `KEEP_MUTATION_DISABLED`.

Classify E-EDIT as a `RESEARCH_ONLY_MUTATION_INTERFACE`. Do not admit it as an
LLM Skill and do not enable production assisted, experimental or autonomous
mutation. The deterministic P2 runtime remains useful experimental
infrastructure, but 23/95 strict success is below both the preregistered 30%
assisted-only floor and ADR 0014's 25% reconsideration threshold.

A stronger local coding-model experiment is scientifically justified because
P2 removed most action-interface friction (89/95 valid actions) while 66
accepted edits still failed syntax or behavior. This does not prove that scale
alone will solve the problem: five retrieval misses remain, and any future
study must measure retrieval separately.

Prepare a `PRACTICAL LOCAL MODEL TOURNAMENT` protocol only. It may name
Qwen2.5-Coder-7B-Instruct, FIM-7B and SWE-agent-LM-7B as candidates, but no
revision is selected and no download or execution is authorized. Any reduced
precision needed for the 16 GB GPU makes the comparison practical rather than
scale-only. Model acquisition, exact revisions, licenses and decoding profiles
require a separate preregistration and explicit approval.

## Consequences

- Product mutation remains disabled.
- E-MIN-V2 and C1 remain unchanged; the five holdout retrieval misses become a
  measured follow-up concern, not a post-hoc tuning target for this holdout.
- E-EDIT remains a runtime interface/capability, not a production Skill.
- The completed holdout may be reused only as a disclosed, no-longer-untouched
  screening set in a future model tournament. Product claims would require a
  newly sealed repository-disjoint holdout.
- Deterministic allowlists, budgets, hard isolation, hidden verification and
  rollback remain mandatory and model-independent.
- No release, GitHub or protected external action is authorized by this ADR.

## Rejected alternatives

- `ASSISTED_PATCH_SUGGESTION`: rejected because 23/95 misses both the frozen
  29/95 assisted floor and the existing 25% reconsideration threshold.
- `EXPERIMENTAL_BOUNDED_MUTATION`: rejected because no preregistered class has
  sufficient untouched strict reliability.
- `AUTONOMOUS_PATCH_CANDIDATE`: rejected because 24.21% strict success is far
  below the existing quality gate.
- Run retry anyway: rejected because the frozen prerequisite was not met.
- Download a 7B model now: rejected because this protocol authorizes planning
  only and no exact model acquisition was approved.
