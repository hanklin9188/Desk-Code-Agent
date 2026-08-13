# Information Architecture and Navigation

## Global navigation

| Area | Purpose | Default shortcut |
|---|---|---|
| Start | Empty-first repository onboarding and guided demo | `Ctrl+1` |
| Repository | Repository-reported HEAD metadata and bounded file manifest | `Ctrl+2` |
| Workspace | Task stages and inspectable activity | `Ctrl+3` |
| Changes | Proposed changes and their evidence | `Ctrl+4` |
| Verify | Test/build/static stages | `Ctrl+5` |
| Report | Evidence-backed outcome | `Ctrl+6` |
| Research | Frozen capability and experiment archive | `Ctrl+7` |
| History | Runs and replay | `Ctrl+8` |

Task-specific destinations are disabled until an actual compatible runtime or the explicitly labelled guided demo is active. Research remains a separate archive and does not imply live repository activity.

## Layout behavior

- Desktop ≥1200px：76px 導覽 rail、Repository 約 270px、Inspector 約 330px。
- 980–1199px：Inspector使用 overlay Sheet；Repository可收合。
- <980px 維持 keyboard/accessibility、中央捲動與可開啟 panels；複雜 graph 不是 primary editing target。
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

未選 repository 時，composer 明確顯示下一步且 Run 停用。唯讀 repository 已連線但 task runtime 尚未連線時，Run 仍停用並解釋原因。只有 explicit guided demo 可以 replay deterministic fixture events；它不能成為真實 repository state。

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
