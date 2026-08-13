# Desk Code Agent v2 Design Pack Validation

## Result

**PASS**

```text
Desk Code Agent v2 design validation
- files: 169
- skills: 39 (development=11, runtime=28)
- schemas: 24
- agents: 5
- warnings: 0
- errors: 0
DESIGN PACK VALIDATION: PASS
```

## Pack statistics

| Item | Count |
|---|---:|
| Final files | 169 |
| Master design lines | 1,975 |
| Markdown files | 121 |
| Markdown lines | 17,856 |
| Development Skills | 11 |
| Runtime Skills | 28 |
| Logical Agents | 5 |
| JSON Schemas | 24 |
| ADRs | 8 |
| UI specification files | 12 |
| Interactive HTML prototypes | 1 |

## Assertions covered

- Canonical GitHub target is `hanklin91888/Desk-Code-Agent`.
- No remote GitHub action is claimed or performed by the design pack.
- Skill IDs are exactly D01–D11 and R01–R28.
- Every Skill has required metadata, bounds, tools, state, completion, security and evaluation sections.
- Agent and workflow Skill references resolve.
- JSON, YAML and JSON Schemas validate.
- Third-party notices and adaptation matrix exist.
- Animate UI integration, semantic motion, reduced motion, performance and prototype artifacts exist.
- Milestones cover M0–M10.
- Legacy v1 identifiers are restricted to migration/changelog documentation.

## Privacy-safe semantic observability V3 Session-D validation

**PASS**

- Canonical L0 baseline and validation hashes match their detached seals.
- All 80 restricted L1 packet sidecars pass; the paired population is exactly
  the same 44 strict failures.
- L1 classification schema/cardinality and the frozen independent audit pass:
  44/44 classified, 22/22 audited, zero disagreements, raw agreement and
  Cohen kappa 1.0.
- Privacy regression passes with zero persisted raw output, edit body, code
  identifiers, literal values, parser messages, HMAC keys, secret/canary leaks
  or L2 records.
- Strict TypeScript, targeted tests, repository typecheck, production build and
  design validation pass.
- No target-model call, model start, retry, download or next-experiment
  execution occurred. Port 8000 is clear, GPU model allocation is zero and
  ephemeral model/HMAC state is absent.
- The historical L0 baseline is byte-identical after Session D. Product
  mutation remains disabled.

## Code-formation constraint experiment Session-A validation

**PASS**

- Authoritative protocol, FIM-7B revision, frozen E-EDIT P2 candidate, and
  observability selection evidence passed detached-checksum verification.
- Forty new tasks use forty pairwise repository-disjoint immutable revisions;
  all reference fixes pass registered syntax, visible, and hidden checks.
- The 16-case unit suite and ten-case sealed robustness matrix cover valid,
  malformed, indentation-shaped, delimiter, incomplete-expression,
  empty/whitespace, wrong-file, regex, and template-literal cases.
- The constraint is deterministic and rejection-only: zero crashes, semantic
  rewrites, privacy leaks, or unsafe file expansions.
- The sealed runner preflight passes with empty future ledgers. Target-model
  calls, vLLM processes, port-8000 listeners, and GPU allocation are all zero.
- Session B was not started and product mutation remains disabled.

## Code-formation constraint experiment Session-B pre-call abort

**ABORTED_FAIL_CLOSED_BEFORE_FIRST_CALL**

- Session-A identity, source closure, 40-task/40-repository population,
  schedule, empty ledgers, hard isolation, storage, snapshot, and exact serving
  identity passed.
- The sealed runner failed during request materialization because its expected
  top-level `systemPrompt` field is absent from the sealed preregistration.
- No `CALL_STARTED` record or model request occurred. Actual calls, pairs,
  retries, and persisted raw outputs are all zero; ledgers remain zero bytes.
- No behavior-changing hot patch was made. Runtime and ephemeral state cleanup
  passed. Session C remains unauthorized.

## Code-formation constraint Session-B runner correction

**PASS_ZERO_CALL_INFRASTRUCTURE_CORRECTION**

- The immutable abort record and its zero-call accounting are preserved.
- The corrected shared materializer reads the frozen nested CONTROL prompt and
  constructs TREATMENT using the unchanged registered suffix.
- Deterministic static audit: 10 valid preregistration field paths, 0 invalid.
- Zero-call preflight: 80/80 intents, 40/40 conditions, 40 pairs, zero
  duplicate, missing, or malformed intents; task exposure remains zero.
- Targeted 18/18 tests, strict TypeScript, full 184/184 tests, project
  typecheck, production build, and design validation pass.
- Corrected source closure and artifact sidecars pass. No model process, port
  8000 listener, GPU allocation, ephemeral state, or disposable workspace is
  present. Session B execution remains a separate invocation.

## Code-formation constraint experiment Session B

**PASS**

- Physical accounting: 80/80 calls, 40 CONTROL, 40 TREATMENT, 40 complete
  pairs, 80 unique call IDs, and 80 matched start/completion events.
- Frozen counterbalanced schedule and request-intent hashes match exactly;
  retries, duplicates, silent retries, and reviewers are zero.
- CONTROL and TREATMENT each recorded 0 valid actions, 0 constructed patches,
  and 0 syntax/visible/hidden/strict passes. Failure-stage evidence is complete
  with 40 `MODEL_FAILURE -> MODEL_FAILURE` transitions.
- Wrong-file attempts, actual safety violations, rollback failures, persisted
  raw outputs/edit bodies, and L2 records are zero.
- Full 184-test suite, typecheck, production build, and design validation pass.
  Runtime process/port/GPU/ephemeral-state/workspace cleanup passes.
- Session-B evidence is sealed; no treatment-effect interpretation or product
  decision was performed. Session C remains a separate invocation.

## Code-formation constraint experiment Session C

**PASS_INVALID_EXPERIMENT**

- Session-B artifact and results-index hashes match the required frozen values.
- The 80-call physical lineage, 40/40 arms, 40 pairs, and zero retries/reviewers
  pass; Session C made zero target-model calls and started no model runtime.
- CONTROL sanity fails operational equivalence: `retrieveG3` E-MIN-V2/C1 was
  bypassed and the schedule seed replaced the known-good request seed.
- Exact rejection attribution is unavailable from retained evidence, so all 40
  records per arm remain `UNOBSERVABLE_INSUFFICIENT_EVIDENCE`.
- TREATMENT formation-specific checks were reached 0/40 times; all 40 outcomes
  are `BASE_P2_REJECTED`.
- Formation-effect identifiability is
  `NOT_IDENTIFIABLE_UPSTREAM_ACTION_COLLAPSE`; scientific validity is
  `INVALID_UPSTREAM_CONTROL_COLLAPSE`.
- Full 184-test suite, strict TypeScript, typecheck, production build, and
  design validation pass. Runtime process/port/GPU/ephemeral cleanup passes.
- Product status remains `KEEP_MUTATION_DISABLED`; the single recovery protocol
  is prepared but was not executed.

## Code-formation CONTROL recovery Session A

**PASS_ZERO_CALL_FREEZE**

- The invalid historical Session B/C artifacts and recovery protocol pass
  detached-checksum verification and remain unchanged.
- The fresh population contains 40 tasks and 40 pairwise-disjoint repository
  revisions; exposed/historical task-ID, revision, and task-fingerprint overlap
  is zero. All 40 reference fixes pass syntax, visible, and hidden checks.
- CONTROL uses `retrieveG3` E-MIN-V2 with C1 packaging, the frozen P2
  prompt/schema, generation seed 20260809, and the known-good runtime hashes.
  Schedule seed 20260813 is explicitly separate.
- All 80 paired intents materialize with no duplicate, missing, malformed, or
  pair-equivalence failure. Treatment changes only the frozen system suffix.
- Privacy-safe parser-stage telemetry and its deterministic failure-category
  coverage pass without raw-output, raw-edit, or L2 retention.
- The new runner/source closure is sealed. Call, observation, and sanity ledgers
  are each zero bytes. The non-primary sanity fixture is prepared but uncalled.
- Before any call, the append-only v2 reseal strengthens formation
  identifiability to at least 20/40 valid TREATMENT base-P2 candidates and
  freezes strict-success-primary paired decision thresholds.
- Target-model calls, FIM/vLLM starts, port-8000 listeners, and GPU allocation
  are zero. Session B was not entered.

## Code-formation CONTROL recovery Session B

**CONTROL_SANITY_GATE_FAIL — FAIL CLOSED BEFORE PRIMARY EXECUTION**

- Required Session-A, preregistration, runner-seal, and results-index hashes,
  detached sidecars, and sealed source closure pass.
- Exact FIM-7B M2 serving identity, FP8 profile, vLLM 0.26.0, revision, and
  generation seed 20260809 pass; no model download occurred.
- Sanity calls/retries are exactly 1/0. The non-primary response was received,
  non-empty, normal-stop, valid JSON, and schema-valid, but P2 normalization
  failed with `RANGE_OUTSIDE_ALLOWED_SCOPE`; valid P2 is false.
- The gate stopped before primary execution. Primary calls, CONTROL calls,
  TREATMENT calls, observations, and pairs are all zero; scored task exposure
  is zero and primary ledgers remain empty.
- Raw outputs, raw edit bodies, L2, safety violations, wrong-file attempts,
  rollback failures, reviewers, and retries are zero.
- Runtime process/port/GPU/ephemeral state and disposable workspaces are fully
  cleaned. Session C is not ready and no treatment-effect interpretation was
  performed.
