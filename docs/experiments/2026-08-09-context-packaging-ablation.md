# Context packaging ablation — 2026-08-09

Run: `m9-harness-recovery-diagnostic-2026-08-09T04-32-48-950Z` (SHA-256 `96ab3988be27ab9b7243c560cc8448395a2ceff423e965baa0369c8bb17054c2`).

| Variant | Raw success | Rate | Median total tokens | Instruction tokens | Evidence tokens | Signal ratio |
|---|---:|---:|---:|---:|---:|---:|
| C0 | 103/108 | 95.37% | 120 | 25 | 19 | 43.18% |
| C1 | 106/108 | 98.15% | 164 | 25 | 19 | 73.12% |
| C2 | 105/108 | 97.22% | 194 | 25 | 43 | 78.63% |
| C3 | 106/108 | 98.15% | 184.5 | 25 | 27 | 75.49% |
| C4 | 106/108 | 98.15% | 219 | 25 | 43 | 78.63% |
| C5 | 105/108 | 97.22% | 279 | 45 | 52 | 68.75% |

C1 (task + source) and C3/C4 each scored 106/108. C1 was the minimum equivalent variant at 164 tokens, versus 184.5 for C3 and 219 for C4. C5 added redundant policy/metadata, used 279 tokens, and regressed to 105/108. C0 omitted the task, reduced its median signal ratio to 43.18%, and scored 103/108.

Retained policy: C1 by default. Add a test, caller/callee, or concise metadata one class at a time only after an evidence-gap signal. Full wrapper C5 is rejected for the default Qwen path.
