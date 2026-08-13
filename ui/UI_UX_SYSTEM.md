# Desk Code Agent UI/UX System

## Product experience

Desk Code Agent 不是「側欄 + chatbot」。它是本地 software-engineering workspace，讓使用者在同一空間完成：

```text
Open Repository → Understand → Ask/Plan → Observe Agents → Inspect Evidence
→ Review Diff → Verify Tests → Approve/Reject → Read Report → Checkpoint
```

設計語言：

\[
	extbf{Calm + Spatial + Observable + Reversible}
\]

- **Calm**：長時間工作不疲勞；動畫只承擔狀態與因果。
- **Spatial**：Repository、Agent Flow、Evidence、Diff與Verification有穩定位置。
- **Observable**：每個動作顯示真實 state、tool、evidence、cost與結果。
- **Reversible**：mutation總能看見 target、diff、rollback與approval。

## Shell

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Repo / Branch / SHA          Local Qwen · Ready       VRAM · tok/s · Queue │
├────────────────┬──────────────────────────────────────┬────────────────────┤
│ Repository     │ Workspace                            │ Inspector          │
│                │                                      │                    │
│ files/symbols  │ Overview | Architecture | Flow       │ Evidence           │
│ tests/findings │ Code | Diff | Verify | Report        │ Tool calls         │
│                │                                      │ Permissions        │
│                │                                      │ Telemetry          │
├────────────────┴──────────────────────────────────────┴────────────────────┤
│ Task composer · mode preview · privacy state              Run / Stop       │
└────────────────────────────────────────────────────────────────────────────┘
```

## Primary views

1. **Home / Open Repository**
2. **Local Model Setup**
3. **Repository Overview**
4. **Architecture Map**
5. **Agent Flow**
6. **Code Explorer**
7. **Diff Review**
8. **Verification**
9. **Findings**
10. **Report**
11. **Run History / Replay**
12. **Telemetry**
13. **Settings / Privacy / Model Profiles**

## Progressive disclosure

- 第一層只顯示：current stage、summary、required user action。
- 第二層顯示：Agent/Skill/Tool、evidence與cost。
- 第三層顯示：raw logs、schema、trace、model/runtime details。
- 任何 error先顯示「發生什麼、影響什麼、下一步」，不先傾倒 log。
- 完成報告預設突出 verified outcomes與NOT_RUN，而非模型思考文字。

## Trust affordances

- 永遠顯示 `Local`／`Network used`／`Cloud off`。
- Mutation 前顯示 worktree、files、estimated lines、test plan。
- GitHub action 顯示 exact owner/repo/branch/action。
- PASS badge只來自 verification artifact。
- Model claim顯示 evidence link與confidence。
- Approval dialog不使用暗黑模式誘導；`Deny/Cancel`同樣可見。

## Productization dashboard extension

The productization phase adds five evidence-oriented surfaces without replacing
the engineering workspace:

1. **Dashboard** — frozen product state, benchmark highlights, and measured runtime cards.
2. **Capabilities** — task-class admission matrix and explicit limitations.
3. **Experiments** — sealed timeline, comparisons, failure analysis, and paired observability.
4. **Workspace** — repository-to-evidence-to-verification task journey.
5. **Safety** — deterministic gates, rollback, privacy, and the mutation lock.

These surfaces use the master-design dark tokens (`#0C1016` canvas family,
low-elevation panels, cool blue active state, restrained green/amber/red status)
and a shared chart card system. Historical benchmark values are labeled as
sealed evidence and never appear as live runtime telemetry. `DISABLED` and
`REPORT_ONLY` remain first-class visual states rather than hidden fine print.
