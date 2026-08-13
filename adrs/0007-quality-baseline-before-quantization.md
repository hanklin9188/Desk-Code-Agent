# ADR 0007 — BF16 Quality Baseline Before Quantization

**Status:** Accepted for evaluation  
**Decision:** Establish BF16 task-level baseline first. FP8/INT8/INT4 profiles enter product only after paired end-to-end coding/report/review/safety benchmarks.

## Rationale

Weight compression savings do not prove agentic task quality. Small degradations can compound over long workflows.
