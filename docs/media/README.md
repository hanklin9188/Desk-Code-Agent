# Portfolio Media

This directory defines the stable media contract for Desk Code Agent. Generated screenshots and animations must come from the deterministic URLs in [`CAPTURE_MANIFEST.json`](CAPTURE_MANIFEST.json), not from live inference or a newly run benchmark.

## Layout

- `readme/` — lightweight hand-authored README cover media.
- `screenshots/` — five canonical 1440×900 captures.
- `gifs/` — three short deterministic interaction captures.
- `video/` — portfolio-video storyboard and eventual edit notes.
- `social/` — local 1280×640 GitHub social-preview source and rendered PNG.
- [`CAPTURE_INSTRUCTIONS.md`](CAPTURE_INSTRUCTIONS.md) — exact setup and capture checks.
- [`VISUAL_REGRESSION_MATRIX.md`](VISUAL_REGRESSION_MATRIX.md) — viewport/scaling readiness.

Large source recordings, editor caches, and uncompressed intermediates should remain outside Git. Only optimized final media should be considered for a future approved commit.

Final binary-capture status is `PASS_FINAL_MEDIA_CAPTURE`: five canonical PNGs
and three deterministic GIFs were captured with the existing Windows Edge and
local GIF encoder, validated, and sealed in [`CAPTURE_MANIFEST.json`](CAPTURE_MANIFEST.json).
No model or benchmark call was made.

The final local social preview is
[`social/desk-code-agent-social-preview.png`](social/desk-code-agent-social-preview.png).
It passed the local aspect-ratio, claim, privacy, and hierarchy audit and has
not been uploaded.
