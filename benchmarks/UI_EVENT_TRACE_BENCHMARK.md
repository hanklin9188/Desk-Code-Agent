# UI Event and Motion Benchmark

## Trace sets

- short explore (30 events)
- repo report (300 events)
- bug fix with retry (500 events)
- long run with telemetry (10,000 events)
- cancellation at every stage
- out-of-order/duplicate reconnect stream

## Assertions

- final UI projection equals runtime summary
- no PASS from NOT_RUN
- approval bar target/hash exact
- event-to-visual p95 <100ms
- normal motion frame p95 ≤16.7ms target
- reduced-motion functional parity
- no unbounded DOM/memory growth
- graph has list alternative and keyboard access
- no toast storm: notification rate bounded
