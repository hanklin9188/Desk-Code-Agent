# Desk Code Agent Domain Context

## Canonical product language

| Term | Definition |
|---|---|
| **Desk Code Agent** | 本地桌面 AI software-engineering workspace；不是聊天機器人或無界 autonomous developer。 |
| **Run** | 從一份 immutable Task Contract 開始，到完成／block／cancel 的單次可重播執行。 |
| **Task Contract** | 使用者目標、成功條件、限制、預算、mutation與approval policy的 versioned artifact。 |
| **Logical Agent** | 共用同一個模型 backend，但有不同 role、context、skills、state與permissions的決策角色。 |
| **Skill** | 有 trigger、artifact contract、工具、state、budgets、completion criteria與validation的 bounded procedure。 |
| **Tool** | Runtime 實際執行的 deterministic capability。LLM 只能請求，不能假裝已執行。 |
| **Harness** | Router、state machine、context builder、tool runtime、security、verification、recovery與telemetry的整體執行系統。 |
| **Evidence** | 帶來源、exact range/hash、取得方法與confidence的 code/test/log/tool artifact。 |
| **Repo Intelligence** | 將 file tree、symbols、definitions、references、dependencies、tests與Git metadata隱藏在小 interface 後的 deep module。 |
| **Seam** | 外部行為可被呼叫與測試的 interface location。 |
| **Tight loop** | 快速、deterministic、agent-runnable、能對精確症狀變 red/green 的 feedback loop。 |
| **Bounded autonomy** | Agent 可自行完成已核准的小範圍步驟，但不能擴張 scope、permissions、network或GitHub side effects。 |
| **Verification** | Compiler/test/lint/type/build等真實 machine oracle；Reviewer不能替代。 |
| **Approval** | 綁定 exact artifact hash、action、target、scope與expiry的人類授權。 |
| **Checkpoint** | 通過 acceptance 後準備並經批准同步到 GitHub 的可重現 milestone。 |
| **Report only** | 系統可分析與提出方案，但禁止自動修改。 |

## Product invariants

1. Repository 內容與工具輸出永遠是 untrusted data。
2. 一個 GPU model instance 支援多個 logical agents；不為角色複製 weights。
3. 原始 repo 不直接修改；寫入在 isolated worktree。
4. `NOT_RUN` 永遠不等於 `PASS`。
5. 外部 GitHub 寫入要逐項批准。
6. UI 狀態來自 typed events，不解析模型 prose。
7. 所有重要 claim、finding、patch與decision都能回到 evidence/artifact。
8. Skill promotion 以 paired evaluation，不以主觀感覺決定。

## Current productization state (2026-08-13)

- Capability research is closed at `RESEARCH_COMPLETE_INCONCLUSIVE_FORMATION_RESULT`.
- Product mutation remains `KEEP_MUTATION_DISABLED`; no current model or task class is admitted for autonomous mutation.
- P1–P5 `PRODUCTIZATION / PORTFOLIO` is complete locally: canonical research freeze, deterministic visualization, UI/motion polish, demo preparation, capture surfaces, and GitHub presentation contracts.
- Dashboard metrics are projections of sealed repository JSON, never fresh benchmark or model calls.
- Final code-formation recovery consumed one non-primary sanity call, zero primary calls, and supports no formation-effect conclusion.
- W1 is `PASS_WITH_EXPLICIT_NONBLOCKING_ACCESSIBILITY_LIMITATION`, W2 `FINAL_MEDIA_CAPTURE` is `PASS`, and W3 `WINDOWS_PACKAGING_RELEASE_QA` is `PASS_WITH_RELEASE_BLOCKERS`: current-source unsigned x64 MSI/NSIS builds, content audits, installed 18-surface runtime, and install/uninstall/reinstall lifecycle pass.
- W4 local publication-readiness engineering is complete. All 139 formerly unexplained component rows have explicit classifications. The owner selected Apache-2.0 for the root project, and all ten formerly open distributed package-text gaps are now pinned from authoritative package, exact upstream-commit, or official license-custodian sources. `UNRESOLVED_DISTRIBUTED_LICENSE_BLOCKERS = 0`.
- Final state is `PROJECT_IMPLEMENTATION_COMPLETE`, `PORTFOLIO_COMPLETE`, and `WINDOWS_LOCAL_RELEASE_QA_COMPLETE`. Source and owner-authorized unsigned binary publication are approved for v0.1.0. Trusted signing credentials are unavailable, so signing is deferred future hardening. Narrator spoken-output QA remains deferred without a certification claim.

## Canonical workflow verbs

`Contract → Route → Gate → Acquire → Map → Retrieve → Reason → Propose → Verify → Review → Approve → Report → Checkpoint`

避免使用含混詞：

- 不說「AI 讀完整 repo」，說「Repo Intelligence 建圖，Agent 檢索 bounded evidence」。
- 不說「Tester Agent」，說「Deterministic Verification Runtime」。
- 不說「多個模型」，說「一個 shared model、多個 logical agents」。
- 不說「修好了」，說「required verification stages PASS 且 review APPROVED」。

## Current verified decision (2026-08-09 G3)

- Production relative default: frozen E-MIN-V2.
- Research candidate: frozen E-MIN-V3; no global or conditional promotion.
- Global Multi-Agent: disabled.
- Semantic reviewer: disabled by default.
- Deterministic safety and verification: enabled.
- G2 is a ceiling/regression suite, not generalization-ranking evidence.
- G3 holdout E1/V2/V3 success is 6/96, 3/96, and 2/96; exact historical-patch success is 0/60 for all three.
- “Production default” means the selected bounded harness, not autonomous-patch readiness.
- Canonical G3 evidence is `benchmarks/g3/G3_RESULTS_INDEX.json`; decision rationale is ADR 0012.
- This historical G3 capability decision remains unchanged. Current release readiness is tracked separately: implementation, local Windows QA, Apache-2.0 licensing, and distributed dependency license closure are complete. Owner-authorized publication is the active operation; trusted signing and Narrator spoken-output validation remain deferred hardening without blocking the unsigned v0.1.0 release.

## Current verified decision (2026-08-09 G4 and model specialization)

- G4 development is a 217-task sealed diagnostic corpus, not an untouched holdout.
- Qwen3.5-4B remains bounded to structured planning and assisted navigation; diagnosis, coding, mutation, hidden-test autonomy and onboarding synthesis remain `REPORT_ONLY`.
- The controlled Qwen3.5-4B versus Qwen2.5-Coder-3B-Instruct experiment is preregistered with MODEL as the only intended independent variable.
- Qwen2.5-Coder-3B-Instruct revision `488639f1ff808d1d3d0ba301aef8c11461451ec5` was explicitly authorized and exact-snapshot verified in the ignored local cache for non-commercial research/evaluation/experimental development only. No other model or quantized snapshot was authorized or acquired.
- The fresh baseline diagnostic measured oracle-context 0/42, task understanding 0/24, navigation 17/25, diagnosis 2/25, behavioral patch-only 0/25, planning 7/12, one-shot 0/25, and two-call recovery 0/25.
- Baseline runtime validation passed at BF16: clean load 58.59 s, TTFT 69.78 ms, 75.28 tokens/s, idle/peak VRAM 12020/12022 MiB, and shutdown cleanup to 0 MiB with process/port/key absent.
- Post-seal review invalidated the first candidate comparison because its snapshot `generation_config.json` introduced a candidate-only repetition penalty. The invalid run remains append-only evidence but cannot support causal claims. The corrected run explicitly uses `--generation-config vllm`; the baseline snapshot had no generation config and already used those same defaults.
- The corrected candidate measured oracle-context 0/42, task understanding 0/24, navigation 25/25, diagnosis 5/25, behavioral patch-only 0/25, planning 9/12, one-shot 0/25, and two-call recovery 0/25. Candidate load was 33.89 s, TTFT 24.87 ms, throughput 100.10 tokens/s, and peak VRAM 13316 MiB with 3060 MiB headroom.
- The frozen phase counts sum to 203, despite the preregistration prose label of 205. The sealed IDs/counts were preserved without adding or removing tasks.
- Development promotion failed: diagnosis gained 12 pp but the required patch-only gain was 0 pp and one-shot gain was 0 pp. The evidence-based decision is `C_NO_MATERIAL_CODE_SPECIALIZATION_GAIN`; navigation's +32 pp and planning's +16.67 pp cannot replace the required behavioral patch gate.
- Both profiles had zero safety violations, wrong-file edits, and rollback failures; fresh deterministic security fuzz passed 1,000/1,000 and candidate shutdown returned GPU use to 0 MiB with process/port/key absent.
- No fresh holdout was created or inspected, no routing ADR or model-switch benchmark was added, and no 7B/quantized/other model was selected or downloaded.
- Canonical corrected evidence is `docs/experiments/model-specialization/MODEL_SPECIALIZATION_RESULTS_INDEX.v4.json`. The v2 decoding-confounded run and v3 stale prose rendering are explicitly invalidated/superseded but preserved for audit; the earlier inconclusive index also remains immutable historical evidence.

## Current verified decision (2026-08-11 Patch Interface V3 / E-EDIT)

- The controlled 840-call Patch Interface V3 development experiment selected
  `P2_MINIMAL` under the frozen `E_EDIT_JUSTIFIED` gate.  This is new evidence;
  it does not rewrite the earlier model-specialization conclusion.
- Frozen `E-EDIT-P2-V1` reconnects unchanged E-MIN-V2 retrieval and C1 context
  to a structured range edit and the same deterministic constrained patch,
  hard-isolated verification, hidden-test and rollback runtime.
- Under normal retrieval, Qwen3.5-4B achieved 18/50 behavioral success and
  23/50 hidden-test success; Coder-3B achieved 9/50 and 12/50.  Both had the
  exact source selected/included 50/50, zero wrong-file attempts, zero actual
  safety violations and zero rollback failures.
- Only baseline met the frozen retry prerequisite.  One bounded second call on
  its 32 failed tasks recovered 5, producing maximum-two-call success 23/50.
  Coder-3B remained ineligible and received no retry calls.
- Full physical lineage is 7 invalid/excluded V2 calls + 840 valid primary V3
  calls + 100 one-shot normal-retrieval calls + 32 retry calls = 979.
- The simpler interface reveals latent development patch capability, while
  reasoning/model capability remains a material ceiling.  Coder-3B does not
  show a normal-retrieval behavioral advantage in this generation.
- Product mutation remains disabled.  No fresh holdout was created or viewed;
  unseen-repository generalization and autonomous patch readiness remain
  unsupported.  Canonical evidence is
  `docs/experiments/patch-interface/E_EDIT_RESULTS_INDEX.v1.json`.

## Current verified decision (2026-08-11 E-EDIT untouched holdout)

- The repository-disjoint holdout completed all three registered sessions on
  15 pinned fixture repositories and 120 tasks. The mutation population was 95
  tasks; 25 REPORT_ONLY/safety tasks used deterministic zero-call oracles.
- P0_EXACT achieved 0/95 strict behavioral success. Frozen P2 E-EDIT achieved
  23/95, with 89 valid actions, 71 syntax passes, 33 visible-test passes and 42
  hidden-test passes. Paired outcomes were 0 both-pass, 0 baseline-only, 23
  E-EDIT-only and 72 both-fail, for +24.21 pp.
- E-EDIT failed the frozen 57/95 promotion gate and the 29/95 assisted-only
  floor. Retry was not eligible and received zero calls. Holdout lineage is 190
  calls; full physical lineage is 1,169 with no duplicates or silent retries.
- Fresh exact-source retrieval was 90/95, not the development 50/50 ceiling.
  The five misses remain a separate measured limitation. After retrieval,
  accepted edits still failed syntax or behavior often enough that model
  semantic capability remains the dominant post-interface ceiling.
- Product decision is `KEEP_MUTATION_DISABLED`. E-EDIT is a
  `RESEARCH_ONLY_MUTATION_INTERFACE`, not a production Skill or assisted edit
  route. ADR 0015 records the decision.
- A practical local 7B model tournament is scientifically justified as a
  protocol only. No revision is selected, and no model download or execution
  is authorized. Any future product claim requires a newly sealed untouched
  holdout.
- Canonical evidence is
  `docs/experiments/patch-interface/E_EDIT_HOLDOUT_RESULTS_INDEX.v1.json`.

## Current verified decision (2026-08-11 practical local 7B tournament Session A)

- Tournament Session A is complete with zero tournament model calls and zero
  model-weight downloads. Product mutation remains `KEEP_MUTATION_DISABLED`
  and E-EDIT remains `RESEARCH_ONLY_MUTATION_INTERFACE`.

## Current verified decision (2026-08-12 code-formation constraint Session A)

- Session A of `CODE_FORMATION_CONSTRAINT_EXPERIMENT` is complete with zero
  target-model calls. FIM/vLLM was not started; port 8000 and GPU allocation
  were zero at the completion gate.
- The only treatment variable is the frozen `P2_FORMATION_CONSTRAINT_V1`: one
  static formation-only system suffix plus a deterministic rejection-only
  whole-source parse gate. It does not rewrite candidates, add semantic
  evidence, alter retrieval/context/P2 scope, retry, or invoke a reviewer.
- The fresh population contains 40 target-model-unseen tasks in 40 pairwise
  repository-disjoint pinned fixtures. All sealed reference fixes pass syntax,
  visible, and hidden checks.
- Control/treatment pairing is frozen to 80 one-shot calls with seed 20260812
  and counterbalanced order. The future call and observation ledgers remain
  empty; Session B has not started.
- Canonical Session-A evidence is
  `docs/experiments/model-specialization/CODE_FORMATION_CONSTRAINT_EXPERIMENT_SESSION_A.v1.json`.

## Current verified state (2026-08-12 code-formation Session B pre-call abort)

- Session B failed closed before its first `CALL_STARTED` record and before any
  target-model request. Planned/actual calls are 80/0; both append-only ledgers
  remain empty.
- The exact FIM-7B FP8 runtime passed identity and endpoint checks. The sealed
  runner then referenced nonexistent `prereg.systemPrompt`; the frozen prompt
  is stored at `prereg.control.systemPrompt`.
- No runner/config hot patch or silent retry was performed. Session B is not
  complete and Session C is not authorized.
- Runtime cleanup passed: model processes, port 8000, GPU allocation,
  ephemeral API-key/state files, and disposable workspaces are absent.
- A separate zero-call correction and source reseal is required before another
  Session-B attempt. Canonical abort evidence is
  `docs/experiments/model-specialization/CODE_FORMATION_CONSTRAINT_EXPERIMENT_SESSION_B_PRECALL_ABORT.v1.json`.

## Current verified state (2026-08-12 code-formation runner correction)

- The pre-call abort remains immutable. A zero-call infrastructure-only
  correction now resolves CONTROL from `prereg.control.systemPrompt` and
  TREATMENT from that prompt plus the unchanged frozen treatment suffix.
- Static audit validates all 10 runner/materializer preregistration field paths
  with zero invalid references.
- All 80 request intents materialize without inference: 40 CONTROL, 40
  TREATMENT, 40 complete pairs, zero duplicates/missing/malformed intents.
  Seed 20260812, population, revisions, schedule, prompts, schema, model,
  verification, safety, scoring, and thresholds are unchanged.
- Historical runner `f2b6a467…` is superseded pre-call only. Corrected runner
  `4ab314e6…` and its source closure are append-only sealed.
- Model calls and task exposure remain zero; ledgers remain empty. Session B is
  ready only for a separate invocation, and Session C remains unauthorized.
- Canonical correction evidence is
  `docs/experiments/model-specialization/CODE_FORMATION_CONSTRAINT_EXPERIMENT_SESSION_B_CORRECTION.v1.json`.

## Current verified state (2026-08-12 code-formation Session B)

- The corrected paired run completed all 80 frozen one-shot calls: 40 CONTROL,
  40 TREATMENT, and 40 complete counterbalanced pairs. There were no retries,
  duplicate calls, reviewers, or schedule/request-intent drift.
- Both conditions recorded 0 valid P2 actions, 0 constructed patches, and 0
  syntax/visible/hidden/strict passes. All 40 paired transitions are
  `MODEL_FAILURE -> MODEL_FAILURE`; the treatment gate rejected all 40 only
  after the underlying P2 action had already failed validation.
- CONTROL used 11,323 total tokens with 50,919.71 ms aggregate latency;
  TREATMENT used 14,657 tokens with 47,047.63 ms aggregate latency.
- Wrong-file attempts, actual safety violations, rollback failures, raw-output
  retention, raw-edit retention, and L2 records are all zero.
- Runtime cleanup passed and Session B is sealed. No treatment-effect or
  promotion conclusion was made; Session C requires a separate invocation.
- Canonical evidence is
  `docs/experiments/model-specialization/CODE_FORMATION_CONSTRAINT_EXPERIMENT_SESSION_B.v1.json`.

## Current verified decision (2026-08-12 code-formation Session C)

- Session C made zero target-model calls and sealed the scientific-validity
  audit. Formation-effect identifiability is
  `NOT_IDENTIFIABLE_UPSTREAM_ACTION_COLLAPSE`.
- The formation-specific constraint was reached by 0/40 TREATMENT records; all
  40 stopped at `BASE_P2_REJECTED`. The run therefore tested only upstream
  action-representation rejection, not the registered formation hypothesis.
- CONTROL differed from the known-good historical FIM/P2 path in two proven
  ways: direct task-plus-source construction bypassed `retrieveG3` E-MIN-V2/C1,
  and seed 20260812 was used for request decoding instead of the frozen 20260809
  generation seed.
- Retained evidence cannot distinguish invalid JSON, wrong shape, missing
  fields, invalid ranges, truncation, refusal, or other exact parser/schema
  causes. All 40 observations in each arm are consequently classified
  `UNOBSERVABLE_INSUFFICIENT_EVIDENCE`; no cause is inferred from hashes.
- Scientific validity is `INVALID_UPSTREAM_CONTROL_COLLAPSE`; every formation
  treatment-effect metric is `NOT_INTERPRETABLE_FOR_FORMATION_EFFECT`.
- Product state remains `KEEP_MUTATION_DISABLED`. The exposed 40 tasks are
  diagnostic-only and forbidden as fresh evidence.
- Exactly one `CODE_FORMATION_CONTROL_RECOVERY_GENERATION` protocol is sealed
  for a fresh repository/task-disjoint population, but it was not executed.
- Canonical Session-C evidence is
  `docs/experiments/model-specialization/CODE_FORMATION_CONSTRAINT_EXPERIMENT_SESSION_C.v1.json`
  (SHA-256 `adafbe6111ca3de880a181fefe84e4d8f0f8d7bb030ea74c37e2442a5fc5187f`).

## Current verified state (2026-08-12 code-formation CONTROL recovery Session A)

- `CODE_FORMATION_CONTROL_RECOVERY_GENERATION` Session A passed as a zero-call
  freeze. The invalid historical 0-vs-0 experiment remains immutable and its
  40 exposed tasks remain diagnostic-only.
- Forty new target-model-unseen tasks use forty pairwise-disjoint synthetic
  repository revisions. Task-ID, revision, and normalized task-fingerprint
  overlap with the exposed and historical comparison populations is zero; all
  reference fixes pass syntax, visible, and hidden verification.
- CONTROL now uses the historical request construction exactly:
  `retrieveG3(task, "E-MIN-V2", 2048)` with C1 context and the frozen E-EDIT
  P2 prompt/schema. The normalized known-good and recovery CONTROL config
  hashes match.
- Model generation seed is `20260809`; the independently preregistered
  counterbalancing seed is `20260813`. They are not reused across roles.
- All 80 paired primary request intents materialize with equal prompt, schema,
  repository, and retrieval evidence inside each pair. The only treatment
  inference difference is the frozen formation suffix; its rejection gate is
  applied only after a valid base P2 action.
- Privacy-safe parser telemetry distinguishes response, JSON/schema/action,
  patch-construction, truncation/refusal, and valid-P2 stages without retaining
  raw output, raw edit bodies, or L2 evidence.
- A single non-primary, non-scored CONTROL sanity fixture is frozen for the
  Session-B pre-primary gate. It was not called in Session A.
- Runner/source closure is sealed and all future ledgers are zero bytes.
  Target-model calls, vLLM starts, port listeners, and GPU allocation are zero.
- The initial zero-call seal was append-only superseded before any model call to
  require at least 20/40 valid TREATMENT base-P2 candidates and to freeze the
  exact strict-success-primary paired decision thresholds.
- Canonical Session-A evidence is
  `docs/experiments/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_SESSION_A.v2.json`
  (SHA-256 `7e68597e3f116eafd3e3ebeae8734f98d9564c7bdcb1d459ad4c1eb768d73b46`).
  Complete validation is sealed in results index v4 (SHA-256
  `09a293861bfd4f6448c84f525736f2ea02df001eb81c50176b19186ab2416b81`).
  Session B requires a separate invocation; product status remains
  `KEEP_MUTATION_DISABLED`.

## Current verified state (2026-08-12 code-formation CONTROL recovery Session B)

- Session B verified the exact Session-A v2 artifact, v2 preregistration,
  runner seal, results index, source closure, frozen population, seeds, and
  empty ledgers before starting the pinned FIM-7B FP8 profile.
- The exact M2/FIM serving identity passed: revision `5a1d429...`, vLLM 0.26.0,
  FP8 per-tensor W8A8, context 8192, and generation seed 20260809. No download
  or profile substitution occurred.
- Exactly one preregistered non-primary CONTROL sanity call was made. It
  received a non-empty response, stopped normally, parsed as JSON, and passed
  the P2 JSON schema. Normalization nevertheless ended as `UNSAFE_EDIT` with
  terminal code `RANGE_OUTSIDE_ALLOWED_SCOPE`, so it was not a valid P2 action.
- The frozen fail-closed gate stopped immediately. Primary CONTROL/TREATMENT
  calls and complete pairs are 0/0/0; no scored task was consumed, no prompt
  was tuned, and retries/reviewers are zero.
- Raw-output retention, raw-edit retention, L2, wrong-file attempts, actual
  safety violations, and rollback failures are zero. Primary call and
  observation ledgers remain zero bytes.
- FIM/vLLM stopped; port 8000, GPU compute allocation, ephemeral API state, and
  disposable recovery workspaces are clear.
- Session status is `CONTROL_SANITY_GATE_FAIL`; Session C is not ready and no
  formation-effect conclusion was made. Capability research closes as
  `RESEARCH_COMPLETE_INCONCLUSIVE_FORMATION_RESULT`; the next phase is
  product/portfolio/release polish. Product mutation remains disabled.
- Canonical Session-B evidence is
  `docs/experiments/model-specialization/CODE_FORMATION_CONTROL_RECOVERY_SESSION_B.v1.json`
  (SHA-256 `58237e5130aaee5b8d22c0c38c905ec2da0d3b919436a5fc44c56fe755c80de6`)
  and fully validated results index v6 SHA-256 is
  `fa5cb5c53dc5d58099af28f35dd59ba797d79c4daf3d9c5ce65049780cd3c728`.
- Exact candidate pins are Qwen2.5-Coder-7B-Instruct `c03e6d3...`,
  TIGER-Lab/FIM-7B `5a1d429...`, and SWE-agent-LM-7B `a44fce0...`.
- All three candidates share the Qwen2 7.615B-parameter architecture and
  15.23 GB BF16 weight payload. They declare Apache-2.0; FIM-7B has no
  standalone LICENSE at the pinned revision and requires acquisition-time
  revalidation.
- BF16 is not safely feasible on the 16,376 MiB RTX 4080 SUPER. The frozen
  matched candidate profile is vLLM 0.26.0 online FP8 per-tensor W8A8 from
  each exact official BF16 snapshot. Fit and compatibility remain Session-B
  smoke gates; no automatic quantizer or context fallback is allowed.
- The existing 95 mutation tasks are disclosed screening reuse, not a new
  untouched holdout. Existing 4B BF16 23/95 evidence is reused with zero new
  reference calls. Any product promotion requires a new repository-disjoint
  untouched holdout.
- Canonical evidence is
  `docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_A.v1.json`.
  Session B later completed under exact owner approval.

## Current verified state (2026-08-11 practical local 7B tournament Sessions B/C)

- Session B acquired and verified only the three authorized exact BF16
  snapshots, then validated the matched vLLM 0.26.0 online FP8 per-tensor W8A8
  profile sequentially. All three candidates were `READY_FOR_PRIMARY`; canonical
  evidence is `MODEL_TOURNAMENT_SESSION_B.v1.json`.
- Session C executed exactly 95 one-shot E-EDIT P2 calls per candidate in
  M1→M2→M3 order: 285 primary calls, three standardized telemetry calls, zero
  retries and zero reviewer calls.
- M1 and M2 completed with no transport, safety, wrong-file or rollback
  failures and are valid inputs to Session D. Their strict behavioral counts
  are 7/95 and 29/95 respectively.
- M3 has two consumed post-call length/transport failures and is therefore
  `INFRASTRUCTURE_BLOCKED_NOT_SCORED`; no retry or substitution was performed.
  Its rows remain immutable audit evidence.
- All models were stopped. Port 8000 is clear, GPU allocation is 0 MiB,
  ephemeral API key/state is absent, and no orphan worktree remains.
- Session C is operationally `PASS` with the preregistered infrastructure
  exclusion. No paired analysis, threshold classification, winner selection or
  product decision occurred. Session D requires a separate zero-primary-call
  invocation. Product mutation remains disabled.
- Canonical evidence is
  `docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_C.v1.json`.

## Current verified decision (2026-08-11 practical local 7B tournament Session D)

- Session D completed using sealed evidence with zero new model calls. M3 was
  not rerun and remains `INFRASTRUCTURE_BLOCKED_NOT_SCORED`.
- M1 versus the 4B BF16 reference materially regressed by 16/95. Generic model
  scale is not supported as the explanation, especially because the practical
  7B profile is FP8 rather than BF16.
- M2 versus M1 gained 22/95 strict successes under matched 7B conditions;
  paired task and repository-cluster intervals exclude zero. This supports
  `MATERIAL_FIM_AGENTIC_GAIN` as a bounded post-training/model-package finding.
- M2 versus the 4B reference gained 6/95, but task uncertainty crosses zero and
  exact McNemar is not significant. A material improvement over the current
  research reference is not established.
- M2 reaches exactly 29/95 (`ASSISTED_FLOOR`) but misses the research, strong
  and product thresholds. The all-gates decision is `NO_MODEL_PROMOTED` and
  product state remains `KEEP_MUTATION_DISABLED`.
- M2 is eligible only for `BEST_7B_BOUNDED_RETRY`. Its zero-call Session A is
  now sealed; Session B execution has not started. Any product claim still
  requires a newly sealed repository-disjoint untouched validation.
- Canonical evidence is
  `docs/experiments/model-specialization/MODEL_TOURNAMENT_RESULTS_INDEX.v2.json`;
  ADR 0016 records the durable decision.

## Current verified state (2026-08-11 BEST 7B bounded retry Session A)

- Session A is `PASS` with zero model calls, zero vLLM starts and zero model
  loads. The original 95 M2 one-shot observations and 285 call events remain
  immutable.
- Eligibility is the complete mechanically derived M2 strict-failure set:
  66 tasks ordered by task ID. The failure classes are 47 visible-test, six
  hidden-test, six syntax/type, five retrieval and two action-validation.
- Hidden-test retry evidence is a generic non-leaking failure signal only.
  Hidden source/assertions/expected output/expected patch and reference fixes
  are neither model-visible nor persisted.
- All 66 request intents have per-row hashes and aggregate SHA-256
  `765c9f8171d5f8d8dee95de7962da16ef9bf5f5111f918a969116deead451b45`.
  The second-call maximum is exactly one per eligible task; no third call,
  reviewer, human diagnosis, fallback or conversation replay is permitted.
- Repeated edit means exact canonical-diff hash equality. Contradiction means
  the retry regresses a deterministic stage that was PASS on the first attempt.
  These definitions and all cost/safety thresholds were sealed before results.
- Product decisions are unchanged: `NO_MODEL_PROMOTED`,
  `KEEP_MUTATION_DISABLED`, and E-EDIT P2 remains research-only.
- Canonical Session-A evidence is
  `docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_SESSION_A.v1.json`.
  Session B later completed in a separate invocation.

## Current verified state (2026-08-12 BEST 7B bounded retry Session B)

- Session B executed exactly the 66 sealed retry intents with the exact
  FIM-7B revision and frozen vLLM FP8 profile. Lineage contains 198 ordered
  intent/start/completion events, with zero duplicates, silent retries, third
  calls, reviewer calls or infrastructure failures.
- Recorded outcomes are one recovered, 12 failed-different, 42 repeated-edit,
  four contradiction, three malformed, four safety-rejected and zero
  infrastructure-failure. These are execution facts only; their scientific or
  product interpretation belongs exclusively to Session C.
- Failure transitions include one `VISIBLE_TEST → SUCCESS`; the most frequent
  transition is `VISIBLE_TEST → VISIBLE_TEST` at 44. All six original hidden
  failures remained `HIDDEN_TEST → HIDDEN_TEST` under generic non-leaking
  feedback.
- Wrong-file attempts, actual safety violations and rollback failures are all
  zero. Every isolated fixture was removed and repositories remained clean.
- Calls consumed 35,877 prompt and 4,485 completion tokens. Median/p95
  end-to-end latency was approximately 816.83/2,335.01 ms. Load, idle VRAM,
  inference peak and TTFT are `NOT_MEASURED` in the append-only supplement;
  unsupported telemetry was not converted to zero or substituted from an old
  run.
- FIM-7B is stopped, port 8000 is clear, GPU allocation is 0 MiB and ephemeral
  serving state is absent.
- Canonical evidence is
  `docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_SESSION_B.v1.json`.
  Existing `NO_MODEL_PROMOTED`, `KEEP_MUTATION_DISABLED` and research-only
  E-EDIT status remain unchanged. Session C requires a separate invocation.

## Current verified decision (2026-08-12 BEST 7B bounded retry Session C)

- Session C uses deterministic analysis only: zero model calls, no rerun, no
  third attempt, and no FIM process start.
- FIM-7B increases from 29/95 to maximum-two-call 30/95. Recovery is 1/66
  (1.52%); 55/66 remain at the same failure stage and 42/66 repeat the exact
  failed canonical edit. Hidden and syntax failures recover 0/6 each.
- The 66 calls add 40,362 tokens and 63,193.95 ms for one recovery. The frozen
  efficacy, repetition and eligible-subset token gates fail; deterministic
  safety and latency gates pass.
- The retry decision is `RETRY_NO_MATERIAL_GAIN`; retry remains disabled by
  default. FIM-7B remains the strongest scored research candidate at the
  assisted floor only. Product mutation remains `KEEP_MUTATION_DISABLED`.
- Exactly one next protocol is prepared but not executed:
  `SEMANTIC_FAILURE_DECOMPOSITION`. It permits no model calls, retries, repairs
  or product promotion.
- Canonical evidence is `BEST_7B_BOUNDED_RETRY_RESULTS_INDEX.v2.json` and
  `BEST_7B_BOUNDED_RETRY_SESSION_C.v1.json` under
  `docs/experiments/model-specialization/`.

## Current verified state (2026-08-12 semantic failure decomposition Session A)

- Session A is sealed with zero target-model calls, no model process, and no
  deep per-task classification. It verifies 95 unique one-shot observations,
  29 success controls, 66 primary failures and exact retry linkage for all 66.
- The canonical T1–T14 taxonomy, maximum two secondary categories, seven
  independent dimensions, concise evidence schema, blinding rules, quality
  audit and G1–G5 next-experiment gates are frozen before Session B.
- Raw first-attempt outputs/actions were not persisted. Any semantic category
  that depends on unavailable edit content must fail closed to
  `T14_AMBIGUOUS_OR_INCONCLUSIVE`/LOW unless separate immutable observable
  evidence directly supports it. Failure stage or oracle alone is insufficient.
- Deep Session-B inspection will mark the 95-task set `ANALYSIS_EXPOSED`; it
  cannot later be described as fresh promotion/generalization evidence.
- Canonical evidence is
  `benchmarks/model-specialization/SEMANTIC_FAILURE_DECOMPOSITION_PREREGISTRATION.v1.json`
  and
  `docs/experiments/model-specialization/SEMANTIC_FAILURE_DECOMPOSITION_SESSION_A.v1.json`.
  Session B requires a separate invocation.

## Current verified state (2026-08-12 semantic failure decomposition Session B)

- Session B completed with zero target-model calls. All 66 first-attempt
  failures have exactly one frozen primary category, complete dimensions and
  immutable citations; all 29 success controls have matching structural data.
- Direct evidence supports T11 retrieval 5, T12 action/representation 2 and T13
  syntax/code formation 6. The remaining 53/66 are T14/LOW because raw edit
  content is unavailable and failure stages/hashes cannot identify semantics.
- Confidence is HIGH 13 and LOW 53. Specific non-T14 coverage is 13/66, while
  supported T1–T9 program-semantic cause coverage is intentionally 0/66 rather
  than speculative.
- Evidence sufficiency is 5 missing-required and 61 partially sufficient among
  failures; all 29 controls are also partially sufficient. Exact source was
  visible in the partial rows, while the visible test was not in final C1.
- Objective reference scope is SINGLE_RANGE for all 95 tasks. This does not
  reveal the unpersisted model edit scope or prove P2 was/was not the cause.
- The frozen independent audit reviewed 60 unique records and found zero
  disagreements. G1–G5 remain unapplied; retry/product/model/interface
  decisions are unchanged. Session C requires a separate invocation.
- Canonical evidence is
  `docs/experiments/model-specialization/SEMANTIC_FAILURE_DECOMPOSITION_SESSION_B.v1.json`.

## Current verified state (2026-08-12 semantic failure decomposition Session C)

- Session C completed with zero target-model calls. Frozen G1 is 5/66 versus
  30%; G2 and G3 are 0/66 and lack SUFFICIENT failure evidence; G4 fails because
  T13 (6) is not the unique largest primary family. G5 is therefore applied.
- The precise conclusion is that no single G1–G4 intervention is supported by
  the historical artifacts, while semantic observability is insufficient for a
  more specific causal intervention. This is not proof of one mixed T14 cause,
  nor proof that model semantics are adequate or dominant.
- Execution outcomes remain strongly auditable, but 53/66 failures are T14/LOW
  because raw edit bodies were intentionally not retained. Supported T1–T9
  semantic-cause coverage is 0/66; this is a separate observability ceiling.
- Exactly one next experiment is prepared and unexecuted:
  `PRIVACY_SAFE_SEMANTIC_OBSERVABILITY_EXPERIMENT`, using 80 new
  repository-disjoint tasks and paired Level-0 hash-only / Level-1 structured
  derived-feature views. Level 2 bounded edit-body retention remains
  unauthorized and requires separate explicit approval.
- Product state is unchanged: `KEEP_MUTATION_DISABLED`; FIM remains the best
  research-only candidate and E-EDIT P2 remains research-only. The analyzed 95
  tasks remain `ANALYSIS_EXPOSED` and are not fresh promotion evidence.
- Canonical evidence is
  `docs/experiments/model-specialization/SEMANTIC_FAILURE_DECOMPOSITION_SESSION_C.v1.json`
  and results index v2 under the Session-B artifact directory.

## Current verified state (2026-08-12 privacy-safe semantic observability Session A)

- Session A is sealed with zero target-model calls and no vLLM/model process.
  It freezes 80 tasks across eight newly authored repository-disjoint fixtures;
  repository-ID and canonical task-fingerprint overlap with the exposed 95-task
  population are both zero.
- Every reference fix passes deterministic syntax, visible and hidden checks.
  The task manifest, repository payload and model-hidden oracle are immutable
  and checksum-bound before any future call.
- L0 retains hashes, retrieval metadata, bounded verification, safety and
  rollback only. L1 derives bounded AST/control-flow/operator/count deltas and
  keyed HMAC digests while the edit is transient; it retains no raw prompt,
  output, edit body, identifier, literal, comment or source.
- Privacy canaries and repeated extraction are PASS with zero verbatim leaks
  and byte-identical features. L0 and L1 must come from the same physical call;
  no retry, reviewer or retention-specific inference is permitted.
- Session C may read only the L0 packet root. The restricted L1 root and hidden
  oracle are forbidden inputs. L2 remains unauthorized.
- Session B is not started. It requires a separate invocation, source-sealed
  runner, zero-call dry run, empty ledgers, exact FIM serving attestation and
  hard isolation before the first of at most 80 one-shot calls.
- Canonical evidence is
  `docs/experiments/model-specialization/PRIVACY_SAFE_SEMANTIC_OBSERVABILITY_SESSION_A.v1.json`
  and `PRIVACY_SAFE_SEMANTIC_OBSERVABILITY_RESULTS_INDEX.v1.json`.

## Current state (2026-08-12 privacy-safe semantic observability Session B abort)

- The runner source seal and zero-call dry run passed. Exact FIM-7B M2 serving,
  empty ledgers and hard isolation also passed before calls began.
- Four physical calls were consumed. Three produced complete checkpoint rows
  and same-call L0/L1 pairs. The fourth has a durable unmatched `CALL_STARTED`;
  its generated after-source failed the sealed L1 AST parser before packet
  persistence. Tasks 5–80 were not called.
- The runner stopped without retry, reviewer, repair call or behavior-changing
  hot patch. The fourth observation must never be silently rerun, and this
  generation is permanently `ABORTED_FAIL_CLOSED`, not Session-B PASS.
- Raw model outputs/edit bodies and HMAC key material were not persisted. FIM,
  port 8000, GPU allocation, API key, serving state and temporary execution
  state were cleaned.
- Canonical evidence is
  `docs/experiments/model-specialization/PRIVACY_SAFE_SEMANTIC_OBSERVABILITY_SESSION_B_PARTIAL_ABORT.v1.json`.
  Any future attempt requires a new append-only protocol and explicit routing;
  Session C is not ready.

## Current verified state (2026-08-12 privacy-safe semantic observability V2 Session A)

- The aborted V1 generation remains immutable and permanently closed. Its four
  consumed physical calls, three diagnostic-only L0/L1 pairs and unmatched
  fourth `CALL_STARTED` are bound by an append-only V2 supersession; none are
  eligible for primary observability statistics or rerun.
- V2 Session A is sealed with zero target-model calls. The new population uses
  the 76 V1 tasks that had no physical call and no included-context exposure,
  plus four new repository/task-disjoint replacements. Consumed-task overlap,
  historical 95-task fingerprint overlap and within-V2 duplicates are all zero.
- The four replacements pass syntax, visible and hidden reference verification.
  The task/repository/oracle manifests and exact 80 IDs are immutable.
- The V2 L1 extractor is total over completed model responses. Valid action,
  invalid action, malformed JSON, malformed replacement, empty replacement and
  every verification outcome produce exactly one same-call L0 and one L1
  packet. Invalid after-source is evidence (`AFTER_SOURCE_PARSE_STATUS=FAIL`),
  not an extractor exception.
- The malformed matrix plus 1,000 deterministic property cases produced 1,019
  L0/L1 pairs with zero crashes, missing packets, schema-invalid packets,
  nondeterminism or raw canary leaks. The six-scenario hard-isolated pipeline
  dry-run covers success, invalid action, malformed/syntax, visible and hidden
  failures without inference.
- The new runner, total extractor and source closure are sealed. Future Session
  B ledgers and packet directories are empty; port 8000 is clear, GPU model
  allocation is zero and ephemeral model/HMAC state is absent.
- Product state remains `KEEP_MUTATION_DISABLED`; L2 remains unauthorized.
  V2 Session B requires a separate invocation and may perform at most one
  preregistered call per task with no retry or reviewer.
- Canonical evidence is
  `docs/experiments/model-specialization/PRIVACY_SAFE_SEMANTIC_OBSERVABILITY_V2_SESSION_A.v2.json`
  (SHA-256 `c4bae265ebdac2f658a94e1032628df350810c58ba47e10dceb6e75164f7c77d`)
  and `PRIVACY_SAFE_SEMANTIC_OBSERVABILITY_RESULTS_INDEX.v3.json`.

## Current state (2026-08-12 privacy-safe semantic observability V2 Session B abort)

- All frozen Session-A, preregistration, population, totality, source-closure,
  dry-run, snapshot identity and hard-isolation entry gates passed before the
  first V2 call.
- V2 Session B consumed 14 physical FIM-7B calls. The first 13 completed and
  produced 13 exact same-call L0/L1 pairs. Call 14 produced the runner's sealed
  `CALL_FAILED_PRE_RESPONSE` terminal event and the runner stopped immediately.
- No retry, reviewer, hot patch, task replacement or continuation occurred.
  The remaining 66 tasks were not called. This generation is permanently
  `ABORTED_FAIL_CLOSED`, is not Session-B PASS and is not eligible for primary
  L0-vs-L1 analysis. Session C is not ready.
- The 13 persisted pairs pass schema, identity, lineage and sidecar validation.
  Raw-output/edit/identifier/literal/parser-message/HMAC-key leaks are zero;
  safety violations and rollback failures are zero.
- Post-abort typecheck, 157 tests, production build and design validation pass.
  FIM/vLLM is stopped, port 8000 is clear, GPU allocation is zero, and API key,
  HMAC key plus serving state were removed.
- Canonical evidence is
  `docs/experiments/model-specialization/PRIVACY_SAFE_SEMANTIC_OBSERVABILITY_V2_SESSION_B.v2.json`
  (SHA-256 `aa61f458fe3f039bdc7b732d37cef06dc9d31a41b7e405927ed31c0950c63204`)
  and results index v4. A separate append-only recovery decision is required;
  this invocation stops at the Session-B abort boundary.

## Current verified state (2026-08-12 privacy-safe semantic observability V3 Session A)

- V2 remains immutable and permanently classified as an aborted infrastructure
  generation. Its 14 consumed calls and 13 diagnostic L0/L1 pairs are excluded
  from primary observability statistics and none of its consumed task IDs may
  be rerun in V3.
- Durable error identity resolves call 14: its recorded error SHA-256 equals
  `SHA256("INVALID_JSON")`. The model runtime uses that value only when an
  HTTP-success response body is present but JSON parsing fails; the V2 runner
  incorrectly routed every non-null runtime error to `CALL_FAILED_PRE_RESPONSE`.
  Earlier ENOSPC from local disposable repository copies is not supported as
  the direct call-14 cause, although no per-call disk sample was sealed.
- The approximately 318 GB incident came from five concurrently retained full
  repository copies (about 40–72 GB each) that duplicated reusable model cache
  and runtime content. The canonical repository currently uses about 77.2 GB,
  dominated by `.runtime/model` (~66.9 GB) and `runtime/model` (~8.2 GB), with
  one Git worktree.
- V3 freezes a deterministic capacity formula, at most one live disposable
  isolation, capacity/workspace gates before `CALL_STARTED`, and mandatory
  rollback, removal and reclamation before the next task. Nine deterministic
  storage tests cover threshold, cleanup, stale workspace, reclamation and
  simulated workspace ENOSPC.
- The V3 population contains exactly 66 V2 tasks that received zero target
  calls plus 14 new repository/task-disjoint replacements. All 14 consumed V2
  IDs are excluded; historical-95 overlap and duplicate fingerprints are zero;
  all 14 reference repairs pass syntax, visible and hidden verification.
- The V2 total L1 extractor remains unchanged and passes its 19-case malformed
  matrix plus 1,000 property cases. The V3 runner treats `INVALID_JSON` with
  retained transient raw text as a completed response requiring exactly one L0
  and one L1; only transport errors with no response body are pre-response.
- The nine-scenario full-pipeline dry run passes with zero target-model calls,
  zero privacy leaks and zero extractor crashes. V3 future ledgers are empty;
  vLLM is absent, port 8000 is clear, GPU model allocation is zero and
  ephemeral serving/HMAC state is absent.
- Canonical Session-A evidence is
  `docs/experiments/model-specialization/PRIVACY_SAFE_SEMANTIC_OBSERVABILITY_V3_SESSION_A.v3.json`
  (SHA-256 `5e6a60de68bd36602f4f0e8e328ee149e6e1cbcc78483dfc867850b37647bfaf`).
  V3 Session B requires a separate invocation and was not started.

## Current verified state (2026-08-12 privacy-safe semantic observability V3 Session B)

- The source-sealed V3 runner executed exactly 80 one-shot FIM-7B calls: 80
  planned, 80 consumed and 80 completed responses. There were no retries,
  reviewer calls, duplicate calls or pre-response infrastructure failures.
- Every completed response produced exactly one L0 and one restricted L1 packet;
  all 80 same-call identity/request/action bindings pass and there are no orphan
  packets. Raw prompts, outputs, edit bodies, identifiers, literals, parser
  messages and HMAC material were not persisted; L2 remains unauthorized.
- Output accounting records 80 JSON objects and 80 valid P2 actions. Four
  replacements could not yield a valid after-source AST and were retained via
  the frozen `TREE_SITTER_SYNTAX_ERROR` fallback rather than crashing the
  extractor. This Session does not interpret their semantic causes.
- Execution outcomes are 72 patches applied, 67 syntax PASS, 38 visible PASS,
  39 hidden PASS and 36 joint syntax/visible/hidden successes. Safety
  violations, rollback failures, cleanup failures and privacy leaks are zero.
- The storage gate passed before all 80 calls. Peak live disposable isolation
  is one; no capacity failure, stale isolation, cleanup failure or remaining
  workspace occurred.
- Post-run tests, strict TypeScript, typecheck, production build and design
  validation pass. FIM/vLLM is stopped, port 8000 is clear, GPU allocation is
  zero, one canonical worktree remains and API/HMAC/serving state is absent.
- Canonical evidence is
  `docs/experiments/model-specialization/PRIVACY_SAFE_SEMANTIC_OBSERVABILITY_V3_SESSION_B.v3.json`
  (SHA-256 `a421a905381365ede996821ece11e5272ee4e5e0ec11d8c510970bfb9b8541a7`)
  and results index v6. Session C was not entered and requires a separate
  invocation.

## Current state (2026-08-12 privacy-safe semantic observability V3 Session C fail-closed)

- The requested L0-only baseline classification did not begin. The active
  analyst context had already been exposed during Session-B finalization and
  reporting to L1-derived action-parse, action-validation and after-source
  parser-failure aggregates. The durable Session-B envelope also contains these
  L1-derived summaries.
- A blind L0-only baseline therefore cannot be validly claimed from this
  context. Session C followed its explicit contamination rule and stopped with
  `INVALID_L0_BASELINE_DUE_TO_PREEXISTING_L1_SEMANTIC_EXPOSURE`.
- This Session opened zero L0 packets, zero restricted-L1 packets and zero
  hidden-oracle rows. It wrote zero classifications, performed no quality audit
  and created no `L0_SEMANTIC_CLASSIFICATION_BASELINE` artifact.
- Target-model calls and model starts are zero. Runtime cleanup, strict
  TypeScript, targeted tests, typecheck, production build, design validation
  and the scoped secret scan pass.
- Canonical abort evidence is
  `docs/experiments/model-specialization/PRIVACY_SAFE_SEMANTIC_OBSERVABILITY_V3_SESSION_C.v3.json`
  (SHA-256 `82790f1f9f4e0a91aba2c3e57196e95129caf4d0ae76ea70616c1d38db0fb83b`)
  and results index v7. Session D is not ready. Any recovery requires a fresh,
  isolated analyst context that has not received L1-derived summaries and an
  explicitly authorized append-only recovery protocol.

## Current verified state (2026-08-12 privacy-safe semantic observability V3 Session D)

- The historical Session-C contamination abort remains immutable. A separately
  authorized, closed-world clean-room invocation sealed the canonical L0
  baseline with SHA-256
  `6b7337367a097356f40d05376508f3448de35b433184a7b09a1666b1d1dbecdf`:
  36 strict successes, 44 strict failures, T13 13/44, T14 31/44, T1–T9
  coverage 0/44 and HIGH/MEDIUM coverage 13/44. Its 34-row audit has perfect
  agreement and no disagreement.
- Session D verified the L0 identity without parsing its labels, then
  independently classified all 44 failures from sealed L1 structured-derived
  packets. The immutable L1 primary distribution is T1=6, T3=4, T7=5,
  T13=13 and T14=16; every other category is zero. Its 22-row frozen audit has
  raw agreement and Cohen kappa of 1.0.
- Paired T1–T9 supported coverage improves from 0/44 to 15/44 (+34.09 pp),
  T14 falls from 31/44 to 16/44 (-34.09 pp), HIGH/MEDIUM coverage improves
  from 13/44 to 28/44 (+34.09 pp), and non-T14 coverage improves from 13/44
  to 28/44. The exact paired task set is unchanged.
- L1 stores zero raw model output, edit body, code identifiers, literal values,
  parser messages or HMAC key material; L2 usage and forbidden leaks are zero.
  The paired observations required no additional model calls.
- The frozen decision is `L1_OBSERVABILITY_JUSTIFIED`. Structured AST,
  control-flow, operator, literal-type, API-call, range and parser/fallback
  metadata unlock supported diagnosis while 16/44 failures remain
  inconclusive.
- The dominant supported primary family is T13 syntax/code formation. Exactly
  one `CODE_FORMATION_CONSTRAINT_EXPERIMENT` protocol is prepared, not
  executed. It requires fresh repository-disjoint tasks and separate
  authorization.
- Product state is unchanged: `KEEP_MUTATION_DISABLED`; FIM and E-EDIT P2
  remain research-only. No model promotion, L2 retention or next-experiment
  execution occurred.
- Canonical L1 evidence is
  `docs/experiments/model-specialization/PRIVACY_SAFE_SEMANTIC_OBSERVABILITY_V3_L1_SEMANTIC_CLASSIFICATION_BASELINE.v3.json`
  (SHA-256 `3d667a05f8dfbde5b5f3dd651bbe733d6af4693d3bfca564cbbda53e261faa78`)
  and the paired report is
  `docs/experiments/model-specialization/PRIVACY_SAFE_SEMANTIC_OBSERVABILITY_V3_PAIRED_OBSERVABILITY_REPORT.v3.json`
  (SHA-256 `4598bb72fcdd7e03007e27efe32ec368f10220c3f097b860c2c9a1f821e34d0c`).
