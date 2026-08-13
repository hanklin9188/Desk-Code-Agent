# Patch Interface V3 E-EDIT final validation — 2026-08-11

Status: `PASS_AS_MEASURED_DEVELOPMENT_ONLY`

## Canonical evidence

- Results: `benchmarks/patch-interface/E_EDIT_NORMAL_RETRIEVAL_RESULTS.v1.json`
  - SHA-256 `fd34d6af4f4b27339356e3b05e1d73e4ec4c52aef28facc0e4dd27727bff32a7`
- Results index: `docs/experiments/patch-interface/E_EDIT_RESULTS_INDEX.v1.json`
  - SHA-256 `3d2107f75c820378056a2630029c24b44ee44d0d4abdc1c077c919b0ac70a33e`
- Capability ceiling: `docs/experiments/patch-interface/PATCH_CAPABILITY_CEILING.v3.json`
  - SHA-256 `bf6b876a13eddd9738a161096cd41eed6a9e709ed500f2769e4ada994e5dc1ff`

The report writer was rerun and all three artifact hashes remained unchanged.

## Result

| Profile | One-shot behavioral | Hidden | Valid P2 | Retry | Maximum two-call |
|---|---:|---:|---:|---:|---:|
| Qwen3.5-4B | 18/50 | 23/50 | 46/50 | 5/32 recovered | 23/50 |
| Coder-3B | 9/50 | 12/50 | 48/50 | ineligible | 9/50 |

Normal E-MIN-V2 retrieval selected and included the exact source for 50/50
tasks in each profile.  This generation therefore did not expose a retrieval
recall bottleneck.  P2 reveals latent bounded patch capability, but reasoning
and model capability remain material bottlenecks.  Coder-3B did not outperform
the general 4B model under normal retrieval.

Across the secondary generation there were 100 one-shot calls and 32
preregistered second calls.  Full physical lineage is 7 excluded V2 + 840
valid primary V3 + 100 normal retrieval + 32 retry = 979 calls.

Product mutation remains disabled.  The evidence is development-only and does
not establish unseen-repository generalization or autonomous patch readiness.
A separately frozen repository-disjoint holdout is the next scientific gate;
none was created or inspected in this task.

## Safety and regression

- wrong-file attempts: 0;
- actual safety violations: 0;
- rollback failures: 0;
- three lifecycle cleanup artifacts: PASS;
- patch-interface security regression: 1,540/1,540, 77 structural operators,
  SHA-256 `a9a43b1a263446b128685a3d9b16cf1f788665b1186d39679827ff4aa8d1f39a`;
- strict TypeScript: PASS;
- project typecheck: PASS;
- full tests: 26 files / 130 tests PASS;
- design validation: 1,120 files, 39 skills, 24 schemas, 0 warnings/errors;
- production build: PASS;
- all 12 final artifact sidecars: PASS;
- normal-retrieval and retry source closures: PASS;
- secret scan: PASS;
- model-weight Git exclusion: PASS;
- model process absent, port 8000 clear, GPU 0 MiB, API key/state absent;
- exactly one Git worktree.

The repository has no tracked baseline and is intentionally entirely untracked;
therefore a conventional clean `git status` claim is unavailable.  No commit,
remote, push, PR, tag, signing, release, dependency installation, sudo, or
model acquisition occurred.
