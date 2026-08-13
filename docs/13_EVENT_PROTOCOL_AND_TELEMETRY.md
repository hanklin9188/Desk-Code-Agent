# Event Protocol and Telemetry

## 1. 目標

Agent backend 與 Desktop UI 必須解耦。Backend 不直接控制動畫；它只發送結構化事件。UI 依事件更新 state、timeline、flow edge、progress、toast、diff 與 telemetry。這使 GPU inference、repo indexing、test execution 與 UI render 可以互不阻塞。

## 2. Event envelope

所有事件使用 `schemas/agent_event.schema.json`：

```json
{
  "event_id": "evt_01J...",
  "run_id": "run_01J...",
  "task_id": "task_01J...",
  "sequence": 17,
  "timestamp": "2026-08-08T06:30:00+08:00",
  "source": "coder",
  "type": "patch.created",
  "severity": "info",
  "payload": {},
  "privacy": "local_only"
}
```

## 3. Delivery semantics

- Per-run monotonically increasing `sequence`。
- UI 以 `(run_id, sequence)` 去重。
- Backend 至少一次送達；UI 必須 idempotent。
- 斷線後用 `after_sequence` replay。
- 完成事件寫入 artifact store，不能只存在 websocket memory。
- Cancellation 必須產生 `run.cancel_requested` 與最終 `run.cancelled`。

## 4. Transport

MVP 使用 localhost WebSocket 或 Server-Sent Events。Tauri command 只處理 lifecycle/control；高頻狀態走 event stream。大型 artifact 不內嵌事件，payload 只傳 `artifact_id` 與摘要，再由 UI lazy-load。

## 5. Required event groups

- Run: created, started, paused, resumed, cancelled, completed, failed。
- Repo: acquisition, indexing, language detection, symbol index, cache hit。
- Agent: dispatched, started, thinking, completed, failed。
- Tool: requested, approved, started, output, failed, blocked。
- Evidence: retrieved, selected, rejected, cited。
- Patch: planned, previewed, applied, reverted。
- Verification: stage started, stage completed, failed。
- Review: requested, approved, changes requested。
- GitHub: approval requested, commit created, push started, push completed, tag created。
- System: model loaded, queue depth, VRAM, tok/s, error。

## 6. Telemetry privacy

預設只保存數量、延遲、狀態、hash、路徑相對識別與 redacted error。不得保存 private repo 原始碼、secrets、完整 prompts 或 model cache。Source snippets 只存在 task-local encrypted artifact，並受 retention policy 管理。

## 7. UI performance policy

- GPU/CPU telemetry 每秒最多 2 次。
- Token stream 可批次 30–50 ms flush，避免每 token React render。
- Repo indexing progress 最多 10 Hz。
- Graph layout 不因每個 token 重算。
- Event reducer 必須 pure/idempotent，可用 recorded trace 做 deterministic replay。
