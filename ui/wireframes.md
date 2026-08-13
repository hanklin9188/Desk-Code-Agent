# Desk Code Agent Wireframes

## Home

```text
┌────────────────────────────────────────────────────────────────────┐
│ Desk Code Agent                                      Local • Ready │
│                                                                    │
│  Open a repository                                                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ D:\projects\my-app                              Browse       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  or Git URL (network approval shown before clone)                   │
│                                                                    │
│  Recent                                                            │
│  my-app · main · 2 hours ago          Analyze / Fix / Continue      │
└────────────────────────────────────────────────────────────────────┘
```

## Run builder

```text
┌ Repository ─────────────┬ Task ────────────────────────────────────┐
│ my-app                  │ Analyze this repo, rank the top five     │
│ main @ 1a2b3c           │ problems, and safely fix what is bounded │
├─────────────────────────┼──────────────────────────────────────────┤
│ Mode preview: MIXED     │ Scope: L2 · expected 4–8 relevant files │
│ Local only: ✓           │ Mutation: worktree · GitHub: off         │
│ Model: Quality BF16     │ [Review Contract]             [Run]      │
└─────────────────────────┴──────────────────────────────────────────┘
```

## Live workspace

```text
┌ Repo ────────────┬ Workspace: Agent Flow ──────────────┬ Inspector ───────┐
│ src/             │             Orchestrator ◉          │ Current           │
│ tests/           │                    │                 │ R08 Evidence      │
│ docs/            │          ┌─────────┴────────┐        │ 6 items · 4.8K   │
│                  │          ↓                  ↓        │                   │
│ Symbols          │     Repo Analyst ◉       Coder ○    │ Evidence          │
│ Findings         │          │                  │        │ parser.ts:41–78   │
│ Tests            │        Tool ●────────────→ │        │ test_parser:12–44 │
│                  │                              │        │                   │
│                  │        Verify ○ → Review ○  │        │ Budget 3/8 calls  │
├──────────────────┴──────────────────────────────┴───────────────────┤
│ Analyzing parser path…                           Stop               │
└─────────────────────────────────────────────────────────────────────┘
```

## Diff + verification

```text
┌ Diff: parser.ts ─────────────────────────────┬ Verification ──────────────┐
│ - return config.value                       │ ✓ Syntax                    │
│ + return config?.value ?? defaultValue      │ ✓ Targeted 8/8             │
│                                             │ ✓ Related 42/42            │
│ Reason: R18 hypothesis H2                   │ … Full 214/486             │
│ Requirement: SC-2                           │ ○ Lint                      │
│ Evidence: E17, E21                          │ ○ Review                    │
├─────────────────────────────────────────────┴─────────────────────────────┤
│ [Revert patch]                         GitHub actions remain disabled     │
└───────────────────────────────────────────────────────────────────────────┘
```

## Approval

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ Ready to create draft PR                                                  │
│ Target: hanklin91888/Desk-Code-Agent · branch milestone/m5-bounded-code   │
│ Commit: 4 files, +231/−38 · artifact hash a81f… · reversible before merge │
│ [Review details]                         [Deny] [Approve once]             │
└───────────────────────────────────────────────────────────────────────────┘
```
