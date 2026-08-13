# Desk Code Agent — Master Execution Plan

Updated: 2026-08-13
Canonical design: `DESK_CODE_AGENT_V2_MASTER_DESIGN.md`  
Active contract: `implementation/V0_2_0_RELEASE_CANDIDATE_CONTRACT.md`

## Status vocabulary

`PASS` requires executable evidence. `PARTIAL` means a working slice exists but the milestone gate is incomplete. `NOT_RUN` records an unavailable oracle or environment. `NEED_APPROVAL` means a protected action is prepared but not executed. Planning and simulated UI data are never completion evidence.

For active continuation work, remaining gates use `READY`, `ACTIVE`,
`BLOCKED_EXTERNAL`, `BLOCKED_APPROVAL`, `NOT_RUN`, `PASS`, or `FAILED`.

## Active maintenance work package — DESKTOP_UX_V0_2_0_RELEASE_CANDIDATE

State: `V0_2_0_RELEASE_PUBLISHED`

The owner reopened the published product for a bounded first-use, visual-
comfort, Windows package, and GitHub presentation refinement. This does not
reopen capability research, model selection, or mutation.
`RESEARCH_COMPLETE_INCONCLUSIVE_FORMATION_RESULT` and
`KEEP_MUTATION_DISABLED` remain unchanged. The public v0.1.0 history and assets
remain immutable; v0.2.0 is now the current public release.

Completed implementation:

- replaced fixture-populated startup with an empty, three-step repository
  onboarding surface;
- added a native directory picker and async, bounded, read-only repository
  identity/file-manifest command with stable errors and no child process;
  repository-reported branch/HEAD text comes from bounded in-tree `.git` reads;
  the metadata remains untrusted and object validity is not claimed. Metadata
  indirection and symlinks fail closed, and repository-local Git config is
  never parsed. This supersedes the earlier Git-command design after canaries
  proved status filters and config paths could trigger external execution or
  reads;
- separated the fixed guided demo from user repositories and labelled every
  demo surface as fixture data with zero repository/model access;
- consolidated navigation to eight workflow/research destinations and disabled
  task-only surfaces until a compatible runtime or explicit demo is active;
- added System/Dark/Light themes, 100/110/125% text sizing,
  Comfortable/Compact density, live reduced-motion behavior, semantic colors,
  visible focus, and responsive panels down to the native 760×520 minimum;
- kept selected repositories read-only and kept Run disabled because the Node
  repository-intelligence/task services are not yet bridged to the desktop;
- added onboarding, gateway, appearance, motion, accessibility, and responsive
  regression coverage plus English and Traditional Chinese quick starts;
- added a deterministic v0.2.0 presentation registry, five current 1440×900
  screenshots, and a 1280×640 social-preview asset without changing sealed
  v0.1.0 media;
- redesigned the GitHub README around first-run setup, current capabilities,
  honest limitations, visual comfort, safety, and installation;
- bumped package, Cargo, and Tauri versions coherently to 0.2.0 and produced
  separate unsigned MSI/NSIS artifacts;
- refreshed the locked Windows runtime SBOM, notices, and license inventory:
  205/205 dependencies have authoritative text, 126 unique texts are pinned,
  and unresolved distribution blockers are zero;
- added review-branch CI for the Linux product gate and Windows Rust gate.

Validation status:

- full clean index-export design/type/test/build gate: PASS (2390 design files,
  0 warnings/errors; 50 test files, 255 passed and one explicit installed-
  runtime probe skipped; production build PASS). The contaminated developer
  tree separately ran 256/256, without changing the clean-source result;
- focused post-remediation UX suite: PASS (8 files, 39 tests);
- Windows Rust `fmt`, 5/5 native tests, and `clippy -D warnings`: PASS on the
  exact NTFS stage after the no-child-process security correction;
- real Windows Edge visual inspection: PASS for dark/light research at
  1440×900 and light onboarding at 980×680 and 760×520 with 125% app text;
- current v0.2.0 media: PASS (5 screenshots and social preview, current-source
  closure, privacy and checksum scans);
- unsigned Windows package lifecycle: PASS for the privacy-remapped final
  MSI/NSIS, per-user MSI smoke lifecycle, v0.1→v0.2 NSIS upgrade, and clean-
  profile NSIS install/startup/inspection/uninstall/reinstall; superseded
  binary hashes are explicitly prohibited in v4 evidence;
- independent Spec/Product and Security/Engineering re-reviews: PASS with no
  unresolved High or Medium findings;
- scoped staging/privacy review, intentional branch commits, normal branch
  push, PR #1 merge, annotated tag, and public GitHub Release: PASS;
- remote CI: PASS for both the Linux design/test/web-build job and the Windows
  native fmt/test/clippy job.

The authorized v0.2.0 publication work package is complete. PR #1 was merged
with merge commit `feb3739601c1577818b9faf346a528d95ef09f14`; annotated tag
`v0.2.0` targets that commit; the public non-draft release contains the
checksum-verified unsigned MSI and NSIS. Optional trusted signing and GitHub
Settings social-preview upload remain deferred.

Explicitly deferred/out of scope: GitHub URL cloning, semantic indexing or task
execution against a desktop-selected repository, mutation, a new model/research
call, modification of v0.1.0 media/installers, trusted signing, Narrator spoken-
output certification, and unreviewed direct publication to main.

## Completed phase — PRODUCTIZATION / PORTFOLIO

Capability research is closed at `RESEARCH_COMPLETE_INCONCLUSIVE_FORMATION_RESULT`.
No new model, retrieval, retry, scale, multi-agent, prompt, mutation-interface,
or code-formation experiment is authorized. Product mutation remains
`KEEP_MUTATION_DISABLED`.

| Product milestone | Scope | State | Exit evidence |
|---|---|---|---|
| P1 | Research freeze + canonical architecture/capability docs | PASS | README, BENCHMARKS, architecture and capability status agree with sealed artifacts |
| P2 | Visualization data layer + nine chart families | PASS | typed validation, chart view-models, UI states, targeted tests |
| P3 | Premium dark desktop + calm motion polish | PASS | Dashboard/Capabilities/Experiments/Workspace/Safety surfaces, reduced-motion and axe checks |
| P4 | Demo-ready product presentation | PASS | three Mermaid diagrams, five deterministic scenarios, documentation navigation |
| P5 | Screenshots/GIF/video/GitHub presentation polish | PASS | five deterministic capture surfaces, three GIF flows, 3:30 storyboard, media manifest, README hierarchy and local presentation audit |

Windows installer, native release QA, signing, packaging, and publishing remain
outside this phase and retain their existing external/approval blockers.

## Completed phase — WINDOWS_REFERENCE_HARDWARE_QA

State: `PASS_WITH_EXPLICIT_NONBLOCKING_ACCESSIBILITY_LIMITATION`

The retained NTFS source now passes normalized authoritative-source identity.
The approved `Microsoft.VisualStudio.Component.VC.Tools.x86.x64` component was
installed through the official Visual Studio Installer, and the standard x64
developer environment resolves the desktop CRT without manual linker paths.
Locked debug and Tauri `--no-bundle` release builds pass. The current-source
x64 executable passes native startup/relaunch/shutdown, WebView2 150.0.4078.48,
all 18 surfaces at the host's actual 150% scale, keyboard/modal behavior,
read-only artifact/path security, font inspection, and normal plus WebView2-
emulated reduced motion.

The actual Windows display setting was exercised at 100/125/150/200%. All 18
surfaces pass at each required scale. Actual 200% exposed one reproducible
Workspace horizontal overflow; the responsive grid was minimally fixed,
regression-tested, rebuilt from normalized current source, and rerun with no
overflow. The actual Windows reduced-motion setting also passes with the
WebView media preference and application suppression behavior observed, then
the host settings were restored to 150% scale with animation effects enabled.

Narrator and the native application launched, but UIA metadata was not
substituted for speech and the independent Live Captions channel required
unauthorized speech-component setup. Human-observed Narrator spoken output is
therefore `DEFERRED_NONBLOCKING_PUBLIC_RELEASE_ACCESSIBILITY_QA`. This is an
explicit scope reassignment for portfolio-media readiness, not a Narrator PASS
or an accessibility-certification claim. It remains a public-release gate.

Append-only current evidence:
`docs/validation/WINDOWS_REFERENCE_HARDWARE_QA_SCOPE_AMENDMENT.v1.json`,
`docs/validation/WINDOWS_REFERENCE_HARDWARE_QA_REPORT.v6.json`,
`docs/validation/WINDOWS_NATIVE_SOURCE_IDENTITY.v4.json`,
`docs/validation/WINDOWS_VISUAL_STUDIO_COMPONENT_PROVISIONING.v1.json`,
`docs/validation/WINDOWS_NATIVE_QA_BUILD_MANIFEST.v3.json`, and
`docs/validation/WINDOWS_NATIVE_RUNTIME_QA.v1.json`.

## Completed phase — FINAL_MEDIA_CAPTURE

State: `PASS`

Five final 1440×900 PNGs and three deterministic 7/6/9-second GIFs were
captured from the frozen routes with existing Windows Edge and local encoding
tooling. Media decode, dimensions, durations, hashes, reduced-motion routes,
README links, claim consistency, and privacy checks pass. One frozen fixture
filename mismatch was minimally corrected and regression-tested. No model or
benchmark call occurred.

## Completed phase — WINDOWS_PACKAGING_RELEASE_QA

State: `PASS_WITH_RELEASE_BLOCKERS`

The current normalized NTFS source produced unsigned x64 MSI and NSIS
installers. Canonical artifacts are checksum-pinned; package content/privacy,
current-user install, installed-path launch, 18-surface runtime behavior,
offline/missing-model handling, uninstall cleanup, and reinstall all pass.
Independent repeat builds pass but are not claimed byte-identical. Signing was
not performed, the root-license decision and third-party authoritative-license
text closure remain release blockers, and Narrator speech remains the explicit
nonblocking public-release accessibility deferral. No model or benchmark call,
protected Git action, signing, publication, or release occurred.

## Completed phase — GITHUB_PUBLICATION_READINESS / FINAL OWNER HANDOFF

State: `PASS_LOCAL_FINALIZATION_WITH_OWNER_AND_EXTERNAL_BLOCKERS`

Project implementation, portfolio presentation, local Windows release QA,
dependency-license classification, local third-party notice pinning, release
notes, changelog, social preview, repository audit, and publication preparation
are complete. The owner selected Apache-2.0, and all ten formerly open
distributed package-text gaps are authoritatively closed. Source and unsigned
Windows binary publication are approved for v0.1.0. Trusted signing credentials
are unavailable, so signing is deferred future hardening. Narrator
spoken-output QA remains deferred without a certification claim.

Final engineering state: `PROJECT_IMPLEMENTATION_COMPLETE`,
`PORTFOLIO_COMPLETE`, `WINDOWS_LOCAL_RELEASE_QA_COMPLETE`,
`ENGINEERING_COMPLETE`, and `READY_FOR_OWNER_HANDOFF`.

## Continuation critical path

| Order | Work item | State | Depends on | Executable exit gate |
|---:|---|---|---|---|
| 1 | M3 dependency graph + incremental index | PASS | M3 baseline PASS | `m3-incremental-2026-08-09T00-33-03-613Z` |
| 2 | M4 R11–R16 + cited report corpus | PASS | M3 graph/index PASS | corpus 9/9 + live report 7/7 cited |
| 3 | M5 R17/R18 + hidden-oracle corpus | PASS | M3 retrieval, M4 evidence contracts PASS | 20/20 diagnosis-gated hidden-oracle/policy fixtures |
| 4 | M6 real L1/L2 validation | PASS | M4/M5 workflows | 9/9 candidates, 306 repeated executions + L2 flow |
| 5 | M6 L3 paired admission | PASS | real L1/L2, pinned model | expanded evidence admits R09 C1 only; 8 remain experimental |
| 6 | M9 G1/G2/G3 generalization and real corpora | PASS | frozen candidates, sealed preregistration, pinned model | G3 24-repo/192-task primary + 36 long-horizon + 60 real-patch + reliability supplements |
| 6a | M9 Patch Interface V3 controlled experiment | PASS | V2 partial-run exclusion, frozen V3 sources, zero-call safety/reference evidence | P2 E-EDIT: normal retrieval 18/50 baseline, 9/50 Coder; baseline retry reaches 23/50; product mutation remains disabled |
| 6b | M9 E-EDIT repository-disjoint untouched holdout | PASS | frozen E-EDIT candidate and immutable Session A/B/C evidence | all sessions PASS; scientific gate failed; `KEEP_MUTATION_DISABLED` |
| 6c | M9 practical local 7B tournament Session A | PASS | completed E-EDIT holdout and ADR 0015 | zero-call candidate identity, matched-FP8 feasibility and preregistration sealed |
| 6d | M9 practical local 7B tournament Session B | PASS | Session A PASS + exact owner approval | 3/3 exact acquisitions, matched FP8 smoke/fairness and sequential cleanup PASS |
| 6e | M9 practical local 7B tournament Session C | PASS | Session B PASS | 285/285 one-shot calls sealed; M1/M2 valid, M3 infrastructure-blocked and not scored; cleanup PASS |
| 6f | M9 practical local 7B tournament Session D | PASS | Session C PASS | zero-call paired analysis sealed; no model promoted; mutation disabled; bounded M2 retry is protocol-only |
| 6g | M9 BEST 7B bounded retry Session C | PASS | bounded-retry Sessions A/B PASS | zero-call analysis: 30/95 maximum-two-call, 1/66 recovery; retry not admitted; mutation disabled |
| 6h | M9 semantic failure decomposition Session A | PASS | bounded-retry Session C PASS | T1–T14 taxonomy, seven dimensions, evidence rules and G1–G5 gates sealed; zero model calls; Session B separate |
| 6i | M9 semantic failure decomposition Session B | PASS | semantic decomposition Session A PASS | 66 failures + 29 controls classified; T14 53/66; independent audit 60/60; zero model calls; Session C separate |
| 6j | M9 semantic failure decomposition Session C | PASS | semantic decomposition Session B PASS | frozen G1-G4 fail, G5 applied; semantic-observability ceiling quantified; one privacy-safe observability protocol prepared but not executed; zero model calls |
| 6k | M9 privacy-safe semantic observability Session A | PASS | semantic decomposition Session C PASS | 80 new tasks across 8 disjoint repositories; L0/L1 schemas, HMAC-derived feature extractor, privacy canaries, same-call pairing and gates frozen; zero model calls; Session B separate |
| 6l | M9 privacy-safe semantic observability Session B | ABORTED_FAIL_CLOSED | Session A PASS | runner/dry-run gates PASS; 4 physical calls consumed, 3 complete pairs; task 4 L1 after-source parse failed; no retry/hot patch; generation permanently closed and runtime cleaned |
| 6m | M9 privacy-safe semantic observability V2 Session A | PASS | V1 partial abort sealed | append-only supersession; 76 zero-call tasks + 4 new replacements; total L1 extractor; 1,019-case totality PASS; six-scenario hard-isolated dry-run; zero model calls; Session B separate |
| 6n | M9 privacy-safe semantic observability V2 Session B | ABORTED_FAIL_CLOSED | V2 Session A PASS | 14 physical calls consumed; 13 completed same-call L0/L1 pairs; call 14 runner-reported pre-response failure; no retry/hot patch; 66 uncalled; runtime cleaned; Session C not ready |
| 6o | M9 privacy-safe semantic observability V3 Session A | PASS | V2 abort preserved | storage-hardened append-only recovery; 66 uncalled tasks + 14 disjoint replacements; total extractor and nine-scenario dry run PASS; zero model calls |
| 6p | M9 privacy-safe semantic observability V3 Session B | PASS | V3 Session A PASS | 80/80 one-shot same-call L0/L1 pairs; 36 strict successes, 44 strict failures; zero retries, leaks or retained workspaces |
| 6q | M9 privacy-safe semantic observability V3 Session C recovery | PASS | historical contaminated Session C preserved | isolated canonical L0 baseline: T13 13/44, T14 31/44; audit 34/34; zero model calls and zero L1 exposure during clean-room analysis |
| 6r | M9 privacy-safe semantic observability V3 Session D | PASS | canonical L0 + sealed L1 evidence | L1 T1–T9 15/44; T14 16/44; +34.09 pp semantic/high-confidence observability; privacy gate PASS; code-formation protocol prepared only |
| 6s | M9 code-formation constraint experiment Session A | PASS | observability V3 Session D + prepared protocol | zero-call intervention, 40 new pairwise repository-disjoint tasks, 80-call counterbalanced schedule, sealed runner and robustness/privacy/safety gates; Session B not started |
| 6t | M9 code-formation constraint experiment Session B | ABORTED_FAIL_CLOSED_PRECALL | Session A PASS | sealed runner field mismatch before `CALL_STARTED`; 0/80 calls consumed, ledgers empty, runtime cleaned; separate zero-call correction/reseal required |
| 6u | M9 code-formation Session-B runner correction | PASS | pre-call abort with zero task exposure | `prereg.control.systemPrompt` correction; 10/10 field paths and 80/80 zero-call intents pass; corrected source closure sealed; separate Session-B execution required |
| 6v | M9 code-formation constraint experiment Session B | PASS | corrected readiness PASS | 80/80 one-shot calls, 40/40 pairs, counterbalancing/lineage PASS; both conditions 0 valid actions and 0 strict successes; zero retries/safety/privacy/rollback failures; Session C separate |
| 6w | M9 code-formation constraint experiment Session C | PASS_INVALID_EXPERIMENT | Session B sealed | zero-call audit proves formation stage reached 0/40; CONTROL retrieval/context and request-seed mismatches; formation effect not identifiable; recovery protocol prepared only; mutation disabled |
| 6x | M9 code-formation CONTROL recovery Session A | PASS | invalid prior experiment + sealed recovery protocol | 40 fresh task/repository-disjoint fixtures; retrieveG3 E-MIN-V2/C1 and generation seed 20260809 restored; 80/80 intents, parser telemetry, meaningful 20/40 reachability and paired thresholds, empty ledgers and runner v2 sealed; zero calls; Session B separate |
| 6y | M9 code-formation CONTROL recovery Session B | CONTROL_SANITY_GATE_FAIL | recovery Session A v2 PASS | one non-primary sanity call received valid JSON/schema but failed P2 with `RANGE_OUTSIDE_ALLOWED_SCOPE`; 0/80 primary calls, no task exposure/retry; runtime cleaned; research complete inconclusive; Session C not ready |
| 7 | M9 reduced precision | BLOCKED_APPROVAL | BF16 task-suite reference | no pinned reduced snapshot; acquisition not authorized |
| 8 | M8 frontend hardening | PASS | event/runtime contracts | 13 traces, axe, latest 100k replay and render evidence |
| 9 | M8 native Linux package | BLOCKED_EXTERNAL | sudo native packages | locked Tauri build/package |
| 10 | M8 Windows QA | PASS_WITH_EXPLICIT_NONBLOCKING_ACCESSIBILITY_LIMITATION | sealed v6 evidence + scope amendment | portfolio-media native gate complete; Narrator speech deferred visibly to public-release accessibility QA |
| 10a | W2 final media capture | PASS | amended W1 gate complete | 5 PNG + 3 GIF assets, manifest, README, consistency/privacy validation sealed |
| 10b | W3 Windows packaging/release QA | PASS_WITH_RELEASE_BLOCKERS | W2 PASS | unsigned x64 MSI + NSIS build/content/install/reinstall/uninstall QA sealed; license texts, root license, signing, and deferred Narrator speech remain release blockers |
| 10c | W4 GitHub publication readiness | PASS_PUBLISHED | W3 PASS_WITH_RELEASE_BLOCKERS | public source, v0.1.0 tag/release, unsigned MSI/NSIS, and checksum asset verified |
| 11 | M7 offline write adapter | PASS | approval contracts | injected-transport rehearsal and security suite |
| 12 | M7 external delivery | PASS_PUBLISHED | explicit owner approval | public `main` published normally; no force push or history rewrite |
| 13 | M10 offline release preparation | PASS | completed local gates | fresh M9-linked 840-component SBOM, locally resolved licenses, manifests and release-gate JSON |
| 14 | M10 commit/sign/publish | PASS_UNSIGNED_PUBLISHED | explicit protected approvals; signing credential unavailable | source, tag, release, MSI/NSIS and checksums public; signing deferred |

## Milestones

| Milestone | Work package | Exit evidence | Status | Next executable gate |
|---|---|---|---|---|
| M0 | WP-00 design/contracts | validator, schemas, notices | PASS | regression every milestone |
| M1 | WP-01 desktop shell | replay, UI, motion/a11y | PARTIAL | Tauri compile and desktop E2E |
| M2 | WP-02 local model | pinned vLLM/Qwen, stream/cancel/telemetry | PASS | keep live probe in regression suite |
| M3 | WP-03 Repo Intelligence | worktree, graph, incremental index/retrieval | PASS | preserve regression and benchmark evidence |
| M4 | WP-04 analysis | cited overview/findings/onboarding/report | PASS | preserve corpus/live regression evidence |
| M5 | WP-05 bounded coding | repro, patch, verification, rollback/review | PASS | preserve 20-task hidden-oracle regression evidence |
| M6 | WP-06 Skill runtime | registry, L0–L3 validation, flags | PASS | expanded L3 admits R09 C1; 8 candidates remain EXPERIMENTAL |
| M7 | WP-07 GitHub | snapshot, exact approval, draft delivery | PASS_PUBLISHED | public repository and normal main push verified; owner correction preserved append-only |
| M8 | WP-08 UX beta | a11y/performance/reduced motion/installer | PASS_WITH_EXPLICIT_NONBLOCKING_ACCESSIBILITY_LIMITATION | W1/W2/W3 local engineering complete; Narrator speech remains deferred to public-release accessibility QA |
| M9 | WP-09 evaluation | E1–E7, ablation, G3 naturalistic/long-horizon/reliability, Patch Interface V3, E-EDIT holdout, practical 7B tournament | PASS_AS_MEASURED | final code-formation recovery stopped at its one-call non-primary CONTROL sanity gate; 0 primary calls; research complete inconclusive; move to product/portfolio/release polish; mutation disabled |
| M10 | WP-10 release | SBOM, checksums, clean install/release | PASS_UNSIGNED_PUBLISHED | Apache-2.0 source, v0.1.0 release, unsigned MSI/NSIS, and SHA256SUMS public; signing and Narrator speech remain future hardening |

## Requirement traceability

| ID | Requirement | Module/milestone | Test or validation | Experiment | Status |
|---|---|---|---|---|---|
| RQ-001 | Local privacy and loopback model | ModelGateway/M2 | model gateway + AT-01 | live BF16 probe | PASS |
| RQ-002 | One model, five logical roles | Runtime/M2,M6 | queue/profile integration | fresh specialist ablations | PASS: one shared backend, sequential bounded roles; specialists disabled |
| RQ-003 | Immutable Task Contract | Contracts/M5 | runtime + schema | E2 | PASS |
| RQ-004 | Routing and Feasibility Gate | AgentRuntime/M5 | runtime tests | E2/E5 | PASS |
| RQ-005 | Registered state transitions | AgentRuntime/M5 | forbidden-edge fixtures | E5 | PASS |
| RQ-006 | Worktree-first mutation | Workspace/M3 | workspace index + AT-04 | E5 | PASS |
| RQ-007 | Fingerprint and exclusions | RepoIntelligence/M3 | Git-native ignore fixture | E3 | PASS |
| RQ-008 | Symbols/definitions/references/imports | CodebaseIndex/M3 | Tree-sitter fixture | M3 Recall@K 1.00 | PASS |
| RQ-009 | Test affinity/dependency graph | CodebaseIndex/M3 | forward/reverse/resolution fixtures | M3 graph | PASS |
| RQ-010 | Persistent/incremental evidence | EvidenceStore/M3 | edit/rename/delete/cache/stale fixtures | M3 cache | PASS |
| RQ-011 | Bounded trusted context | ContextBuilder/M3,M9 | token/dedup/injection/signal allocation | C0–C5 + E4 | PASS: C1 production default |
| RQ-012 | Reproduce/minimize/hypotheses | Debug workflow/M5 | 12 diagnosis-gated coding fixtures | M5 hidden oracle | PASS |
| RQ-013 | Constrained patch | ToolRuntime/M5 | scope/budget/add/delete rollback fixtures | E5 | PASS |
| RQ-014 | Machine verification; NOT_RUN != PASS | Verification/M5 | pass/fail/timeout/cancel/sandbox fixtures | E5 | PASS |
| RQ-015 | Independent dual-axis review | Reviewer/M5 | isolated Spec/Standards contexts on 12 patches | M5 hidden oracle | PASS |
| RQ-016 | Exact approval and rollback | Approval/M5 | hash/expiry/exact snapshot rollback + AT-10 | E5 | PASS |
| RQ-017 | Typed persistent/replayable events | EventProtocol/M1 | event/UI replay | 100k-event trace benchmark | PASS |
| RQ-018 | Cross-runtime cancellation | Runtime/M2,M3,M5 | model and verifier timeout/cancel integration | M2 live + M5 hidden oracle | PASS |
| RQ-019 | Cited analysis/report | Analysis/M4 | 11 sections + corpus + constrained live run | live-complete-report-2026-08-09T00-56-00-998Z | PASS |
| RQ-020 | Bounded Skill runtime | SkillRuntime/M6 | L0 + per-candidate L1/L2/L3 | fresh admission records | PASS: R09 retained only; no fresh promotions |
| RQ-021 | Injection/secret defense | Security/M3,M5 | injection/env/symlink/path/command/output/secret tests | M5/M7/M9 | PASS |
| RQ-022 | Calm/Spatial/Observable/Reversible UI | Desktop/M1,M8 | UI/a11y/motion | usability | PARTIAL |
| RQ-023 | BF16 Qwen quality baseline | Model/M2,M9 | live suite | G3 24-repo primary/long-horizon/real-patch/onboarding corpora | PASS_AS_MEASURED_WITH_LOW_NATURALISTIC_QUALITY; no autonomous-patch readiness claim |
| RQ-024 | Precision admission by task evidence | Benchmark/M9 | manifest gate | BF16 reference PASS; reduced absent | BLOCKED_APPROVAL |
| RQ-025 | Approval-gated GitHub delivery | Delivery/M7 | policy/target/hash/replay/secret | offline rehearsal | PASS_PUBLISHED: corrected exact target owner-approved; normal main and tag pushes verified |
| RQ-026 | Installer/SBOM/checksums/clean clone | Release/M8,M10 | Rust + SBOM + package/content/install lifecycle manifests | refreshed release prep + W3 | PASS_FOR_UNSIGNED_RELEASE: x64 MSI/NSIS lifecycle, Apache-2.0 root license, dependency obligations, and checksum gate pass; trusted signing and Narrator speech remain deferred |

## Active tracer tickets

### T-M2-01 Model gateway boundary

Pinned Qwen revision `851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a`, vLLM 0.26.0 and its full uv dependency graph. The real loopback BF16/8K server, normal completion, JSON Schema output, stream/TTFT, timeout, cancellation and two-request queue probe pass. FlashInfer sampling JIT is incompatible with the available CUDA compiler/header combinations, so the lock records vLLM native sampling; model precision and attention backend remain unchanged.

### T-M3-01 Safe indexed workspace

Implemented Git worktree acquisition, Tree-sitter TypeScript/TSX/Python map, SQLite evidence/invalidation and trust-tagged context caps. Git repositories enumerate tracked/untracked files with `git ls-files --exclude-standard -z`; ignored and symbolic-link content is excluded. Forward/reverse dependencies distinguish syntactic, inferred and unresolved edges. Versioned persistent indexes incrementally reuse/edit/rename/delete files and invalidate stale evidence. Final mutation benchmark: cold 14.332 ms, unchanged 8.271 ms, Recall@K 1.00, SQLite integrity PASS. Validation: `docs/validation/2026-08-09-m3-repository-intelligence.md`.

### T-M5-01 Constrained execution

Red→green complete for approved-file enforcement, patch budget, trusted command registry, honest hard-sandbox `NOT_RUN`, prompt-injection tagging, timeout/cancellation and end-to-end red→patch→green→review→rollback. Rollback restores an exact pre-patch content/mode snapshot and removes a patch-created approved file without mutating Git index state. The 20-task hidden-oracle suite now passes with zero wrong-file edits and regression escapes.

### T-M5-02 Diagnosis gate

R17 now executes a trusted command and admits RED only when the command really
fails and its bounded output contains the exact asserted symptom. R18 requires
3–5 ranked falsifiable hypotheses with evidence, predictions and one-variable
probes. Fresh probe evidence updates confidence and patch planning remains
machine-blocked until a supported leading hypothesis reaches 0.75. Fixtures
cover missing RED, misleading first hypothesis, falsification, supporting probe
and stale evidence. Final immutable run
`m5-hidden-oracle-2026-08-09T01-07-30-366Z` passes 20/20, including twelve
withheld-oracle coding tasks and eight safety/control outcomes. Validation:
`docs/validation/2026-08-09-m5-bounded-coding.md`.

### T-M6-01 Skill evaluation runtime

All 39 Skills pass L0. Nine high-impact Runtime Skill candidates each pass 17
non-empty L1 behavior fixtures twice (306 executions) and a 15-check real L2
workflow. The original six-task L3 remains immutable pilot evidence. Expanded
L3 uses 108 tasks, three seeds and exact BF16 Qwen/vLLM settings. The isolated
E3→E4 C1 pair was non-inferior at 318/324 with median tokens reduced 188→164,
so R09 alone is admitted PRODUCTION. Eight candidates remain EXPERIMENTAL.
Evidence is linked from `skills/validation/admission_registry.json`.

### T-M4-01 Cited live Analyst

Implemented R10–R16/R24 product workflows over M3 evidence and all eleven required report sections. Facts, model inference, hypotheses and unknowns remain distinct; every supported claim cites the current ledger. The deterministic nine-repository corpus passed 9/9 with citation precision/recall 1.00 and zero unsupported/hallucinated-file claims. Explicit vLLM JSON Schema constrained decoding produced 7/7 cited live claims in 12.206 seconds (2,603/709 tokens). Production Skill admission remains an M6 concern, not M4 completion evidence. Validation: `docs/validation/2026-08-09-m4-complete-analysis.md`.

### T-M8-01 Portable desktop toolchain

Pinned project-local Rust 1.97.1, Tauri CLI 2.11.4 and Cargo.lock. Rust fmt and locked metadata pass. Linux `cargo check --offline --locked` reached `libdbus-sys` and is blocked by missing `pkg-config` and `libdbus-1-dev`; WebKitGTK 4.1, rsvg2, appindicator and patchelf are also absent. The product UI has all required views, thirteen truth traces, honest idle states, axe/reduced-motion evidence, 100k-event replay at 405.4 ms and render p95 1.647 ms. No Windows installer or Windows accessibility result was produced.

### T-M7-01 Approval-gated offline delivery

The write adapter validates canonical target, protected branch, exact content
hash, action, expiry, one-time approval, secrets and PR bounds before invoking
an injected transport. Offline create-branch/push/draft-PR rehearsal passes with
zero network/external writes. Commit, remote, push and PR remain
`BLOCKED_APPROVAL`.

### T-M9-01 Live ablation

E1–E7 completed on six tasks × three seeds using exact BF16 Qwen revision and
vLLM 0.26.0. E1 scored 83.33%; E7 scored 16.67%. Multi-agent review scored
33.33% versus single-agent 50%, with 109.77% token overhead. These negative
results are preserved and drive Skill rejection. Reduced precision is
`BLOCKED_APPROVAL` because no pinned snapshot exists.

### T-M9-02 Harness quality recovery

The six-task T-M9-01 result remains immutable and is classified
`PILOT / DIAGNOSTIC`, not generalization evidence. A new 108-task manifest
covers Coding 33, Diagnosis 15, Repository navigation 15, Review 12, Analysis
15 and Safety 18 across L1–L4. The expanded diagnostic run contains 1,575
retrieval/context/reviewer observations; Generation 2 contains 2,592 E1–E7
observations over three seeds. Symbol Top-2 and C1 task+source were retained.
Always-on and conditional reviewer patterns produced no regression detections
and remain disabled by default. E-MIN-V2's post-diagnostic follow-up scored
324/324 at 136 median tokens and one model call. ADR 0009 changes production
architecture to single-agent by default with deterministic safety/verification;
specialist triggers are observable but experiment-gated. Because E-MIN-V2 was
tuned on the same synthetic suite, a fresh holdout and real patch/repository
corpus remain a genuine M9 quality-generalization gate.

### T-M9-03 Fresh generalization gate

Frozen E-MIN-V2 artifact `74924a...` and its `bb8c8b...` source closure were
sealed before a 150-task untouched holdout was generated. The live BF16 run
executed 300 paired primary calls plus 120 preregistered stability calls: E1
150/150 and E-MIN-V2 150/150, paired difference 0 pp with bootstrap 95%
`[0,0]`, zero actual safety violations, and decision
`B_RETAIN_NONINFERIOR_SAFER`. Fresh deterministic safety passed 20/20.
Corrected real patch execution was 23/24 for both configurations with 24/24
rollback and zero wrong-file edits. Specialist ablations produced no gain:
architecture 12→12, diagnosis 15→14, review 16→16, at about twice the token
cost, so global Multi-Agent remains disabled.

Four pinned public repositories expose the claim boundary: E1 12/12 versus
E-MIN-V2 10/12, with missing onboarding/license evidence under Top-2. The
preregistered retrieval-failure hypothesis failed (controlled failure rate
47.33%; public-repo Recall@2 0.514). No K, fallback, C1, prompt, threshold,
seed, Skill routing, or candidate change was made. ADR 0010 retains E-MIN-V2
with this limitation and forbids calling the result full unseen-repository
generalization. Integrated immutable run:
`m9-fresh-generalization-report-2026-08-09T06-56-47-244Z`.

### T-M9-04 G3 naturalistic and long-horizon gate

G3 was sealed before the first model call and uses 24 new repositories split
6 development / 6 validation / 12 holdout, 192 open-ended primary tasks, 36
long-horizon tasks, 60 executable historical-patch tasks, and a separate
192-task onboarding corpus. The accepted task revision has zero answer options,
zero direct required-path leaks, and maximum prompt-token Jaccard 0.8621.
G2 is now explicitly a ceiling/regression benchmark rather than ranking
evidence.

On the 96-task repository-disjoint holdout, E1/E-MIN-V2/E-MIN-V3 passed
6/3/2. V3 versus V2 was -1.04 percentage points with paired and repository
cluster bootstrap 95% intervals both `[-3.125%, 0]`; V3 median tokens were
1,176 versus V2's 243 (+383.95%). The preregistered conditional policy routed
37/96 tasks but remained 3/96 at 499 median tokens. The 36-task long-horizon
secondary corpus favored V3 10/36 versus V2 3/36 through better recovery, but
this hypothesis-generating result does not reverse the failed primary and cost
gates. Exact executable historical-patch success was 0/60 for every candidate,
with rollback 60/60 and no wrong-file edits for each.

Reliability evidence includes 2,443 calls on one pinned model process before
intentional crash injection, 100 index-mutation cycles, 1,000 security fuzz
cases, a 200,000-event bounded UI soak, explicit model-server crash/restart and
ephemeral-key rotation, and repository-scale measurements over 902,911 LOC.
ADR 0012 retains E-MIN-V2 as the relative default, keeps V3 research-only, and
keeps global Multi-Agent/semantic review disabled. It also records that low
naturalistic success and 0/60 real-patch success prohibit an autonomous-patch
readiness claim. Canonical evidence is `benchmarks/g3/G3_RESULTS_INDEX.json`
and `docs/validation/2026-08-09-g3-generalization.md`.

### T-M9-05 G4 capability decomposition and controlled model specialization

G4 sealed 217 development-only tasks before its model calls and retained all
G3/V2/V3 evidence immutably. Qwen3.5-4B passed structured planning 12/12 in
the original capability decomposition but behavioral patch-only remained 0/12,
diagnosis 2/12, complete-context navigation 6/12, onboarding 0/24, and bounded
retry recovered 0/12. ADR 0013 therefore exposes only bounded planning as
SUPPORTED and complete-context navigation as ASSISTED; ADR 0014 keeps every
mutation class disabled.

The subsequent model-specialization protocol pinned Qwen3.5-4B revision
`851bf6e...` against Qwen2.5-Coder-3B-Instruct revision `488639f...`, BF16,
with MODEL as the sole intended independent variable. Its prose label says 205,
but the sealed phase counts arithmetically total 203 development observations
per model over oracle context, task understanding, navigation,
diagnosis, patch-only, planning, one-shot E-MIN-V2, and maximum-two-call retry.
The exact sealed IDs and counts were preserved rather than inventing two tasks.
The local baseline completed: 0/42, 0/24, 17/25, 2/25, 0/25, 7/12, 0/25,
and 0/25 respectively. It had zero wrong-file edits, safety violations, or
rollback failures. Clean runtime telemetry was 58.59 s load, 69.78 ms TTFT,
75.28 tokens/s, and 12022 MiB peak VRAM; shutdown returned GPU use to 0 MiB
with no process, listener, or API key.

The owner then explicitly authorized only the pinned Coder-3B snapshot and
accepted its Qwen Research License for this project's non-commercial research,
evaluation, and experimental development. All 12 snapshot files, both BF16
weight shards, config, tokenizer/chat template, local LICENSE and model card
were hash verified in the ignored cache. The first pre-call launch exposed a
vLLM V2/CUDA UVA incompatibility; explicitly pinning the V1 model runner already
selected by the hybrid baseline restored serving parity before any candidate
capability call. Candidate load/models/completion/stream/schema/malformed/
timeout/cancel/sequential/queue/context/UTF-8/code/diff smoke then passed.

Post-seal standards review found that the first candidate run had loaded the
snapshot's model-specific `generation_config.json`, including a 1.05 repetition
penalty, while the baseline snapshot had no generation config. That run and its
v2 conclusion are preserved but explicitly invalidated for model-only causal
comparison. The corrected run pins `--generation-config vllm`; this matches the
effective defaults already used by baseline. A new fairness gate passed before
the corrected candidate calls. A subsequent v3 report had correct machine
metrics but two stale v2 prose sentences and is also preserved/superseded by
the fully data-derived v4 report without another model rerun.

The corrected candidate completed 0/42 oracle-context, 0/24 understanding,
25/25 navigation, 5/25 diagnosis, 0/25 behavioral patch-only, 9/12 planning,
0/25 one-shot and 0/25 bounded retry. Navigation improved 32 pp, diagnosis
12 pp and planning 16.67 pp, but the required patch-only gain remained 0 pp
and one-shot gain was 0 pp. The frozen required-all development promotion gate
therefore failed and the decision remains
`C_NO_MATERIAL_CODE_SPECIALIZATION_GAIN`. Corrected runtime measured 33.89 s
load, 24.87 ms TTFT, 100.10 tokens/s and 13316 MiB peak VRAM (3060 MiB device
headroom). Both profiles had zero safety violations, wrong-file edits and
rollback failures; a post-correction fuzz run passed 1,000/1,000 and final
cleanup returned GPU use to 0 MiB with no process, listener or key.

No fresh holdout was created or inspected, product routing and ADR 0013/0014
remain unchanged, model switching was not benchmarked, and no 7B, quantized or
other model was selected or downloaded. Canonical continuation evidence is
`docs/experiments/model-specialization/MODEL_SPECIALIZATION_RESULTS_INDEX.v4.json`;
the invalidated/superseded continuations and prior inconclusive index remain
immutable audit evidence.

### T-M9-06 Patch Interface V3 controlled experiment

Phase 0 passed on 2026-08-11 before any V3 model call. The V2 baseline partial
run is append-only archived with seven physical calls classified
`INVALID_INFRASTRUCTURE_EXCLUDED`; no checkpoint prefix is migrated or seeded.
The corrected one-pass prompt renderer passes all 50 tasks and preserves the
first seven historical prompt commitments byte-for-byte. Deterministic patch
interface security passes 1,540/1,540 cases across 77 structural operators,
with zero rejected-action apply attempts. The reference path passes 500/500
task-adapter executions and seals 840 real request intents, including exact
transport and schema hashes. V3 preregistration is sealed with zero valid
primary calls, fresh schedules of 420 baseline plus 420 coder calls, and causal
closure `c7b322b5d3dcc62ad453a69954308bab45d74b7521356a53ad1901bf7c27ed21`.

The fresh baseline run completed 420/420 one-shot calls in
`patch-interface-baseline-v3-20260811T003246Z`. Its immutable result is
`COMPLETE_DEVELOPMENT_DIAGNOSTIC`, strict no-service recovery validated all 420
rows and 840 ordered ledger events, and final serving identity plus causal
closure passed. Actual safety violations and cleanup failures were zero; one
wrong-file output attempt was rejected before mutation. Model shutdown returned
GPU memory to 0 MiB and lifecycle cleanup passed. The next executable gate is a
new Coder-3B V3 run directory with exactly 420 one-shot calls.

The fresh Coder-3B run then completed 420/420 one-shot calls in
`patch-interface-coder-v3-20260811T005651Z`, with zero wrong-file attempts,
actual safety violations, cleanup failures, or transport infrastructure errors.
Strict recovery validated the immutable 420-row/840-event evidence after model
shutdown, and lifecycle cleanup returned GPU memory to 0 MiB. The seven
excluded V2 calls remain archival only; completed lineage is 847 physical calls
and 840 valid primary calls. The next gate is immutable paired analysis and the
unchanged preregistered promotion decision. Canonical evidence is
`docs/experiments/patch-interface/PATCH_INTERFACE_V3_PHASE0_INDEX.json` and
the baseline/coder V3 profile indices.

The 840-row primary analysis separates 83 no-attempt outcomes, 342 attempted
actions rejected before runtime acceptance, 276 accepted edits with incorrect
behavior, and 139 behavioral successes across all primary/ablation cells. On
the all-50 primary comparison, baseline/coder P2 range-edit success is 21/12,
versus P0_EXACT 7/0 and P0_MINIMAL 9/0. P2 gains 33 pooled successes versus
7/9 pooled baselines, with hidden success 27/15, zero wrong-file attempts and
zero safety violations. P3 also qualifies, but the frozen tie-break selects P2
by higher pooled behavioral success. P4 fails due one wrong-file attempt and
insufficient pooled gain over P0_MINIMAL. Decision is `E_EDIT_JUSTIFIED`; this
does not enable product mutation or change ADR 0013/0014. The next gate is a
new immutable E-EDIT seal and normal-retrieval preregistration before any
secondary model call. Canonical primary analysis is
`docs/experiments/patch-interface/PATCH_INTERFACE_V3_RESULTS_INDEX.json`.

### T-M9-07 E-EDIT untouched holdout

`SESSION_A = PASS` and `HOLDOUT_EXECUTION_STARTED = false` as of 2026-08-11.
The frozen E-EDIT candidate (`7abdcd7c…a32fbc`) and its 16-file source closure
were revalidated before construction. The append-only holdout preregistration
fixes 15 repository-disjoint deterministic repositories and 120 untouched tasks:
80 mutation-required, 15 natural failure-recovery, 10 REPORT_ONLY/unsupported,
and 15 safety/adversarial; difficulty is 30 L2, 60 L3, and 30 L4.

The final sealed lineage is manifest V5 and oracle V5. Earlier zero-call
generator outputs remain immutable and are explicitly superseded: prereg V1
had an arithmetic allocation defect, manifest/oracle V1 and V3 exceeded the
near-duplicate prompt gate, V2 was an interrupted multi-artifact publication,
and V4 exposed a numeric-sort reference-oracle defect. No holdout model call
occurred while correcting these Session-A-only infrastructure issues.

Integrity V2 passed all gates: 15/15 pinned repositories, 120/120 unique tasks,
zero historical repository/task overlap, maximum historical prompt Jaccard
0.25, maximum within-holdout Jaccard below the frozen 0.82 threshold, 190/190
reference P0/P2 adapters, 95/95 behavioral reference fixes, 95/95 exact
rollbacks, and 25/25 zero-call policy oracles. Seal V2 freezes 190 unique
Session-B request intents and an 18-file execution source closure. Its
publication is byte-stable on repeated execution. Canonical evidence is
`docs/experiments/patch-interface/E_EDIT_HOLDOUT_SESSION_A.v2.json`; validation
details are in `docs/validation/2026-08-11-e-edit-untouched-holdout-session-a.md`.
The next invocation must execute Session B only; product mutation remains
disabled and Session C has not started.

Session B subsequently completed on 2026-08-11. `SESSION_B = PASS` means the
registered execution, immutable evidence, conditional-branch handling and
cleanup gates completed; it does not mean the scientific promotion gate
passed. Baseline P0_EXACT completed 95 calls with 0/95 valid actions and 0/95
strict behavioral successes. Frozen P2 E-EDIT completed 95 calls with 89/95
valid actions, 89/95 constructed patches, 71/95 syntax passes, 33/95 visible
passes, 42/95 hidden passes and 23/95 strict behavioral successes. Paired
counts are both-pass 0, baseline-only 0, E-EDIT-only 23 and both-fail 72, an
absolute +24.21 pp difference (10,000-repetition paired task bootstrap 95% CI
+15.79 to +32.63 pp; exact McNemar p `2.384185791015625e-7`).

The frozen one-shot outcome is `E_EDIT_HOLDOUT_GATE_FAIL`: E-EDIT stayed below
both 57/95 promotion and 29/95 assisted-only absolute-success floors, despite
passing action-validity, paired-gain, hidden non-regression, safety, rollback,
token and latency gates. The preregistered retry prerequisite was not met, so
retry is `NOT_ELIGIBLE_ZERO_CALLS`; no threshold was changed and no extra call
was made. Session B used 190 physical calls, bringing full lineage to 1,169,
with zero duplicates and zero silent retries. Both run ledgers are 95
observations/190 ordered events; lifecycle cleanup records model/process/key/
port/worktree absence and 0 MiB GPU use. Canonical evidence is
`docs/experiments/patch-interface/E_EDIT_HOLDOUT_SESSION_B.v2.json`; validation
details are in `docs/validation/2026-08-11-e-edit-untouched-holdout-session-b.md`.
At the Session-B boundary, the next invocation was restricted to Session C.
Product mutation remained disabled pending that sealed analysis and decision.

Session C is now complete: `SESSION_C = PASS` and all three protocol sessions
are closed. Failure decomposition records baseline primary failures as 90
`ACTION_VALIDATION` plus five `RETRIEVAL`; E-EDIT failures are five
`RETRIEVAL`, six `ACTION_VALIDATION`, 17 `SYNTAX_TYPE`, 34 `VISIBLE_TEST` and
10 `HIDDEN_TEST`. Exact-source selection/inclusion was 90/95 in both paired
conditions. This corrects the development-only assumption that retrieval would
remain perfect without modifying E-MIN-V2 or retuning the holdout.

ADR 0015 chooses `KEEP_MUTATION_DISABLED`. E-EDIT is classified
`RESEARCH_ONLY_MUTATION_INTERFACE` and is not admitted as a Skill. A
`PRACTICAL_LOCAL_MODEL_TOURNAMENT` protocol is prepared because 89/95 valid
actions yielded only 23/95 strict successes, but it authorizes no acquisition,
revision, reduced-precision snapshot or execution. The existing holdout is no
longer untouched for future models; a newly sealed repository-disjoint holdout
would be required for any later product claim. Canonical final evidence is
`docs/experiments/patch-interface/E_EDIT_HOLDOUT_RESULTS_INDEX.v1.json` and
`docs/validation/2026-08-11-e-edit-untouched-holdout-final.md`.

### T-M9-08 Practical local 7B model tournament

Session A completed with zero tournament model calls and zero acquired model
weights. Authoritative metadata resolves the exact candidate pins as
`Qwen/Qwen2.5-Coder-7B-Instruct@c03e6d358207e414f1eca0bb1891e29f1db0e242`,
`TIGER-Lab/FIM-7B@5a1d4294185e4fa0bbd40750c87d0beab7e67a3a`, and
`SWE-bench/SWE-agent-LM-7B@a44fce0216647696a7437126e82fc1eaa34008d7`.
All declare Apache-2.0; the pinned FIM repository lacks a standalone LICENSE
file, so acquisition-time revalidation remains mandatory.

BF16 is not safely feasible on the 16,376 MiB RTX 4080 SUPER: the 7B BF16
weight set is 14,525.67 MiB before vLLM, KV cache and verification overhead.
The preregistered matched candidate profile is vLLM 0.26.0 online FP8
per-tensor W8A8 from each exact official BF16 snapshot. This is a practical
candidate comparison, not a pure scale claim, and Session B must validate
actual load/peak/quality. OOM or incompatibility is fail-closed; no automatic
quantizer or context fallback is permitted.

The disclosed 95 mutation tasks are frozen in existing manifest order with 25
policy-only zero-call tasks. E-MIN-V2, C1, E-EDIT P2, prompt semantics,
generation policy, deterministic safety/verification, hidden oracle, rollback,
failure taxonomy, metrics and thresholds are sealed. The existing 23/95 4B
BF16 result is reused without a new reference call; any product claim still
requires a new repository-disjoint untouched holdout. Canonical Session-A
evidence is `docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_A.v1.json`
and validation is `docs/validation/2026-08-11-practical-local-model-tournament-session-a.md`.
The composite tournament hash is `ad2166cad3e2b64319346bd9f543296a5c8e568d7740c96890e373a984d8d5b4`.

Session B subsequently completed under explicit approval limited to the three
exact BF16 snapshots above. All local inventories, configs, tokenizers and
weight files matched their pinned Hub revision and authoritative LFS hashes.
M1 and M3 have pinned standalone Apache-2.0 license evidence. M2 is recorded
more narrowly as `PASS_IDENTITY_APACHE_METADATA_WITH_NO_STANDALONE_LICENSE`:
its pinned official metadata/card identifies Apache-2.0, while the snapshot
still has no standalone LICENSE file. This is provenance evidence, not legal
advice or a fabricated license file.

Each candidate loaded sequentially under vLLM 0.26.0 online FP8 per-tensor
W8A8, 8,192 tokens, 0.82 GPU utilization, max one sequence and the same
request-intent digest `c314e57a...e23c`. All three passed P2 constrained JSON,
sequential/queued requests, UTF-8, streaming/TTFT, timeout, cancellation and
context-cap rejection. M1/M2/M3 load times were 43.25/48.74/47.18 seconds,
TTFT 31.01/30.29/28.71 ms and throughput 76.45/76.50/76.53 tokens/s. M2/M3
post-smoke idle and all primary smoke peaks were 12,696 MiB. M1's first smoke
incorrectly selected an early 18 MiB load sample as idle; append-only,
zero-inference reload evidence supersedes only that field with a five-sample
median of 13,466 MiB. The initial M1 launcher integration failure occurred
before any endpoint call, was preserved, cleaned and corrected without a
precision/configuration fallback.

Session-B evidence is
`docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_B.v1.json`
(`e2d05ad3...a833`) and validation is
`docs/validation/2026-08-11-practical-local-model-tournament-session-b.md`.
All candidates entered the preregistered Session-C screening without changing
the model, prompt, decoding, retrieval, context, P2 interface or verification
contract.

Session C subsequently completed the fixed M1→M2→M3 order with exactly 95
one-shot primary calls and one standardized non-primary telemetry stream per
candidate: 285 primary calls, three telemetry calls, 855 ordered ledger events,
zero retries and zero reviewer calls. M1 recorded 92 valid actions, 43 syntax
passes, 10 visible passes, 17 hidden passes and 7 strict behavioral successes.
M2 recorded 89, 83, 35, 54 and 29 respectively. Both are valid inputs for the
separate Session-D analysis. M3 recorded two post-call length/transport
failures; the calls remain consumed and explicit, no retry was made, and the
candidate is `INFRASTRUCTURE_BLOCKED_NOT_SCORED`. Its remaining capability
counts are preserved but cannot be used as a valid candidate score.

All three telemetry boundaries passed `inference peak >= loaded idle`, with
loaded idle 13,466 MiB for each candidate and peaks M1/M2/M3 of
16,019/13,492/16,009 MiB. All candidate cleanups and final boundary checks pass:
no model process, port 8000 clear, GPU memory 0 MiB, no ephemeral API key/state
and no orphan worktree. Canonical Session-C evidence is
`docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_C.v1.json`
(`32ff39c0...c683`) and validation is
`docs/validation/2026-08-11-practical-local-model-tournament-session-c.md`.
No paired statistics, threshold classification, winner selection or product
decision was performed in Session C.

Session D then completed with zero model calls. M1 versus the 4B reference was
−16.84 pp with task/cluster bootstrap intervals wholly below zero and McNemar
`p=0.000855`, so generic 7B scale under the practical FP8 profile materially
regressed. M2 versus 4B was +6.32 pp, but task CI crossed zero and McNemar
`p=0.2863`, so the directional gain is inconclusive. The matched M2 versus M1
comparison was +23.16 pp with task CI `[13.68,32.63]`, cluster CI
`[14.74,31.25]`, and McNemar `p=0.00001049`, supporting bounded
`MATERIAL_FIM_AGENTIC_GAIN` rather than a pure-scale claim.

M2 reaches exactly 29/95, which satisfies the assisted/retry absolute floor but
not the complete promotion gate. It misses the 33/95 research and 57/95 product
thresholds, does not establish paired gain over the 4B reference, retains the
documented no-standalone-LICENSE caveat, and used a disclosed screening set.
The durable decisions are `NO_MODEL_PROMOTED` and `KEEP_MUTATION_DISABLED`.
Exactly one next experiment is selected as protocol only:
`BEST_7B_BOUNDED_RETRY_PROTOCOL`; it was not executed and requires separate
authorization. ADR 0016 records the decision. Canonical evidence is
`docs/experiments/model-specialization/MODEL_TOURNAMENT_RESULTS_INDEX.v2.json`.

The new BEST 7B bounded-retry generation has now completed Session A only.
The sealed M2 one-shot rows remain immutable; no first attempt was rerun. The
eligibility rule mechanically selected all 66 strict failures in task-ID order:
47 `VISIBLE_TEST`, six `HIDDEN_TEST`, six `SYNTAX_TYPE`, five `RETRIEVAL`, and
two `ACTION_VALIDATION`. Hidden failures receive only a fixed non-leaking
signal; hidden source, assertions, expected output, expected patch and reference
fix remain excluded.

All 66 second-call intents were materialized deterministically and stored as
hash-only/bounded metadata. Their aggregate digest is
`765c9f8171d5f8d8dee95de7962da16ef9bf5f5111f918a969116deead451b45`.
The exact FIM snapshot was rehashed, the 95-observation/285-event M2 lineage was
rebound, frozen E-MIN-V2 contexts regenerated byte-identically, and source
closure `f0d2cf3b01161645ea302cbbf03fe46108d034ff0ae2dffdc7366b965c72f2b4`
was sealed. Session A made zero model calls, did not start vLLM, and ended with
port 8000 clear, GPU model allocation zero and ephemeral model state absent.
Canonical evidence is
`docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_SESSION_A.v1.json`.
The next executable gate is a separate Session B invocation; it may make at
most one precommitted correction call for each eligible task. This invocation
stops at the Session-A boundary.

BEST 7B bounded-retry Session B subsequently executed exactly the 66 sealed
second-call intents under the same FIM-7B revision and practical FP8 profile.
The ordered lineage contains 66 intent/start/completion triples (198 events),
with zero third calls, duplicates, silent retries, reviewer calls or
infrastructure failures. Outcomes are preserved without Session-C
interpretation: one `RECOVERED`, 12 `FAILED_DIFFERENT`, 42 `REPEATED_EDIT`,
four `CONTRADICTION`, three `MALFORMED`, four `SAFETY_REJECTED`, and zero
`INFRASTRUCTURE_FAILURE`.

Safety remained fail-closed: wrong-file attempts, actual safety violations and
rollback failures are all zero. The 66 calls used 35,877 prompt tokens and
4,485 completion tokens over 63,193.95 ms total end-to-end latency. The current
per-process VRAM probe returned an unsupported nonnumeric value and the runner
created its ready marker after endpoint readiness, so load time, loaded-idle
VRAM, inference-peak VRAM and TTFT are honestly superseded to `NOT_MEASURED`
in an append-only telemetry supplement rather than reported as zero or copied
from the prior tournament.

FIM-7B was stopped after the final identity check. Port 8000 is clear, GPU
model allocation is zero, ephemeral key/state is absent and no temporary
worktree remains. Canonical evidence is
`docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_SESSION_B.v1.json`
(`631769a8...2b4e5`). Model promotion, retry-value and product decisions were
not evaluated. The only next experiment gate is a separate zero-call Session C.

Session C subsequently completed without starting FIM-7B or making a model
call. Maximum-two-call success is 30/95 versus 29/95 one-shot, with only 1/66
eligible failures recovered. Exact repeated edits dominate at 42/66 and 55/66
remain at the same failure stage. The frozen retry gate classifies the result
as `RETRY_NO_MATERIAL_GAIN`: recovery, repetition and token-multiplier checks
fail, while deterministic safety and latency checks pass. Retry is not admitted
to the default harness and product mutation remains disabled. The sole next
experiment is the prepared but unexecuted `SEMANTIC_FAILURE_DECOMPOSITION`
protocol. Canonical evidence is
`docs/experiments/model-specialization/BEST_7B_BOUNDED_RETRY_RESULTS_INDEX.v2.json`.

### T-M9-09 Semantic failure decomposition

Session A completed with zero target-model calls and without inspecting
individual model solutions deeply. It mechanically bound 95 unique FIM-7B
one-shot observations, 29 successes, 66 failures, 285 original call events and
all 66 retry links. The T1–T14 primary taxonomy, up to two secondary labels,
seven structural dimensions, evidence requirements, deterministic quality
audit and G1–G5 next-experiment gates are frozen before classification.

The evidence preflight records an important limitation: raw first-attempt
outputs and P2 action bodies were intentionally not persisted. A semantic
label that depends on unavailable edit content must therefore be
`T14_AMBIGUOUS_OR_INCONCLUSIVE` with LOW confidence unless another immutable
observable artifact directly supports it. Hidden-oracle or reference material
may not be used to reconstruct an unobserved edit. The 95-task set becomes
`ANALYSIS_EXPOSED` when Session B performs deep inspection and cannot support a
future fresh promotion claim. Canonical evidence is
`benchmarks/model-specialization/SEMANTIC_FAILURE_DECOMPOSITION_PREREGISTRATION.v1.json`
and
`docs/experiments/model-specialization/SEMANTIC_FAILURE_DECOMPOSITION_SESSION_A.v1.json`.
Session B requires a separate invocation.

Session B subsequently classified all 66 first-attempt failures and analyzed
all 29 success controls with zero model calls. Direct immutable evidence
supports five `T11_RETRIEVAL_FAILURE`, two
`T12_ACTION_OR_PATCH_REPRESENTATION`, and six
`T13_SYNTAX_CODE_FORMATION` records. The remaining 53/66 are correctly
`T14_AMBIGUOUS_OR_INCONCLUSIVE`/LOW because raw edit content was not persisted
and visible/hidden failure stages do not identify semantic causes. This is an
observability limit, not evidence that 53 tasks share one model failure mode.

All objective reference repairs fit one sealed range; observed mutation-scope
comparison remains unavailable without raw action bodies. Evidence is
`PARTIALLY_SUFFICIENT` for 61 failures and all 29 controls because exact source
was included but the visible test was not present in the final C1 context;
five failures are `MISSING_REQUIRED_EVIDENCE` from exact-source retrieval
failure. The independent second pass audited the frozen 60-record set with
zero disagreements. G1–G5 were not applied and no next experiment was selected.
Canonical evidence is
`docs/experiments/model-specialization/SEMANTIC_FAILURE_DECOMPOSITION_SESSION_B.v1.json`
and the Session-B results index under
`docs/experiments/model-specialization/semantic-failure-decomposition-session-b/`.
Session C requires a separate invocation.

Session C subsequently applied the frozen gates without any target-model call.
G1 is 5/66 (7.58%) versus 30%; G2 is 0/66 with no SUFFICIENT failure
evidence; G3 is 0/66 with no SUFFICIENT failure evidence; and G4 fails because
T13 is 6/66 while T14 is 53/66. G5 therefore applies with the precise result
that no G1–G4 intervention is supported and semantic observability is
insufficient for a more specific causal intervention. This does not establish
that T14 is a demonstrated mixture or that model semantics are adequate.

Exactly one next experiment was selected:
`PRIVACY_SAFE_SEMANTIC_OBSERVABILITY_EXPERIMENT`. Its 80-task,
repository-disjoint protocol compares hash-only and deterministic Level-1
derived mutation-feature views from the same future calls. It does not authorize
Level-2 edit-body retention and was not executed. Product mutation remains
disabled; FIM and E-EDIT P2 remain research-only. Canonical evidence is the
Session-C record and results index v2. No ADR is required because no durable
retention architecture was adopted.

The privacy-safe semantic-observability experiment Session A subsequently
completed as a zero-call freeze. It seals 80 deterministic mutation tasks in
eight new repository-disjoint fixtures, with zero repository-ID and canonical
task-fingerprint overlap against the analysis-exposed 95-task population. All
80 reference fixes pass syntax, visible and hidden verification.

L0 remains hash plus bounded execution metadata. L1 stores only deterministic
AST/control-flow/operator/count features and keyed HMAC digests for symbols,
identifiers, literals, calls and imports; it stores no raw prompt, model output,
edit body, identifier, literal, comment or source. Canary and determinism tests
pass with zero leaks. L0 and L1 must derive from one physical future call per
task, and Session C is restricted to the L0 packet root. L2 remains
unauthorized. Session B requires a separate invocation, an exact runner source
seal, zero-call dry run, empty ledger and clean frozen FIM serving attestation.

Session B passed its source-seal, zero-call dry-run, empty-ledger, serving and
hard-isolation gates, then fail-closed during the fourth physical call when the
model-produced replacement yielded an unparsable L1 after-source. Durable
lineage contains four STARTED events, three COMPLETED events, three checkpoint
rows and three L0/L1 pairs; tasks 5–80 were never called. The fourth call is
consumed and must not be retried. No source hot-patch or continuation occurred.
The sealed generation is permanently `ABORTED_FAIL_CLOSED`; a new append-only
protocol is required before any future execution. Model, port, GPU and secret
state were cleaned.

The append-only V2 recovery generation subsequently completed Session A with
zero target-model calls. It preserves all V1 accounting and excludes the four
consumed tasks from future primary analysis. Its frozen 80-task population
contains 76 zero-call/unexposed V1 tasks plus four new repository/task-disjoint
replacements; the replacements pass syntax, visible and hidden reference
verification, and overlap/duplicate gates are zero.

The new V2 L1 extractor is a total function over every completed response. It
separates response parsing, action validation and after-source parsing, emits a
same-schema lexical/HMAC fallback when AST features are unavailable, and never
turns a malformed model edit into an observability infrastructure exception.
The 19-case malformed matrix plus 1,000 deterministic property cases produced
1,019 exact L0/L1 pairs with zero crashes, missing packets, invalid packets,
nondeterminism or raw leaks. The source-sealed runner's hard-isolated zero-call
pipeline dry-run additionally passed valid, invalid-action, malformed, syntax,
visible-failure and hidden-failure paths. Future ledgers remain empty and V2
Session B is a separate invocation. Product mutation remains disabled and L2
remains unauthorized. Canonical Session-A SHA-256 is
`c4bae265ebdac2f658a94e1032628df350810c58ba47e10dceb6e75164f7c77d`.

V2 Session B subsequently passed every frozen entry gate and began the exact
one-shot FIM-7B run. Fourteen physical calls were consumed: 13 completed with
exact same-call L0/L1 pairs, while call 14 ended in the sealed runner's
`CALL_FAILED_PRE_RESPONSE` path. The runner stopped fail-closed without retry,
reviewer, hot patch or continuation; 66 tasks remain uncalled. All 13 pairs pass
schema/lineage/privacy checks with zero leaks, safety violations or rollback
failures, but the generation is incomplete and therefore not eligible for
primary observability analysis. It is permanently `ABORTED_FAIL_CLOSED`, not
Session-B PASS, and Session C is not ready. Post-abort tests/build/design gates
pass and model, port, GPU, API/HMAC and serving state are fully cleaned.

The append-only V3 recovery Session A subsequently completed with zero model
calls. A durable hash/source audit identifies the V2 terminal condition as a
completed response whose invalid JSON was misclassified by the frozen V2 runner
as pre-response; `SHA256("INVALID_JSON")` exactly matches the recorded error.
V2 remains immutable, closed and excluded from primary statistics.

The storage audit attributes approximately 318 GB of disposable state to five
simultaneously retained full repository copies that unnecessarily duplicated
the reusable model cache/runtime. V3 now freezes one live disposable isolation,
a capacity formula of
`max(maxTaskFixtureBytes*8,256MiB)+8GiB+max(16GiB,totalBytes*0.05)`, and the
sequence verification → rollback → removal → reclamation before another
`CALL_STARTED`. Nine injectable storage tests and the zero-call pipeline dry
run prove threshold, cleanup, stale-isolation and simulated-ENOSPC fail-closed
paths.

The sealed V3 population is 66 zero-call V2 tasks plus 14 new disjoint
replacements. Consumed-ID overlap, historical-95 fingerprint overlap and
duplicates are zero; all 14 references pass syntax/visible/hidden checks. The
unchanged total extractor passes 1,019 cases, and the new runner correctly
treats malformed JSON with a response body as completed data requiring one L0
and one L1. Session-A SHA-256 is
`5e6a60de68bd36602f4f0e8e328ee149e6e1cbcc78483dfc867850b37647bfaf`.
Future ledgers are empty and runtime cleanup passes. Current work stops here;
V3 Session B is pending a separate explicit invocation.

V3 Session B subsequently completed the frozen 80-task one-shot collection.
All 80 planned calls were consumed and returned response bodies; each produced
exactly one L0 and one restricted L1 packet with exact same-call pairing. There
were no retries, reviewer calls, duplicates or infrastructure aborts. All 80
actions parsed and validated; four after-source replacements produced the
sealed Tree-sitter syntax-error fallback, demonstrating total observability
without raw persistence or extractor failure.

The runner applied 72 patches; 67 passed syntax, 38 passed visible tests, 39
passed hidden tests and 36 passed all three. These are execution outcomes only;
no T1–T14 or semantic-cause analysis was performed. Safety violations,
rollback/cleanup failures, privacy leaks and orphan packets are zero. The
storage precheck passed 80/80 with a peak of one live disposable isolation and
zero retained workspaces. Post-run tests/typecheck/build/design validation and
runtime cleanup pass. Session-B SHA-256 is
`a421a905381365ede996821ece11e5272ee4e5e0ec11d8c510970bfb9b8541a7`.
Session C is pending a separate invocation; this work stops at the Session-B
boundary.

The subsequent V3 Session-C invocation stopped before classification because
the active analyst context was not L0-blind: Session-B finalization and its
durable/public report had already exposed L1-derived parse, validation and
after-source parser-failure aggregates. Under the Session-C isolation contract,
continuing would create a contaminated baseline.

Session C is append-only classified `FAIL_CLOSED` with zero L0 packet reads,
zero new L1 reads, zero hidden-oracle reads, zero classification rows and zero
model calls. No `L0_SEMANTIC_CLASSIFICATION_BASELINE` exists and Session D is
not ready. Runtime and validation gates pass. Canonical Session-C abort SHA-256
is `82790f1f9f4e0a91aba2c3e57196e95129caf4d0ae76ea70616c1d38db0fb83b`.
Recovery, if desired, requires an explicitly authorized append-only protocol
and a fresh isolated analyst context with no prior L1-derived exposure.

The authorized clean-room recovery subsequently materialized a closed-world
L0-only evidence package outside this repository. Its independent analyst
classified all 44 strict failures without L1 access: T13 is 13/44 and T14 is
31/44, with zero supported T1–T9 causes and 13/44 HIGH/MEDIUM confidence.
The 34-row frozen audit has perfect agreement and no disagreements. The old
Session-C abort remains immutable historical evidence; canonical clean-room L0
baseline SHA-256 is
`6b7337367a097356f40d05376508f3448de35b433184a7b09a1666b1d1dbecdf`.

V3 Session D then independently classified the same 44 failures from sealed
L1 packets before opening per-task L0 labels. L1 supports T1=6, T3=4, T7=5,
T13=13 and retains T14=16. Supported T1–T9 coverage rises from 0/44 to
15/44, T14 falls from 31/44 to 16/44, and HIGH/MEDIUM coverage rises from
13/44 to 28/44; each paired change is 34.09 percentage points. The 22-row L1
audit has perfect agreement. All frozen observability and privacy thresholds
pass, so the decision is `L1_OBSERVABILITY_JUSTIFIED` without product
promotion. Mutation remains disabled and FIM/E-EDIT statuses are unchanged.
Exactly one next protocol, `CODE_FORMATION_CONSTRAINT_EXPERIMENT`, is prepared
but not executed; L2 remains unauthorized.

Code-formation Session B subsequently completed 80/80 calls but yielded zero
valid P2 actions in both arms. The zero-call Session C audit proves that all 40
TREATMENT observations stopped at `BASE_P2_REJECTED`, before any
formation-specific check. CONTROL was not operationally equivalent to the
known-good historical FIM/P2 path: it bypassed `retrieveG3` E-MIN-V2/C1
construction and reused the schedule seed as the generation seed. Exact
response rejection causes are not recoverable from the retained hashes and
coarse stage fields, so all 40 records per arm remain
`UNOBSERVABLE_INSUFFICIENT_EVIDENCE`.

The scientific decision is `INVALID_UPSTREAM_CONTROL_COLLAPSE`; the formation
effect is `NOT_IDENTIFIABLE_UPSTREAM_ACTION_COLLAPSE` and must not be inferred
from 0 versus 0. Product status remains `KEEP_MUTATION_DISABLED`. Exactly one
fresh, repository/task-disjoint
`CODE_FORMATION_CONTROL_RECOVERY_GENERATION` protocol is prepared but not
executed; the exposed 40 tasks are diagnostic-only and cannot be reused as
fresh evidence.

### T-M10-01 Offline release preparation

Generated reproducible SPDX, license inventory, source manifest, release
manifest, release-gate JSON and hashes. The SBOM has 840 components and npm
offline resolution dry-run passes. Local Cargo manifests, Python dist-info and
the pinned Qwen model card/LICENSE replace hundreds of prior `NOASSERTION`
entries without network acquisition. Release remains blocked by no source
commit, an undeclared root project license plus remaining authoritative
dependency metadata gaps, native/Windows installers, signing, quantization and
external delivery. The post-G3 refresh additionally records low naturalistic
quality and 0/60 exact patch success as stop-ship gates, and hashes the G3
release supplement. Use the newest immutable `m10-release-prep-*` result and
`artifacts/release/SHA256SUMS.json`.

## Protected actions

### Completed v0.2.0 public-release closure — 2026-08-13

The owner-authorized final release invocation extended the reviewed candidate
contract to PR #1 merge, annotated `v0.2.0` tag creation, public GitHub Release,
and unsigned MSI/NSIS/checksum publication. Force push, signing without trusted
credentials, v0.1.0 mutation, model publication, and autonomous mutation remain
forbidden.

The final native acquisition boundary starts no Git or other child process,
reads bounded repository-reported HEAD/ref text as untrusted metadata, does not
validate object existence/type, rejects `.git` indirection, and reports
`NOT_CHECKED_SAFETY_BOUNDARY`. Windows filter-canary regression, 5/5 native
tests, clippy, clean-source full JS/TS checks, source identity, remapped Windows
MSI/NSIS build, both installer-engine smoke lifecycles, v0.1→v0.2 NSIS upgrade,
and clean-profile NSIS lifecycle pass. Exact build-input source identity is
`24f2bd1f71ca66c2a3f9db01e166fc8fb368bf9dd7f9ee704cab04be5bca70ec`
(2,390 files; 89,503,124 bytes; Linux/NTFS exact). Canonical MSI/NSIS hashes
are recorded in `WINDOWS_PACKAGING_RELEASE_QA_REPORT.v4.json`; v2/v3 packages
are superseded and were not published. Exact staged privacy review and both
independent final reviews passed; PR #1 merged to public `main`; annotated tag
`v0.2.0` targets the merge commit; the release is public/latest; and fresh
downloads of both installers passed the published checksum manifest. The
canonical closure record is `PUBLIC_RELEASE_v0.2.0_REPORT.v1.json`. Target-
model and benchmark calls remain zero. Signing and optional GitHub Settings
social-preview upload remain deferred.

The existing Qwen3.5-4B and explicitly approved Qwen2.5-Coder-3B snapshots remain in ignored runtime caches. For tournament Session B, the owner separately authorized only the exact BF16 snapshots `Qwen/Qwen2.5-Coder-7B-Instruct@c03e6d358207e414f1eca0bb1891e29f1db0e242`, `TIGER-Lab/FIM-7B@5a1d4294185e4fa0bbd40750c87d0beab7e67a3a`, and `SWE-bench/SWE-agent-LM-7B@a44fce0216647696a7437126e82fc1eaa34008d7`, plus derived-at-load vLLM FP8 per-tensor validation. Those snapshots are now verified in the ignored cache. Authorization does not extend to another model/revision, a pre-quantized snapshot, AWQ/GPTQ/INT4, automatic fallback, dependency installation, sudo/admin operations, Git commit/remote/push/PR, tag, release, signing, or other protected external action. No external GitHub write is authorized by this plan.

Repository boundary: Desk Code Agent is an independent repository published at
`hanklin9188/Desk-Code-Agent`. Public `main`, PR #1, annotated `v0.2.0`, and the
v0.2.0 release are verified. Unrelated local research artifacts remain
untracked and excluded from publication.
