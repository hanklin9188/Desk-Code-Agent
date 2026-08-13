# Experiment records

Required families are E1 direct prompt, E2 single agent, E3 retrieval, E4 context packaging, E5 verification loop, E6 reviewer and E7 full bounded harness. Runs must pin task manifest, model/runtime revision, precision, decoding, hardware and budget. Missing capability is `NOT_RUN`; placeholder metrics are forbidden.

`npm run benchmark:deterministic` persists an immutable, uniquely named
`runs/<experiment-id>/result.json` record using exclusive file creation. Its
deterministic subsystem checks are independent of the E1-E7 model task suite;
therefore an overall deterministic `PASS` never promotes an unexecuted model
experiment beyond `NOT_RUN`.

Fresh holdout generations are immutable after their first model call. G2's
preregistration, public manifest, sealed oracle, candidate artifacts, and suite
seal live under `benchmarks/holdout-g2/`, each with a SHA-256 companion. Its
result is `runs/m9-fresh-holdout-g2-2026-08-09T08-14-16-853Z/`. The documented
option-cue ceiling is retained as a limitation; G2 must not be edited and rerun
as though it remained untouched.
