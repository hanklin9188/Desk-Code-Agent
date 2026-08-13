# UI Motion and Experience QA

## Source and consistency

- [ ] Every Animate UI-derived component has upstream URL/commit/path/license/local modifications.
- [ ] Components live in internal package and use Desk tokens.
- [ ] No uncontrolled local duration/easing/color values.
- [ ] No decorative backgrounds/loops in normal workspace.
- [ ] UI behavior remains functional if all motion is disabled.

## Event correctness

- [ ] Only typed runtime events trigger status animations.
- [ ] Replay yields identical final UI projection.
- [ ] Duplicate/out-of-order/reconnect events are idempotent.
- [ ] Cancel stops stale active indicators.
- [ ] Retry displays new evidence/reason.
- [ ] PASS/FAIL/NOT_RUN exactly match artifact.

## Performance

- [ ] Event-to-visual p95 <100ms.
- [ ] Normal motion frame p95 ≤16.7ms target on reference.
- [ ] ≤3 continuous animations.
- [ ] Tree/log/test/diff lists virtualized.
- [ ] Monaco owns large code DOM.
- [ ] Telemetry updates ≤4Hz.
- [ ] Long-run memory stable.
- [ ] Window hidden pauses ambient motion.

## Accessibility

- [ ] MotionConfig/user reduced-motion at app root.
- [ ] Keyboard-only full workflow.
- [ ] Focus returns logically after Sheet/Dialog.
- [ ] Status not color/motion-only.
- [ ] Graph has accessible list alternative.
- [ ] NVDA smoke, 200% zoom, high contrast.
- [ ] Approval text is read before action buttons.
- [ ] ARIA live region not flooded.

## Trust

- [ ] Local/network/cloud provenance visible.
- [ ] Agent/Skill/Tool/Evidence current state visible.
- [ ] Patch accept is distinct from commit/push approval.
- [ ] Exact owner/repo/branch/hash shown for GitHub.
- [ ] Report-only vs modified status distinct.
