# Architecture Decision Records — Initial Set

## ADR-001 — Single shared model, logical multi-agent

**Decision**：只常駐一份 Qwen3.5-4B，由 prompt、tools、context、state、permission 與 output schema 形成 Orchestrator、Analyst、Coder、Reviewer、Reporter。

**Why**：避免 VRAM 重複、降低部署複雜度，仍可驗證 role/context decomposition 是否有效。

**Rejected**：每個 Agent 各載一份模型；十幾個 Agent 互相對話。

## ADR-002 — Deterministic Tester

**Decision**：Tester 是 runtime service，不是 LLM Agent。

**Why**：pytest/compiler/linter/type-checker 才是 correctness oracle；LLM 只解讀結果。

## ADR-003 — Worktree-first mutation

**Decision**：所有修改在 isolated git worktree/branch 進行；原始工作目錄唯讀。

**Why**：支援 preview、rollback、diff、parallel task 與安全審批。

## ADR-004 — Repository as environment, not prompt

**Decision**：建立 file/symbol/test/dependency index，逐步 retrieve evidence；不把整份 repo 塞入 context。

**Why**：降低 attention dilution、prefill latency、context pollution 與 private data exposure。

## ADR-005 — Tauri desktop + Python services + WSL2 vLLM

**Decision**：Windows UI 使用 Tauri/React；Agent/Repo services 使用 Python；vLLM/Qwen 在 WSL2 GPU 環境提供 localhost model API。

**Why**：各層採成熟生態，UI 保持 native-feeling，模型 serving 與 Agent runtime 解耦。

## ADR-006 — Animate UI is copied and adapted, not treated as an opaque dependency

**Decision**：使用 Animate UI 的 copy-first component pattern，將選定元件複製到 internal UI package，統一 design token、motion token、a11y 與 testing；保留 MIT attribution。

**Why**：可完整控制動畫、效能與產品一致性，避免版本更新突然改變 UX。

## ADR-007 — Evidence before confidence

**Decision**：每個 finding、review issue 與 repair claim 都必須連到 evidence ID；無證據時只能標示 hypothesis。

## ADR-008 — GitHub sync is a release gate

**Decision**：M0–M10 每個 milestone 通過 checklist 後，必須同步至 `hanklin9188/Desk-Code-Agent`；未同步不能視為 milestone complete。

**Why**：避免作品只停留在本機，確保履歷展示、版本追蹤、CI 與可重現性。


## ADR-009 — Selective adaptation, not wholesale Skill import

**Decision**：只吸收 `mattpocock/skills` 的工程原則，重新寫成 D01–D11 / R01–R28 bounded Skills，保留 MIT attribution與source lock。

**Why**：Desk Code Agent需要local 4B budgets、artifact schemas、tool/state enforcement、security、UI events與paired evaluation。

## ADR-010 — Tight red signal before non-trivial patch

**Decision**：非平凡 debug必須先由R17建立已執行的red-capable loop，再進R18/R19/R20。

**Why**：避免小模型在未重現症狀前以第一個合理hypothesis直接修改。
