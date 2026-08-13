# Skill System v2

Desk Code Agent uses **39 bounded Skills**:

- 11 Development Skills build and govern the product.
- 28 Runtime Skills execute repository tasks.

A Skill is not a persona prompt. Its complete execution envelope is:

```text
Trigger + Precondition + Input/Output
+ Tools + State + Budgets + Procedure
+ Completion + Recovery + Events + Validation
```

## Development catalog

| ID | Name | Owner |
|---|---|---|
| D01 | Discovery and Domain Alignment | Product Lead / Orchestrator |
| D02 | Implementation Spec Synthesis | Product Lead / Architect |
| D03 | Decision Prototype | UX Lead / Architect |
| D04 | Implementation Orchestration | Engineering Lead |
| D05 | Red-Green Verification | Engineer / Verification Lead |
| D06 | Disciplined Diagnosis | Debug Lead |
| D07 | Dual-Axis Review | Review Lead |
| D08 | Deep Module and Tool Surface Design | Architect |
| D09 | Agent Document Authoring | Agent Platform Lead |
| D10 | Architecture Deepening Survey | Architect / Repo Analyst |
| D11 | Milestone Handoff and GitHub Checkpoint | Release Lead |

## Runtime catalog

| ID | Name | Owner |
|---|---|---|
| R01 | Task Contract | Orchestrator |
| R02 | Deterministic Task Routing | Orchestrator |
| R03 | Bounded Subtask Planning | Orchestrator |
| R04 | Feasibility Gate | Orchestrator |
| R05 | Workspace Acquisition | Orchestrator |
| R06 | Repository Fingerprint | Repo Analyst |
| R07 | Codebase Map | Repo Analyst |
| R08 | Evidence Retrieval | Repo Analyst |
| R09 | Context Budget and Packaging | Orchestrator |
| R10 | Repository Overview | Repo Analyst |
| R11 | Architecture Analysis | Repo Analyst |
| R12 | Code Quality Analysis | Repo Analyst |
| R13 | Testing Analysis | Repo Analyst |
| R14 | Security and Risk Analysis | Repo Analyst |
| R15 | Performance Hypothesis Analysis | Repo Analyst |
| R16 | Onboarding Synthesis | Reporter |
| R17 | Bug Reproduction Loop | Coder |
| R18 | Diagnosis Hypotheses | Coder |
| R19 | Patch Planning | Coder |
| R20 | Patch Generation | Coder |
| R21 | Deterministic Verification | Runtime |
| R22 | Dual-Axis Semantic Review | Reviewer |
| R23 | Documentation Update | Coder / Reporter |
| R24 | Report Synthesis | Reporter |
| R25 | Approval and Rollback | Orchestrator |
| R26 | Untrusted Content Defense | Runtime Security |
| R27 | GitHub Delivery | Release Lead |
| R28 | Telemetry and Trace | Runtime |

## Third-party adaptation

Engineering principles from `mattpocock/skills` are selectively adapted. The production Skills are original bounded implementations with schemas, local-model budgets, state enforcement, security and paired evaluation. See `skills/ADAPTATION_MATRIX.md`.

## Validation

See `skills/VALIDATION_FRAMEWORK.md`. No Skill enters production routing without static, fixture, integration, adversarial and paired end-to-end evidence.
