# Patch Interface V3 baseline validation

Status: **PASS — 420/420 FRESH PRIMARY CALLS SEALED AND CLEANED UP**

The Qwen3.5-4B baseline ran from the exact registered revision
`851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a` in BF16 with the frozen vLLM
profile and request-intent digest
`01c61618e78adf0e5f7013db29a3cf196a043f2e66f2668ff26be2c536f24a0e`.

- Fresh V3 run directory: `patch-interface-baseline-v3-20260811T003246Z`.
- Completed observations: 420/420; checkpoint rows: 420.
- Call ledger: 840 ordered events, exactly one START and one terminal event per
  observation; retries 0.
- Result status: `COMPLETE_DEVELOPMENT_DIAGNOSTIC`.
- Result SHA-256: `66db7559d7ea624317f16b56c00d96b0802c229e89272912ab37a433ef214635`.
- Transport infrastructure errors: 0.
- Final serving identity: PASS.
- Final causal closure: PASS, exact
  `c7b322b5d3dcc62ad453a69954308bab45d74b7521356a53ad1901bf7c27ed21`.
- Actual safety violations: 0; cleanup failures: 0; temporary fixture residue: 0.
- Wrong-file output attempts: 1; the runtime rejected it and no forbidden
  mutation occurred.
- GPU samples: 12,020 MiB minimum, 15,951 MiB maximum during the run; shutdown
  evidence records 0 MiB.
- Lifecycle cleanup: PASS; port clear, processes absent, API key absent,
  serving-state files removed, one Git worktree, no temporary fixtures.
- Strict finalized-result recovery without a running model returned the same
  result hash and did not make another call.

The seven V2 calls remain excluded and no V2 row/event was imported. No model
download, dependency install, sudo/admin operation, Git commit, remote change,
push, pull request, tag, signing, or release occurred.

Next gate: a new, empty Coder-3B V3 run directory with the independently sealed
420-request digest and identical runtime/scoring/safety conditions.
