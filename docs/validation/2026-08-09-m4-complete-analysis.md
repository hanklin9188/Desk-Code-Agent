# M4 complete analysis validation — 2026-08-09

## Result

`PASS` for the evidence-labelled repository overview, architecture, quality,
testing, security/risk, performance-hypothesis, onboarding and report-synthesis
workflow. Skill production admission remains a separate M6 gate.

## Product behavior

- Generates all eleven required report sections.
- Distinguishes `DETERMINISTIC_EVIDENCE`, `MODEL_INFERENCE`, `HYPOTHESIS`, and `UNKNOWN`.
- Requires every non-UNKNOWN claim to cite the current evidence ledger.
- Rejects unknown citations and gives UNKNOWN claims zero confidence.
- Reports dangerous API and performance patterns as bounded hypotheses, not proven vulnerabilities or bottlenecks.
- Uses resolved/inferred dependency edges and source/test mappings from M3.
- Produces human-readable Markdown from the same validated typed report.
- Sends an explicit JSON Schema to vLLM constrained decoding, including an enum of permitted evidence IDs.

## Deterministic corpus

Final run: `m4-report-corpus-2026-08-09T00-49-36-399Z`  
SHA-256: `36affddd208bbfad3362173aa8d97f1275a519578184e95621ac4d81a13deb10`

Nine fixture repositories cover modular design, poor structure, low tests,
duplication, subprocess risk, a performance hotspot, misleading README,
prompt injection, and ignored vendor/generated trees.

| Metric | Result |
|---|---:|
| Fixtures | 9 / 9 PASS |
| Citation precision | 1.00 |
| Citation recall | 1.00 |
| Evidence completeness | 1.00 |
| Hallucinated-file rate | 0 |
| Unsupported-claim rate | 0 |
| Mean latency | 11.136 ms |
| Model tokens | 0 (deterministic isolation run) |

The prior `m4-report-corpus-2026-08-09T00-49-17-363Z` run remains preserved
as FAIL (8/9, duplication false negative).

## Live BF16 report

Final run: `live-complete-report-2026-08-09T00-56-00-998Z`  
SHA-256: `130e02dbc248a310a68bc0c4a20ede27f520a8327eea01718925958baa56b18a`

- Exact Qwen revision: `851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a`.
- vLLM 0.26.0, BF16, loopback-only.
- 7/7 model claims cited current ledger evidence.
- Unknown citations: 0.
- Unsupported claims presented as deterministic: 0.
- Prompt/completion tokens: 2,603 / 709.
- End-to-end model request latency: 12,206.27 ms.

Four earlier live validation failures are preserved: confidence schema mismatch,
numeric-string repair mismatch, truncated JSON, and unknown/empty citation. None
was promoted to PASS. Constrained JSON Schema generation resolved the underlying
gateway contract weakness.

## Dual-axis review

Spec: all required modes and report sections exist; evidence labels and corpus
metrics directly cover the requested claims and seeded risks.

Standards: repository text remains untrusted, scanners are bounded, raw model
prose/prompts/excerpts/API keys are absent from experiment artifacts, and model
output cannot choose a citation outside the server-constrained evidence enum.
