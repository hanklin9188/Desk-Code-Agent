# Logical Agents

Desk Code Agent v2 使用五個 logical agents，共用一份 Qwen3.5-4B model backend：

```text
Orchestrator
├── Repo Analyst
├── Coder
├── Reviewer
└── Reporter
```

`Deterministic Verification Runtime`、`RepoIntelligence`、`ToolRuntime`、`PolicyEngine`與`Telemetry`不是 Agents，因為它們不以 LLM 自主選擇下一步。

## Why five

- 足以隔離 planning、analysis、mutation、review與report context。
- 不把每個 function 包成 Agent，避免 agent soup、成本與錯誤傳播。
- Reviewer 的 Spec/Standards axes是兩次隔離 invocation，不載入第二個模型。
- 完整 repo report可 logical parallel planning，但在單張GPU預設 sequential execution。

## Shared backend invariant

```text
Qwen3.5-4B weights × 1
      ↑
vLLM loopback service
      ↑
role-specific requests
```

Agent數量影響 LLM call count與latency，不乘上model weight VRAM。Runtime須監控 calls、prefill、generation、peak VRAM與queue time。
