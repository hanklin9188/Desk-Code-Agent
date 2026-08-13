# Desk Code Agent Evaluation

The benchmark answers:

1. Can a local 4B model perform useful repo-level work with bounded harness support?
2. Which gains come from retrieval, verification, Skills and logical agents?
3. What quality/cost tradeoff comes from precision, context and thinking profiles?
4. Does the desktop product remain safe, observable and smooth under real runs?

Suites:

- DCA-Fixtures
- Repo Report
- Bounded Coding
- Skill Trigger/Process
- Safety/Injection
- UI Event/Motion
- Systems/Quantization
- selected external benchmarks after license/environment review

Current local harness-recovery evidence uses the immutable
`harness_recovery_manifest.json`: 108 unique tasks spanning Coding, Diagnosis,
Repository navigation, Review, Analysis and Safety. The original six-task
E1–E7 suite is retained as pilot/diagnostic evidence. The optimized same-suite
result is not a substitute for a fresh holdout or real repository patch corpus.

Generation-3 retrieval development adds 224 balanced tasks, a 140-task L3-heavy
hard suite, 48 tasks across 12 pinned read-only repositories, and 60 executable
patch instances. E-MIN-V3 was frozen before the separate 210-task G2 suite was
authored and sealed. G2 retained E-MIN-V2 because task success tied at 100% and
V3 exceeded the token-overhead gate, despite materially better evidence
coverage. See `docs/27_RETRIEVAL_GENERALIZATION_AND_G2.md`.
