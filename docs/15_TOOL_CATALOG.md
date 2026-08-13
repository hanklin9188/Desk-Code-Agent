# Tool Catalog and Contract Rules

## Design rule

Tools are narrow, typed, auditable capabilities. The LLM never receives a generic unrestricted terminal. Every call is validated against role permission, task state, worktree path, argument schema, resource budget and approval policy.

## Read-only repository tools

| Tool | Purpose | Key guards |
|---|---|---|
| `list_tree` | Filtered repository tree | ignore vendor/generated/binary |
| `search_text` | Lexical search | bounded results and bytes |
| `search_symbol` | Symbol query | indexed languages only |
| `find_definition` | Definition lookup | exact source range |
| `find_references` | Reference lookup | bounded graph depth |
| `find_tests` | Source-to-test candidates | evidence scores |
| `read_file_range` | Exact code slice | path confinement, max lines/tokens |
| `dependency_graph` | Module/package edges | evidence-backed edges only |
| `read_diff` | Current worktree diff | no hidden source mutation |

## Mutation tools

| Tool | Purpose | Key guards |
|---|---|---|
| `apply_patch` | Apply structured diff | approved plan, allowlisted paths, line/change budget |
| `revert_attempt` | Roll back current attempt | task worktree only |
| `create_test_file` | Add a planned test | test roots only, approved plan |

Mutation tool output always includes before/after hash, changed paths, changed line count, artifact ID and policy checks.

## Runtime execution tools

- `run_syntax_check`
- `run_targeted_tests`
- `run_related_tests`
- `run_full_tests`
- `run_linter`
- `run_type_check`
- `run_build`
- `run_static_security_scan`

These are selected by deterministic verification policy. The model may request a stage but cannot forge or override its result.

## Git/GitHub tools

Clone/fetch/worktree/status/diff are runtime capabilities. Commit/push/tag/release require human approval and `github_publish_request.schema.json`. The allowed remote for milestone publication is exactly `https://github.com/hanklin9188/Desk-Code-Agent` after the user confirms repository creation and visibility.

## Tool failure semantics

Every tool returns one of `OK`, `INVALID_ARGUMENT`, `BLOCKED_POLICY`, `NEED_APPROVAL`, `TIMEOUT`, `RESOURCE_LIMIT`, `EXECUTION_FAILED`, `CANCELLED`. Natural-language success is never accepted as a substitute for a typed result.
