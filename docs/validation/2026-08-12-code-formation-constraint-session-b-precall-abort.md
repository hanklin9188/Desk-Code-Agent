# Code Formation Constraint Experiment — Session B Pre-call Abort

Status: `ABORTED_FAIL_CLOSED_BEFORE_FIRST_CALL`

The exact FIM-7B FP8 runtime passed identity checks, but the sealed runner
attempted to hash a nonexistent top-level preregistration field before it could
append `CALL_STARTED`. The frozen prompt is stored under
`control.systemPrompt`; the runner reads `systemPrompt`.

No scored observation began:

- planned calls: 80
- actual target-model calls: 0
- control / treatment calls: 0 / 0
- lifecycle and observation ledger bytes: 0 / 0
- retries or hot patches: 0

The runtime was stopped and cleanup returned model processes, port 8000, GPU
allocation, API-key state, and disposable workspaces to zero. Session B is not
complete and Session C is not authorized.
