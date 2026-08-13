# Skill Evaluation Suites

## Trigger suite

For each Skill:

- 20 positive trigger prompts/events
- 20 near-miss non-triggers
- 10 adversarial/conflicting cases
- target: precision/recall by category; false high-risk invocation = 0

## Process suite

Inspect state/event traces rather than hidden chain-of-thought:

- legal edge sequence
- required evidence before action
- completion criteria
- budget
- no duplicate/no-op tool calls
- correct block/escalation

## Debug suite

Seed bugs requiring reproduction, minimization and competing hypotheses. Compare direct log→patch against R17/R18. Metrics: success, attempts, time-to-red, root-cause top-k and tokens.

## Review suite

Seed independent spec and standards defects. Compare monolithic review against R22 isolation. Metrics: per-axis precision/recall, cross-axis contamination, cost.

## Tool-surface suite

Compare low-level tool catalog against RepoIntelligence deep interface. Metrics: tool-selection validity, calls, wrong-file and task success.

## Agent-document suite

Compare skill descriptions/pointers with trigger fixtures and measure context tokens/process variance/premature completion.
