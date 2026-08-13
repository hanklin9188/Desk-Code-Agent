# Desk Code Agent — Risk Register

> Version: `0.1.0-design`  
> Status: Implementation-ready specification  
> Canonical source: [`../DESK_CODE_AGENT_MASTER_DESIGN.md`](../DESK_CODE_AGENT_MASTER_DESIGN.md)

## 文件用途

列出模型、repo、工具、安全、效能、UI 與產品範圍風險，以及具體 mitigation。

---

# Part XI — Risk Register

## 47. 主要風險與對策

| Risk | 影響 | 對策 |
|---|---|---|
| 4B model reasoning ceiling | 複雜任務失敗 | bounded scope、retrieval、verification、report-only fallback |
| Multi-agent 增加 latency | UX 變慢 | dynamic routing、few agents、short contexts、selective thinking |
| Skill 無增益 | token 浪費、表現下降 | paired admission gate、version pin、deprecation |
| Repo prompt injection | 越權／資料外洩 | untrusted content labeling、tool policy、no arbitrary shell |
| Test suite 太慢 | 長任務等待 | targeted→related→full、cache、user-selectable verification |
| vLLM on Windows complexity | 安裝問題 | WSL2 health checks、guided setup、llama.cpp fallback |
| UI animation 影響效能 | 掉幀 | event decoupling、transform/opacity、virtualization、reduced motion |
| False confidence | 使用者錯信 AI | evidence、status ladder、approval、no vague Done |
| GitHub accidental push | 外部副作用 | explicit approval、branch isolation、dry-run、remote check |

---
