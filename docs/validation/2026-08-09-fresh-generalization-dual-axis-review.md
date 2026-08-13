# Fresh generalization work package — dual-axis review

Date: 2026-08-09  
Fixed point: no repository commit exists; reviewed file hashes are listed below.  
Decision: **APPROVE LOCAL EVIDENCE PACKAGE WITH RECORDED EXTERNAL/LIMITATION GATES**.

## Reviewed fixed point

| Artifact | SHA-256 |
|---|---|
| `scripts/run_fresh_patch_evaluation.ts` | `12d1b91919dc6249e76f2aa47432db9f519d98afd1dcf1043e20fb2b6b80b1df` |
| `scripts/run_fresh_safety_evaluation.ts` | `fa3900c30c9982bba8506e41e99d094000559b6d7b47ae16b61f8ababe700487` |
| `scripts/run_fresh_specialist_evaluation.ts` | `e93daa9d56e054320eb675eb8cab8943db352f2e6666c17a217b8930e5c9c2f8` |
| `scripts/run_real_repository_evaluation.ts` | `9972c2478c1eea9ad1fb2db3cfe7a121463c0a9c2bc2110528bceee78cd4558a` |
| `scripts/write_fresh_generalization_reports.ts` | `28a7adab32cbdfbc949c35190e0bb47ffa1004f08175c8c6ebb0559ea3f9f760` |
| `scripts/run_m10_release_prep.ts` | `2dc5c9c7d58234aa27733da4408e88538999d696d28e17feb7ec6f4cd0fdcff4` |
| `docs/validation/2026-08-09-m9-fresh-generalization.md` | `f016ac3205f56f1ae08797638fec7e6d52e40bf090dc984635ce438f766500fa` |
| `adrs/0010-retain-emin-v2-after-fresh-holdout.md` | `2b0db43b11ea09e617aa31833a9f02ff8e43017cec9536da4948880f18dc5fac` |
| `package.json` | `e3af7a4d9a6a45478fc841975b42cf6a0e0f3570523ac3f678d8f8fea212c8e5` |

## Spec axis

Review context was limited to the continuation request, preregistration, frozen/sealed artifact hashes, immutable result indexes, ADR 0010, and the final validation report.

- Candidate freeze and source closure: satisfied and revalidated after all runs.
- Preregistration before task generation: satisfied; 150 unique tasks and exact category/difficulty counts match.
- E1 versus frozen E-MIN-V2: 420 planned calls completed, including the fixed stability subset; no exclusions or tuning.
- Paired/statistical/category/difficulty/cost reporting: present.
- Retrieval, context, L4/report-only, and safety reporting: present; the failed retrieval hypothesis and unavailable peak-VRAM metric are not hidden.
- Supplemental gates: 24 paired executable patch tasks, 20 adversarial execution cases, architecture 12, diagnosis 15, review 16, and 12 tasks over four pinned public repositories are present.
- Task-conditional Skill admission: present; R09 retained, no new promotion, frozen registry unchanged.
- Product decision and ADR: present; E-MIN-V2 retained with a precise public-repository limitation.
- UI/M8 and offline M10: rerun; Windows/native/signing/quantization/remote gates remain honestly blocked or not run.
- Git/GitHub restrictions: no commit, remote, push, PR, tag, release, signing, or external write occurred.

Spec findings:

- No blocker or major implementation omission.
- Known measurement limitation: primary peak VRAM is unavailable because the process-level NVIDIA query returned `N/A`; the report correctly rejects a zero-VRAM claim.
- Known quality limitation: E-MIN-V2 lost two public-repository tasks due to missing required evidence. This is a next-generation input, not a current-candidate patch.

Spec decision: **PASS WITH EXPLICIT LIMITATIONS**.

## Standards axis

Review context was limited to repository operating rules, Skill D04/D05/D07/D11 and R09/R11/R18/R21/R22/R25/R26 contracts, changed evaluator/release scripts, deterministic test evidence, security audit, and runtime cleanup evidence. It did not use the spec-axis conclusion as a substitute for code/security review.

- Experiment immutability: new run directories use exclusive creation; prior evidence is not overwritten.
- Evaluator corrections: the Python unittest import-root run and unsupported `uniqueItems` run remain immutable and are explicitly classified as invalid; corrected runs change only evaluator mechanics. Stored patch selections were replayed with zero new model calls.
- Trust boundary: raw prompts/model outputs/API key are not stored; repository evidence remains untrusted data.
- Execution safety: patch application uses allowlists/budgets, trusted shell-free commands, bounded output/timeouts, real tests, and rollback SHA checks.
- External repositories: exact commits verified before/after and all worktrees remain clean.
- Release provenance: model revision/license, locks, Skill state, quality decision, known limitations, SBOM, and checksums are present. Local metadata reduced `NOASSERTION`; unresolved authoritative data remains blocked rather than guessed.
- Static/runtime validation: design validator, TypeScript, 69 tests, production build, seal checks, secret scan, public-repo cleanliness, port/API-key/GPU cleanup all pass.

Standards findings:

- Minor maintainability debt: experiment runners are intentionally self-contained and dense. If reused for a second generation, extract shared model-call/statistics/evidence helpers only before preregistration, not while a holdout is active.
- Release blockers are external/approval or product-governance issues: undeclared root license, 148 unresolved dependency licenses, native packages, Windows QA/signing, reduced precision snapshot, and source/GitHub publication approval.

Standards decision: **PASS FOR LOCAL EVIDENCE; RELEASE REMAINS BLOCKED**.

## Aggregate decision

Both axes approve the local implementation/evidence package. Approval does not mean the product release gate is green and does not authorize Git or GitHub actions. No post-review change to the frozen candidate or sealed evaluation artifacts is allowed.
