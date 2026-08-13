# Patch Interface V3 Coder-3B validation

Status: **PASS — 420/420 FRESH PRIMARY CALLS SEALED AND CLEANED UP**

The only authorized candidate, Qwen2.5-Coder-3B-Instruct, ran from revision
`488639f1ff808d1d3d0ba301aef8c11461451ec5` in BF16 under the same frozen
serving/runtime/scoring contract as baseline. The candidate-only historical
repetition penalty did not recur: generation config was exactly `vllm`.

- Fresh run directory: `patch-interface-coder-v3-20260811T005651Z`.
- Snapshot verification: 8/8 registered files PASS; no download occurred.
- Completed observations: 420/420; checkpoint rows: 420.
- Call ledger: 840 ordered events; retries 0.
- Request-intent digest:
  `24c5d7b4692b95de589bf1206320f7becf649fd697bdd85fd395a14cae853105`.
- Result status: `COMPLETE_DEVELOPMENT_DIAGNOSTIC`.
- Result SHA-256: `30a628def03591884b546d3cdb9092e8fdcc3c6cb61084ee52dbd35891a54cdc`.
- Transport infrastructure errors: 0; final serving identity PASS; final causal
  closure exact `c7b322b5d3dcc62ad453a69954308bab45d74b7521356a53ad1901bf7c27ed21`.
- Wrong-file output attempts, actual safety violations, cleanup failures, and
  temporary fixture residue: all 0.
- GPU samples: 13,502 MiB minimum, 15,967 MiB maximum; shutdown evidence 0 MiB.
- Lifecycle and no-service strict finalized-result recovery: PASS.

Lineage is now 7 historical excluded V2 calls plus 840 valid V3 primary calls,
for 847 physical calls. V2 rows/events were not imported. Next gate is paired
failure decomposition, P0–P4/refusal/contract/granularity analysis and the
unchanged preregistered E-EDIT promotion decision.

No dependency install, additional model download, sudo/admin operation, Git
commit, remote change, push, pull request, tag, signing, or release occurred.
