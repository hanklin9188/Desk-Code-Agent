# ADR 0012 — Retain E-MIN-V2 after naturalistic G3

Status: Accepted locally  
Date: 2026-08-09

## Context

ADR 0011 retained E-MIN-V2 after G2 reached a 210/210 ceiling for E1, V2, and V3. G3 was preregistered and sealed before its first model call to remove answer options, use repository-disjoint open-ended tasks, add executable historical patches, and measure long-horizon recovery and quality–cost. The frozen E-MIN-V2 and E-MIN-V3 artifacts were not changed.

The primary G3 holdout contains 96 tasks over 12 new repositories. E1 passed 6/96 (6.25%, Wilson 95% 2.90–12.97%), E-MIN-V2 passed 3/96 (3.125%, 1.07–8.79%), and E-MIN-V3 passed 2/96 (2.083%, 0.57–7.28%). V3 versus V2 was −1.04 percentage points; both the paired and repository-cluster bootstrap 95% intervals were [−3.125%, 0], with McNemar p = 1. Median total tokens were 243 for V2 and 1,176 for V3, a 383.95% overhead. V3 had zero candidate-only wins and one V2-only win.

The preregistered deterministic conditional policy routed 37/96 tasks to V3 but remained 3/96, equal to always-V2, while median tokens increased from 243 to 499 (+105.35%). E1, V2, V3, and conditional routing had zero actual safety violations, but all configurations had low absolute naturalistic task success. This is a release-readiness limitation, not merely a ranking result.

Secondary evidence does not reverse the primary gate. In the 36-task bounded long-horizon corpus, E1/V2/V3 passed 6/3/10; V3 recovered after a first failure 8 times versus V2's 3, but consumed 221,298 total tokens versus 137,021 for V2. In the 60-task executable historical patch corpus, all three configurations passed 0/60 exact hidden oracles. Every one of the 180 isolated observations rolled back correctly with zero wrong-file or unrelated edits; parser acceptance was never relabeled as behavioral success.

## Decision

Retain E-MIN-V2 as the relative production default. Do not promote global E-MIN-V3 and do not enable conditional V2/V3 routing in production. Preserve E-MIN-V3 as a frozen research candidate.

“Production default” identifies the currently selected bounded harness; it is not a claim that the autonomous naturalistic patch workflow is release-ready. Modification continues to require deterministic verification, and the G3 real-patch result is a stop-ship limitation for claims of autonomous real-repository patch completion.

Global Multi-Agent remains disabled. The semantic reviewer remains disabled by default. No new generic specialist experiment is authorized because G3 identifies retrieval/context and small-model structured patch generation as concrete bottlenecks, not evidence that more agents improve outcomes.

## Consequences

- E-MIN-V2 remains the default configuration and R09:C1 remains the only admitted production Skill path.
- E-MIN-V3 may be studied on a future preregistered long-horizon confirmation set because its recovery signal is hypothesis-generating only.
- The current conditional router is not enabled: it added cost without primary quality gain.
- Evidence completeness alone remains insufficient for promotion.
- Naturalistic autonomous mutation cannot be marketed as ready: the executable historical patch result is 0/60 for every candidate.
- A future candidate requires a new freeze and untouched repository-level holdout; G3 cannot become its tuning set.
- Release remains independently blocked by source revision/approval, root license and external metadata, native Windows installer/accessibility/signing evidence, and protected delivery authority.

## Rejected alternatives

- Promote V3 from long-horizon recovery alone: rejected because that analysis is secondary, costlier, and contradicted by the primary end-to-end gate.
- Enable conditional V3 routing from evidence completeness: rejected because conditional task success did not improve and median tokens more than doubled.
- Treat V2 as broadly successful because it remains default: rejected because 3/96 primary and 0/60 real-patch success establish a strict claim boundary.
- Revive global Multi-Agent: rejected because prior evidence is negative/neutral and G3 supplies no bounded specialist mechanism with a confirmed gate.
