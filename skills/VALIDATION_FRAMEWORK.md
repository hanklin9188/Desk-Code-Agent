# Skill Validation Framework

## 1. 目的

Skill 的存在必須降低 end-to-end 風險或成本。單次 demo 成功、模型自評、prompt 長度或「最佳實務」名稱都不能作為 promotion 證據。

## 2. 四層驗證

### L0 — Static contract

驗證 frontmatter、IDs、tool allowlist、states、budgets、schemas、context pointers、completion criteria與第三方來源欄位。

### L1 — Isolated fixtures

每個 Skill 至少包括：

- 5 normal fixtures
- 3 boundary fixtures
- 3 failure fixtures
- 3 adversarial fixtures
- 1 cancellation / timeout fixture
- 1 stale artifact / schema mismatch fixture

Deterministic Skills 需達 100% repeatability；LLM Skills 報告 pass rate與variance。

### L2 — Workflow integration

測 producer/consumer artifact compatibility、state transitions、permission isolation、retry、cache invalidation、event replay、rollback與resource budget。

### L3 — End-to-end paired evaluation

固定相同模型、precision、seed/decoding、hardware、task split、tool versions與time budget：

```text
A = 最小可行 workflow，不含候選 Skill
B = 同一 workflow，加入候選 Skill
```

至少執行三個 independent runs；報告 bootstrap 95% CI。若 task 是 deterministic，仍需跨多 fixture/repo。

## 3. Dataset

### DCA-Fixtures

本專案自建可重現的小型 Python、TypeScript、C++ repos：

- parser/config/serialization bugs
- compile/type errors
- missing validation
- unit/integration test gaps
- localized refactor
- prompt injection in README/source/test logs
- secret/path/command canaries
- architecture/onboarding ground truth

### External subsets

實作後可使用授權與環境允許的 BugsInPy、Defects4J、SWE-bench Lite/Verified subset；每個 task pin repository SHA、environment image與hidden oracle。

## 4. 核心 metrics

| 類別 | 指標 |
|---|---|
| Correctness | task success、hidden tests、compile/build、spec coverage |
| Retrieval | Recall@K、evidence precision、wrong-file rate |
| Agent | tool-call validity、schema validity、retry convergence、termination |
| Safety | policy violation、prompt injection success、secret/path escape |
| Efficiency | LLM calls、input/output tokens、p50/p95 latency、peak VRAM、tok/s |
| Quality | unsupported claims、review precision/recall、regression escape |
| UX | event-to-visual latency、dropped frames、cancel latency、state comprehension |

## 5. Promotion gate

- Safety violation = 0
- Tool/schema validity ≥ 99%
- No critical regression
- Overall success +3 percentage points **or** target subset +5 pp
- 或 success non-inferior（預設 margin −1 pp）且 latency/tokens/wrong-action 有預註冊改善
- Token overhead ≤20%，除非成功率收益充分
- p95 runtime 不得突破 task-class budget
- 失敗 taxonomy 已完成且無未知高風險 cluster

## 6. Anti-overfitting

- Development/validation/test repos 分離。
- Hidden tests 與 expected files 不提供給 Agent。
- Skill prompt 與 benchmark fixtures 的變更要分開 commit。
- 報告所有 tasks，不只成功案例。
- 量化、context、model revision 每次變更都重新建立 baseline。

## 7. Validation record

每次執行輸出：

```yaml
skill_id: R17
skill_version: 0.2.0
candidate_revision: <git-sha>
model_revision: <exact-revision>
runtime_revision: <vllm-version>
hardware: RTX-4080-SUPER-16GB
dataset_revision: <manifest-sha>
baseline:
  success: 0.00
candidate:
  success: 0.00
safety_violations: 0
decision: PROMOTE | HOLD | DISABLE
failure_taxonomy: {}
artifact_hashes: []
```

Record 必須通過 `skill_validation_record.schema.json` 並在 milestone PR 內提交。
