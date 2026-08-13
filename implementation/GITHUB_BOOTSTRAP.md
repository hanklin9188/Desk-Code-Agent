# GitHub Bootstrap Plan

Target: `https://github.com/hanklin91888/Desk-Code-Agent`

This is a plan only. Execute each protected action after explicit approval.

## Before repository creation

- Confirm account spelling: `hanklin91888`.
- Decide public/private visibility.
- Confirm repository name and license.
- Run M0 validator, secret/license scan and hashes.
- Review files included in first commit.

## Proposed initial sequence

```text
1. Create empty repository (approval)
2. Configure local remote (approval)
3. Create milestone/m0-design-v2 branch
4. Commit v2 design pack locally
5. Push branch (approval)
6. Open draft PR with M0 checklist (approval)
7. Run CI
8. Review remote files and SHA
9. Merge (separate approval)
10. Tag v0.2.0-design (separate approval)
```

## M0 PR title

`docs: establish Desk Code Agent v2 bounded-skill design baseline`

## M0 PR body must include

- product scope and task envelope
- 39 Skills and adaptation rationale
- UI/Animate UI/motion plan
- validation output and hashes
- no remote/model/user source included
- open M1 decisions
