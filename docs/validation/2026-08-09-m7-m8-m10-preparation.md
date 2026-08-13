# M7, M8 and M10 offline validation — 2026-08-09

## M7

Offline adapter run `m7-offline-delivery-2026-08-09T01-22-09-316Z`
(`866cc16cfff0bfb6668ea50c6109df25ed53f93fcf3b3a0140b52ba8a3fc822b`) is PASS.
Injected memory transport exercised create branch, push and draft PR. Exact
action/target/hash/expiry, one-time approval, main protection, secret scanning
and bounded PR metadata are enforced before transport. Network/external writes
were zero. Actual delivery remains `BLOCKED_APPROVAL`.

## M8

UI run `m8-ui-performance-2026-08-09T01-29-21-025Z`
(`44c3bd276523720f1187586b77d309be87f3d7f0b8325c9e731bcdfb4b4fde3e`) is PASS for web/product scope.
All required workspace views exist, idle telemetry/verification no longer show
fabricated PASS/ready values, and thirteen truth traces cover success, failure,
retry, cancel, timeout, injection, approval, rollback, Skill rejection, model
offline, sandbox downgrade and report-only behavior.

- 100,000-event replay: 405.4 ms (246,670 events/s), zero truth-count loss.
- UI event window: bounded to 2,000 events.
- SSR render p95: 1.647 ms across 50 samples.
- axe serious/critical findings: zero with color contrast still manual.
- Reduced-motion behavior: PASS in automated test/benchmark.

Pinned Rust fmt and locked metadata pass. Native `cargo check --offline --locked`
reaches `libdbus-sys` and stops because `pkg-config`/`libdbus-1-dev` are absent.
WebKitGTK, rsvg, appindicator and patchelf are also absent. Linux packaging is
`BLOCKED_EXTERNAL`; Windows installer, Narrator and manual accessibility QA are
`NOT_RUN`.

## M10

Final offline release preparation run `m10-release-prep-2026-08-09T01-36-46-255Z`
(`19f9d9bc75b510db4f09e4f200c92dc2092acab39bfecf8ced97e37a8ce90390`)
is PASS for its bounded scope. It generated SPDX, license, source, release and
release-gate artifacts plus checksums over 293 source files. SBOM contains 840 components. Dependency
resolution `npm ci --dry-run --offline` passes; an actual fresh installation is
not authorized. The machine release gate remains `BLOCKED_EXTERNAL_AND_APPROVAL`
because source revision, 622 unresolved licenses, native/Windows installers,
signing, quantization and external delivery are incomplete.
