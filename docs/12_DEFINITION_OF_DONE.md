# Desk Code Agent — Final Definition of Done

> Version: `0.1.0-design`  
> Status: Implementation-ready specification  
> Canonical source: [`../DESK_CODE_AGENT_MASTER_DESIGN.md`](../DESK_CODE_AGENT_MASTER_DESIGN.md)

## 文件用途

定義作品完成時應具備的功能、驗證、UX、效能、GitHub 與可重現性條件。

---

# Part XII — Final Definition of Done

## 48. 作品完整完成時應呈現

使用者貼入 Repository 或選擇本機資料夾：

1. UI 以流暢動畫完成 ingest 與 indexing。
2. Overview 顯示 repo purpose、language、entry points、build／test。
3. Architecture view 顯示 module graph。
4. 使用者輸入任務。
5. Agent Flow 清楚顯示 Orchestrator、Analyst／Coder、Tester service、Reviewer。
6. Evidence panel 顯示模型實際看過的 code 與 tools。
7. 修改只發生在 worktree。
8. Diff view 顯示 patch reason。
9. Tests view 顯示真實結果。
10. Reviewer 顯示 decision 與 remaining risk。
11. 使用者 Accept／Revert／Export／Commit／Push。
12. Task summary 顯示 LLM calls、tokens、latency、VRAM、files read／modified。
13. 每個 milestone 的 source、docs、tests 都同步至 `hanklin91888/Desk-Code-Agent`。

最終產品不是讓使用者感覺「在跟模型聊天」，而是：

> **把 Repository 放進一個可觀察的本機工程 Workspace，AI 以有界、可驗證的方式協助理解、分析、修改與驗收。**

---
