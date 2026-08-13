# Bounded Skill Architecture v2

## Two layers

Development Skills build the product; Runtime Skills power the product. They share validation mechanics but never share implicit authority.

```text
Development: D01–D11
    ↓ produces specs/code/tests/release artifacts
Product Runtime: R01–R28
    ↓ executes bounded repository tasks
```

## Why not import mattpocock/skills directly

- Their skills target general coding-agent sessions and human-controlled workflows.
- Desk Code Agent requires machine-readable artifacts, strict state, local 4B budgets, worktree isolation, untrusted repo defense, UI events and production promotion.
- Principles are selectively adapted, with MIT attribution, but runtime behavior is original and testable.
- Third-party source changes do not silently alter released behavior.

## Skill execution envelope

Every Skill has:

`Trigger + Preconditions + Input Schema + State Edges + Tool Allowlist + Budgets + Procedure + Completion Criteria + Events + Validation`

The runtime refuses any action outside that envelope.

## Router discipline

User asks for an outcome; the router selects a minimal workflow. The user does not manage individual Agents. The model does not create Agents or invent skills.

Examples:

```text
Explain symbol → R01 R02 R06/R07 R08 → answer/report
Full repo report → R01–R16 + R24
Bug fix → R01–R09 R17–R22 R24–R26 R28
Publish milestone → D11/R27 only after acceptance and approval
```
