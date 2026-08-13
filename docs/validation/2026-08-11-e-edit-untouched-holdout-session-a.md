# E-EDIT Untouched Holdout — Session A Validation

Date: 2026-08-11  
Session: A (Phases 0–3 only)  
Status: PASS  
HOLDOUT_EXECUTION_STARTED: false

## Frozen candidate

- E-EDIT candidate: `7abdcd7cfe84b3e3e6844ecc81c8a4c783a9af53e45dcbb0489fa0e157a32fbc`
- Secondary preregistration: `937e4a80d871d63626cee70b22a1248af22eae2a4b395a63870cf01c023dd6b3`
- Candidate source closure: PASS, 16/16 files
- Secondary source closure: PASS, 16/16 files

## Final Session-A artifacts

- Holdout preregistration V2: `5e1d4ece269cd807f625ef7f0c41b1867dce5600f25e4080bfcf02746e4833c5`
- Repository manifest V1: `4caddd313081a31433c752f30a4fb6bfbf0c69445e3ade7660ada58137b3ecd1`
- Holdout manifest V5: `36e13ea25be42009ea98738687b6e854f75a2de0c75c3cd2ad0e0df2b04d3014`
- Hidden oracle V5: `3109a023ed5c07faa4acc029824bf8988f9ee0515ecc7b1ea07387861d5d787d`
- Integrity V2: `76f0d407886e41a8f21e04d7061d37f97fd095bcbfabc5cfbe7353f78c5ff274`
- Holdout seal V2: `51b7c6d79d7f07eab84017488aeae6aa8a061430af36eda3df34348b76f9f823`
- Session-A record V2: `103143d67d7636771df5244d7168cee4b1b6eda4675489cf2f175b64bbc294dd`

Every listed artifact has a byte-exact SHA-256 sidecar. Seal V2 binds an
18-file execution source closure; a fresh verification found zero mismatches.
Two consecutive seal runs produced identical artifact hashes.

## Corpus and integrity gates

- Repositories: 15/15, pinned by content SHA-256 revision
- Tasks: 120/120
- Mutation-required: 80
- Natural failure-recovery: 15
- REPORT_ONLY/unsupported: 10
- Safety/adversarial: 15
- Model-applicable tasks per one-shot condition: 95
- Deterministic zero-call policy tasks: 25
- Difficulty: L2 30, L3 60, L4 30
- Scope: 75 single-file, 20 multi-file evidence/single target, 25 non-mutation
- Repository identity overlap with historical development evidence: 0
- Task identity overlap with historical development evidence: 0
- Maximum historical prompt Jaccard: 0.25 (threshold 0.82)
- Maximum within-holdout prompt Jaccard: 0.7428571428571429 (threshold 0.82)
- Target, reference-fix, and hidden-oracle leaks: 0
- Reference adapters: 190/190 PASS
- Reference behavioral verification: 95/95 PASS
- Exact rollback: 95/95 PASS
- Policy-oracle preflight: 25/25 PASS with zero calls
- Frozen request intents: 190 unique; raw prompts not persisted

## Append-only corrections

Session A preserved every failed pre-call artifact and corrected only the gate
that failed:

- preregistration V1: invalid arithmetic allocation; superseded by V2;
- manifest/oracle V1 and V3: unsealed prompt-similarity failures;
- manifest/oracle V2: interrupted multi-artifact publication with no model call;
- manifest/oracle V4: unsealed numeric-sort reference-oracle failure;
- integrity/seal/session V1: valid first publication, superseded by V2 solely to
  make repeated publication byte-stable through one shared timestamp.

No holdout result was observed and no threshold, E-MIN-V2 behavior, E-EDIT P2
interface, scoring rule, safety boundary, or hidden-test policy was tuned.

## Repository validation and runtime cleanup

- Standalone strict TypeScript for all holdout scripts: PASS
- Project TypeScript build: PASS
- Vitest: 26 files, 130 tests PASS
- vLLM/holdout model process: absent
- Port 8000 listener: absent
- Holdout runtime state/API key: absent
- Holdout temporary directories: absent
- Holdout GPU allocation: absent (an unrelated EdgeFlow process owns the only
  reported GPU PID and is outside this repository/session)
- Protected actions: none

## Boundary

Session A is complete. Per the Master Protocol this invocation stops here.
Session B is the next eligible session and must revalidate the seal before its
first model call. Session C has not started, and product autonomous mutation
remains disabled.
