# Desk Code Agent — Evaluation Protocol

> Version: `0.1.0-design`  
> Status: Implementation-ready specification  
> Canonical source: [`../DESK_CODE_AGENT_MASTER_DESIGN.md`](../DESK_CODE_AGENT_MASTER_DESIGN.md)

## 文件用途

定義 benchmark、metrics、ablation、skill paired evaluation 與產品 acceptance gates。

---

# Part VIII — Evaluation

## 31. 研究問題

- **RQ1**：Agentic scaffolding 是否提升固定 4B local model 的 repo-level task success？
- **RQ2**：Retrieval、verification、reviewer、multi-agent 中哪個貢獻最大？
- **RQ3**：同一模型容量下，multi-agent 是否優於 single-agent？
- **RQ4**：Skill 是否真的帶來 marginal improvement？
- **RQ5**：BF16、8-bit、4-bit 的 performance-quality-VRAM tradeoff 為何？
- **RQ6**：動畫化可觀察 UI 是否提升使用者對 agent 狀態與風險的理解？

---

## 32. Benchmark 組成

### 32.1 DCA-Fixtures

自行建立 60–100 個可快速重跑的 synthetic／small repo tasks：

- Python：parser、config、API、type errors。
- TypeScript：React state、validation、Vitest。
- C／C++：compile、memory ownership、CMake、unit test。
- 每題有 base commit、task、visible tests、hidden tests、expected scope。

### 32.2 BugsInPy

使用可重現的 Python 真實 bugs，測試 diagnosis、patch 與 regression。

### 32.3 SWE-bench 子集

使用 small／selected SWE-bench Verified subset 作為 advanced benchmark。完整 SWE-bench evaluation 資源需求高，因此不作為每次 CI gate，只作 milestone benchmark。

### 32.4 Defects4J／C++ benchmark

作為 v1 之後的多語言擴充；先完成 Python／TypeScript／C++ 自有 suite。

### 32.5 Repo Report Benchmark

建立 `RepoReport-20`：

- 20 個不同規模 open-source repos。
- 人工建立 entry point、main modules、build/test command ground truth。
- 驗證 report evidence precision、coverage、hallucination rate。

---

## 33. 核心 Metrics

### Coding

- Task Success Rate。
- Hidden Test Pass Rate。
- Compile Pass Rate。
- First-attempt success。
- Retry count。
- Patch locality。
- Wrong-file edit rate。
- Regression rate。

### Retrieval

- Relevant file Recall@K。
- Relevant symbol Recall@K。
- Context precision。
- Evidence coverage。

### Agent／Skill

- Tool-call schema validity。
- Invalid transition rate。
- Skill marginal gain。
- Unnecessary agent call rate。
- Reviewer false approve／false reject。

### Systems

- End-to-end latency p50／p95。
- Time-to-first-token。
- Input／output tokens。
- LLM calls。
- Tool calls。
- Peak VRAM／RAM。
- GPU utilization。
- Test time。

### UI

- Frame time p95。
- Input latency。
- Dropped animation frames。
- Reduced-motion compliance。
- Keyboard coverage。
- Accessibility violations。

---

## 34. Ablation Matrix

固定同一 Qwen3.5-4B：

| ID | Configuration |
|---|---|
| A | Direct prompt only |
| B | Single agent + file tools |
| C | B + repo retrieval |
| D | C + context builder |
| E | D + deterministic verification loop |
| F | E + reviewer |
| G | F + role-separated multi-agent |
| H | G + admitted skills |

另外測：

- Full context accumulation vs isolated context。
- Free shell vs constrained tools。
- No feasibility gate vs bounded execution。
- BF16 vs validated low-precision profiles。

---

## 35. Product Acceptance Gates

### G0 — Safety Foundation

- No arbitrary shell。
- No write outside worktree。
- No secret in logs。
- Invalid GitHub push without approval = 0。

### G1 — Repo Intelligence

- File tree／manifest 正確。
- Retrieval Recall@10 ≥ 85% on internal fixture。
- Symbol index handles supported languages。

### G2 — Analysis MVP

- Architecture／onboarding report evidence precision ≥ 90%。
- Hallucinated file path rate = 0。
- Export Markdown／JSON 成功。

### G3 — Coding MVP

- L1 fixture task success ≥ 75%。
- Wrong-file edit rate ≤ 5%。
- All accepted patches pass required verification。

### G4 — Multi-Agent／Skill

- Multi-agent 相對 best single-agent baseline有可測 improvement，否則保持 single-agent default。
- 每個 production skill 通過 admission gate。

### G5 — UI Release

- 60 FPS target on reference machine。
- Reduced motion、keyboard、screen scaling 通過。
- No UI freeze during inference／test。

---
