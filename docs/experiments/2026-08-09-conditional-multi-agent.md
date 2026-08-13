# Conditional multi-agent report — 2026-08-09

E5 single agent: 318/324, 179.5 median tokens, 363.53 ms. E6 conditional specialist: 315/324, 181 median tokens, p95 450, mean calls 1.194. E7 was equivalent at 315/324.

E6/E7 added 126 structured handoffs across both configurations. Required handoff fields were preserved (measured serialization loss 0), but outcome quality still regressed by -0.93 pp. There were zero regression detections, three false rejects, and three false approvals per conditional configuration. Handoff loss is therefore not the remaining root cause; a second pass by the same 4B model changed correct answers without adding independent capability.

Production policy: single agent only. Candidate triggers (failed patch + low confidence/conflicting evidence, explicit architecture decomposition, explicit independent comparison) are logged but suppressed. Specialist execution requires an explicit experiment flag or user request and remains EXPERIMENTAL until a task-specific paired suite shows positive value.
