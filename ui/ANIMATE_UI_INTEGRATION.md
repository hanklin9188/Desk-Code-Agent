# Animate UI Integration Plan

## Source model

Animate UI 是 copy-first/open-code component distribution。Desk Code Agent 不在 runtime 依賴遠端服務，也不把第三方 visual defaults直接當 design system。選定元件會複製到：

```text
apps/desktop/src/components/animate-internal/
```

每個元件需包含：

```text
SOURCE.md
- upstream URL
- upstream repository commit
- component path
- license
- copied date
- local modifications
- validation status
```

## Selected components

| Desk Code Agent use | Animate UI reference | Adaptation |
|---|---|---|
| Repository navigation | Sidebar | 更低 motion、virtualized file tree、persistent widths |
| File/symbol tree | Files | 綁定 RepoIntelligence nodes，不以 animation延遲大資料 rendering |
| Workspace modes | Tabs | 使用 shared indicator；支援 keyboard與URL/state persistence |
| Context inspector | Sheet / Popover / Hover Card | 長內容使用 Sheet，短 evidence preview用 Hover Card |
| Task/test completion | Progress | 只反映真實 stages，不產生 fake percent |
| Code/commands | Code / Code Tabs | 用於 commands/snippets；大型 source/diff交 Monaco |
| Approvals | Alert Dialog + Management Bar | 顯示 exact action/hash；approval bar固定但不遮 diff |
| Run updates | Notification List | 只顯示重大 transition；高頻 events在 Flow/Trace，不做 toast storm |
| Help/evidence metadata | Tooltip | 不承載完成任務所需的唯一資訊 |
| Settings | Switch / Radio / Toggle | local/cloud、reduced motion、model profiles |
| Status details | Accordion | report/finding詳情，避免一次展開過多內容 |

## Components intentionally excluded

- Fireworks、gravity/stars/bubble backgrounds：與 calm workspace不符。
- Liquid/ripple-heavy primary actions：可能干擾精確 approval。
- Auto-playing carousel/radial navigation：降低可預測性。
- 高頻 animated icons：只保留狀態必要微動畫。

## Integration workflow

1. D03 建立 3 個 prototype variants。
2. Pin upstream commit and license。
3. Manual copy into internal package；不依賴未審核自動更新。
4. Replace colors, spacing, radius, elevation and motion with Desk tokens。
5. Remove unused variants/dependencies。
6. Add Storybook/preview states：idle, hover, focus, active, disabled, loading, success, error, reduced motion。
7. Run keyboard, screen reader, reduced motion, high contrast, 125/150/200% zoom。
8. Run frame/commit profiling under live event load。
9. D07 review source/license, spec and visual behavior。
10. Record component revision in source lock.

## Version compatibility

M1 implementation must verify current React, Tailwind and Motion requirements from official Animate UI troubleshooting docs; versions are pinned in lockfiles and CI rather than repeated as timeless prose here.
