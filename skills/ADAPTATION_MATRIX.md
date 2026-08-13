# Selective Adaptation Matrix

> 第三方來源：`https://github.com/mattpocock/skills`  
> 授權：MIT。完整 attribution 見 `THIRD_PARTY_NOTICES.md`。

本專案採用 **principle extraction → original bounded implementation**。不把第三方 skill 當作 production runtime 的隱式依賴，也不在模型 context 中整包載入。

| 工程原則 | 參考來源 | Desk Code Agent Skill | 重新設計內容 |
|---|---|---|---|
| Discovery / shared language | grill-with-docs, domain-modeling | D01 | 由無界訪談改成有限輪數、CONTEXT/ADR artifacts與 completion gates。 |
| Conversation to spec | to-spec | D02 | 加入 local-agent security、model budget、event protocol、GitHub checkpoint與 schema lint。 |
| Throwaway prototype | prototype | D03 | 加入多 variant UI、Animate UI、reduced motion、event replay與 throwaway branch policy。 |
| Implementation flow | implement | D04 | 加入 worktree、bounded slices、approval、milestone release與 local model limits。 |
| Red-green vertical slices | tdd | D05 / R13 / R21 | 保留 behavior/public seam精神；改成 machine result schema與 hidden-test evaluation。 |
| Debug feedback loop | diagnosing-bugs | D06 / R17 / R18 | 保留 reproduce→minimize→hypotheses→instrument；加入有限 calls、evidence ledger、secret redaction。 |
| Dual-axis review | code-review | D07 / R22 | 保留 Spec/Standards隔離；加入 deterministic verification先決條件與 severity schema。 |
| Deep modules | codebase-design | D08 / R07 | 用於 RepoIntelligence與ToolRuntime小 interface，降低4B wrong-tool rate。 |
| Agent document mechanics | writing-for-agents | D09 | 加入 frontmatter/schema lint、trigger precision、context-load與local-model A/B。 |
| Architecture survey | improve-codebase-architecture | D10 / R12 | 加入 telemetry/change-locality/Agent navigation cost，不自動重構。 |
| Handoff / publish | general engineering practice | D11 / R27 | 原創 GitHub approval、secret scan、branch/PR/tag checkpoint。 |

## Legal and provenance rules

- 第三方 repository 的 MIT license 與 copyright notice 保留於 notices。
- 若日後逐字或 substantial copy 某段 code/text，對應檔案必須帶 source path、commit SHA與license header。
- 本 v2 pack 的 Skills 為重新撰寫；核心契約、schemas、budgets、security、evaluation與UI event integration均為本專案設計。
- `source-lock.example.yaml` 在實作時 pin 第三方 commit SHA；自動 update 不得改 production behavior。
- 新增第三方 skill 前必須先完成 license review、behavior diff與paired evaluation。
