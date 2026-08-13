# GitHub Delivery

Canonical target:

`https://github.com/hanklin9188/Desk-Code-Agent`

Every accepted M0–M10 milestone must prepare a GitHub checkpoint. Actual repository creation, push, PR, merge, tag and release require separate explicit approvals.

Key invariants:

- no direct main push
- no user repos/model weights/secrets/private traces
- secret/license scan before push
- draft PR before merge
- remote/local SHA verification
- clean-clone reproduction
- checkpoint ledger

The authoritative policy is `GITHUB_SYNC_POLICY.md`.
