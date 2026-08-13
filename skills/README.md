# Desk Code Agent Skill System v2

本目錄定義 **39 個原創、受限、可驗證的 Skills**：

- **11 Development Skills (`D01–D11`)**：用來開發 Desk Code Agent 本身，將需求對齊、Spec、Prototype、TDD、診斷、Review、架構與 GitHub checkpoint 固化成可重複工程流程。
- **28 Runtime Skills (`R01–R28`)**：產品執行時實際使用，涵蓋 Task Contract、Repository Intelligence、分析、診斷、修改、驗證、Approval、Security、GitHub Delivery 與 Telemetry。

## 為什麼重做，而不是直接複製第三方 Skills

`mattpocock/skills` 提供了很成熟的工程 discipline：小型可組合 skills、shared language、spec synthesis、throwaway prototype、red-green、tight debugging loop、dual-axis review 與 deep modules。本專案選擇性吸收這些**原則**，但重新設計為：

1. 適合 `Qwen3.5-4B` 的小 tool surface 與短 context。
2. 有 machine-readable input/output schema。
3. 有明確 state machine、retry、LLM call、context 與 side-effect budget。
4. Repository 內容一律視為 untrusted data。
5. 所有 mutation 走 worktree、verification 與 approval。
6. 每個 Skill 都有 paired evaluation 與 production admission gate。
7. UI 可由 typed event 精確呈現，不靠解析模型自然語言。
8. GitHub action 綁定 `hanklin9188/Desk-Code-Agent` 與人工批准。

## Skill 不是 Agent

```text
Agent = role + model profile + allowed skills + local state + permissions
Skill = bounded reusable procedure + artifact contracts + validation
Tool  = deterministic external capability
Harness = workflow/state/security/context/verification/telemetry runtime
```

多個 logical agents 可共用同一份 local Qwen model。增加 Skill 或 Agent 不會增加 model weights，但會增加 inference calls，因此 router 必須只啟動完成任務所需的最小集合。

## Invocation

- `user`：只由人類或明確產品 action 啟動，避免常駐 context cost。
- `model`：Agent 在已允許 workflow 中可選用，但仍受 deterministic router與state machine限制。
- `runtime`：純 deterministic，不消耗 LLM call。

## Promotion lifecycle

```text
DRAFT → EXPERIMENTAL → CANDIDATE → PRODUCTION
                      ↘ DISABLED / DEPRECATED
```

Promotion 必須附 validation record、benchmark revision、model/runtime revision與failure taxonomy。Skill 名稱或 prompt 看起來合理，不構成有效性證據。
