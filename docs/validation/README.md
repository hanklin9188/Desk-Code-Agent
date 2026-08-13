# Validation evidence

Records here contain exact commands, environment, status, artifact hashes and open risks. `NOT_RUN`, `TIMEOUT`, `CANCELLED` and `UNKNOWN` are never converted to `PASS`. Conversation statements are not evidence.

## Current v0.2.0 release-candidate validation

- [`2026-08-13-desktop-ux-onboarding-refinement.md`](2026-08-13-desktop-ux-onboarding-refinement.md) — empty-first onboarding, native read-only repository inspection, typography/theme/motion/responsive refinement, and explicit guided-demo separation.
- [`FINAL_MEDIA_CAPTURE_REPORT.v2.json`](FINAL_MEDIA_CAPTURE_REPORT.v2.json) — current 1440×900 presentation media, social preview, source closure, privacy scan, and checksums.
- [`FINAL_MEDIA_CAPTURE_REPORT.v3.json`](FINAL_MEDIA_CAPTURE_REPORT.v3.json) — append-only security successor for the two recaptured onboarding/repository assets and the production presentation-query gate.
- [`FINAL_MEDIA_CAPTURE_REPORT.v4.json`](FINAL_MEDIA_CAPTURE_REPORT.v4.json) — append-only media successor for repository-reported, untrusted HEAD wording and the privacy-safe aggregate projection.
- [`WINDOWS_PACKAGING_RELEASE_QA_REPORT.v4.json`](WINDOWS_PACKAGING_RELEASE_QA_REPORT.v4.json) — final exact no-Git-process Windows build, privacy-remapped binaries, MSI/NSIS lifecycle, malicious-filter non-execution, SBOM and license evidence. v2/v3 remain superseded historical evidence and their binary hashes must not be published.

## Current Windows reference-hardware QA state

W1 is `PASS_WITH_EXPLICIT_NONBLOCKING_ACCESSIBILITY_LIMITATION`. The canonical
scope decision is
[`WINDOWS_REFERENCE_HARDWARE_QA_SCOPE_AMENDMENT.v1.json`](WINDOWS_REFERENCE_HARDWARE_QA_SCOPE_AMENDMENT.v1.json),
based on the unchanged
[`WINDOWS_REFERENCE_HARDWARE_QA_REPORT.v6.json`](WINDOWS_REFERENCE_HARDWARE_QA_REPORT.v6.json).
Human-observed Narrator spoken output remains
`DEFERRED_NONBLOCKING_PUBLIC_RELEASE_ACCESSIBILITY_QA`; it is not claimed as
PASS. W2 `FINAL_MEDIA_CAPTURE` is `PASS`; the canonical W2 record is
[`FINAL_MEDIA_CAPTURE_REPORT.v1.json`](FINAL_MEDIA_CAPTURE_REPORT.v1.json).
W3 `WINDOWS_PACKAGING_RELEASE_QA` is `PASS_WITH_RELEASE_BLOCKERS`; the canonical
record is [`WINDOWS_PACKAGING_RELEASE_QA_REPORT.v1.json`](WINDOWS_PACKAGING_RELEASE_QA_REPORT.v1.json).
W4 local publication-readiness engineering is complete. The owner selected
Apache-2.0, all ten distributed package-text gaps are authoritatively closed,
and the source plus unsigned Windows v0.1.0 release are publicly published.
Trusted signing credentials are unavailable, so signing is deferred future
hardening. Narrator spoken output remains deferred without a certification
claim. Historical v1 reports remain immutable; v2 publication records and the
append-only public-release report carry the release closure.

## Final completion evidence

- [`PUBLIC_RELEASE_v0.1.0_REPORT.v1.json`](PUBLIC_RELEASE_v0.1.0_REPORT.v1.json)
- [`FINAL_APACHE_PUBLICATION_CLOSURE_REPORT.v1.json`](FINAL_APACHE_PUBLICATION_CLOSURE_REPORT.v1.json)
- [`FINAL_PROJECT_STATE.v2.json`](FINAL_PROJECT_STATE.v2.json)
- [`GITHUB_OWNER_CORRECTION.v1.json`](GITHUB_OWNER_CORRECTION.v1.json)
- [`GITHUB_PUBLICATION_READINESS_REPORT.v1.json`](GITHUB_PUBLICATION_READINESS_REPORT.v1.json)
- [`FINAL_PROJECT_COMPLETION_REPORT.v1.json`](FINAL_PROJECT_COMPLETION_REPORT.v1.json)
- [`FINAL_PROJECT_STATE.v1.json`](FINAL_PROJECT_STATE.v1.json)
- [`FINAL_PUBLICATION_VALIDATION.v1.json`](FINAL_PUBLICATION_VALIDATION.v1.json)
- [`THIRD_PARTY_LICENSE_AUDIT.v1.json`](THIRD_PARTY_LICENSE_AUDIT.v1.json)
- [`RELEASE_ARTIFACT_POLICY.v1.json`](RELEASE_ARTIFACT_POLICY.v1.json)
- [`FINAL_GIT_AUDIT.v1.json`](FINAL_GIT_AUDIT.v1.json)
- [`FINAL_COMMIT_MANIFEST.v1.json`](FINAL_COMMIT_MANIFEST.v1.json)
- [`ROOT_LICENSE_DECISION_REQUIRED.md`](ROOT_LICENSE_DECISION_REQUIRED.md)
