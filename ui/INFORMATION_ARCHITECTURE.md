# Information Architecture and Navigation

## Global navigation

| Area | Purpose | Default shortcut |
|---|---|---|
| Repository | Files, symbols, tests, findings | `Ctrl+1` |
| Overview | Purpose, tech, commands, reading order | `Ctrl+2` |
| Architecture | Module graph and execution paths | `Ctrl+3` |
| Flow | Live Agent/Skill/Tool graph | `Ctrl+4` |
| Code | Source and evidence ranges | `Ctrl+5` |
| Diff | Proposed/verified changes | `Ctrl+6` |
| Verify | Test/build/static stages | `Ctrl+7` |
| Report | Final artifact | `Ctrl+8` |
| History | Runs and replay | `Ctrl+9` |

## Layout behavior

- Desktop ≥1440px：三欄，Repository 260–320px、Inspector 320–420px。
- 1024–1439px：Inspector使用 Sheet；Repository可收合。
- <1024px 不是 primary target，但維持 keyboard/accessibility；不承諾完整 graph editing。
- Split panes保存 per-repo layout。
- Center workspace只有一個主要 scroll container，避免 nested scroll trap。

## Task composer

Task composer不是聊天記錄，而是 Run builder：

- Repository target
- Natural-language task
- Parsed Task Contract preview
- Mutation/network/GitHub toggles
- Mode and estimated scope
- Quality/Balanced/Compact model profile
- Run / Stop / Save as template

多輪澄清以 contract revisions呈現，不以無限 chat bubbles累積。

## Inspector

根據 selection 顯示：

- Node：module metrics, files, tests, findings
- Evidence：source range, hash, retrieved by, confidence
- Agent：role, Skill, state, budget
- Tool：arguments summary, duration, result
- Diff：reason, requirement, tests, review
- Verification：command ID, environment, logs
- Approval：impact, exact hash, reversibility
