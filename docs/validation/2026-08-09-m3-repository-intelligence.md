# M3 Repository Intelligence validation — 2026-08-09

## Result

`PASS` for the bounded TypeScript/TSX/Python repository-intelligence scope.
Unsupported language semantics remain explicit lexical/unresolved evidence and
are not fabricated as resolved dependency edges.

## Implemented contract

- Git worktree acquisition pins an immutable baseline and preserves the source tree.
- Git-native tracked/untracked enumeration honors repository ignore rules and rejects symbolic-link indexing.
- Tree-sitter indexes TypeScript, TSX, JavaScript and Python definitions/references.
- File dependencies distinguish `SYNTACTIC`, `INFERRED`, and `UNRESOLVED` edges.
- Forward/reverse dependencies and source/test affinity are queryable through the deep module.
- Persistent SQLite indexes reuse unchanged files, reparse changed files, invalidate deleted files, and reuse content-identical renames.
- Index format and workspace-root metadata invalidate incompatible caches.
- Evidence invalidation removes missing or hash-stale source ranges transactionally.
- Context packaging keeps policy/contract trusted, repository evidence untrusted, deduplicated and under a hard token cap.

## Executable evidence

Commands:

```text
npx vitest run tests/workspace-index.test.ts tests/repo-intelligence.test.ts
npm run typecheck
npm run benchmark:m3
```

Results:

- 2 test files / 7 tests: PASS.
- TypeScript project references: PASS.
- Final immutable run: `docs/experiments/runs/m3-incremental-2026-08-09T00-33-03-613Z/result.json`.
- Result SHA-256: `2fd31294a828ca5bae63cf9d851d17dce4eb0ecf099be24924722355825cfd1b`.

## Measured final run

| Metric | Value |
|---|---:|
| Cold index, 5 files | 14.332 ms |
| Unchanged index | 8.271 ms |
| Unchanged cache hit ratio | 1.00 |
| Single-file edit | 1 reparsed / 4 reused |
| Multi-file edit | 2 reparsed / 3 reused |
| Content-identical rename | 0 reparsed / 1 rename |
| Deletion | 1 invalidated |
| Generated/ignored file | 0 indexed, cache hit 1.00 |
| Final symbols / references / dependencies | 4 / 8 / 3 |
| Stale evidence invalidation | 1 / 1 |
| Post-mutation retrieval Recall@K | 4 / 4 = 1.00 |
| Peak benchmark process RSS | 99.4 MiB |

The earlier immutable run `m3-incremental-2026-08-09T00-31-16-355Z`
remains preserved as `FAIL` (Recall@K 0.75). It exposed missing
`variable_declarator` definitions; the regression was fixed and both later runs
passed. No failed evidence was overwritten.

## Dual-axis review

Spec: all requested mutation classes execute against a real temporary Git
repository; graph types and stale evidence have machine assertions.

Standards: paths remain workspace-bounded, ignored/symlink content is excluded,
cache identity is versioned, SQLite updates are transactional, and unresolved
imports remain explicitly unresolved. No model inference participates in index truth.
