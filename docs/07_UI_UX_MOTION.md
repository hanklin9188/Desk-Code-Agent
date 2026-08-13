# Desk Code Agent — UI/UX and Motion Design

> Version: `0.1.0-design`  
> Status: Implementation-ready specification  
> Canonical source: [`../DESK_CODE_AGENT_MASTER_DESIGN.md`](../DESK_CODE_AGENT_MASTER_DESIGN.md)

## 文件用途

定義 calm/spatial/observable 視覺語言、Animate UI 元件映射、motion token、事件動畫、可及性與 60 FPS 效能預算。

---

# Part VII — UI/UX and Motion Design

## 24. 產品視覺方向

設計語言：

\[
\boxed{\text{Calm + Spatial + Observable + Trustworthy}}
\]

- **Calm**：安靜、低噪音、可長時間使用。
- **Spatial**：用 Workspace、Panel、Graph、Diff 建立空間感。
- **Observable**：看得見 Agent、工具、證據、狀態與花費。
- **Trustworthy**：清楚區分 proposed、applied、verified、approved。

避免：

- RGB neon。
- 大量 loop glow。
- 所有元件同時動。
- 把 AI 隱藏在一個不可觀察的 spinner 後面。
- 只做左側 sidebar + 右側聊天框。

---

## 25. Desktop Information Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ Desk Code Agent    Local ●   Qwen3.5-4B   VRAM   Settings   │
├──────────────┬──────────────────────────────┬────────────────┤
│ Repo Explorer│ Main Workspace               │ Inspector      │
│              │                              │ Evidence       │
│ Files        │ Overview / Architecture      │ Agent detail   │
│ Symbols      │ Agent Flow / Code / Diff     │ Validation     │
│ Tests        │ Findings / Report            │ Actions        │
│ Git          │                              │                │
├──────────────┴──────────────────────────────┴────────────────┤
│ Ask your repository…                    Mode ▾       Run ⌘↵ │
└──────────────────────────────────────────────────────────────┘
```

### 25.1 Main Views

- **Overview**：Repo fingerprint、health、entry points、recent tasks。
- **Architecture**：module graph、dependency／data flow。
- **Agent Flow**：即時 state graph。
- **Code**：Monaco editor、symbol context。
- **Diff**：side-by-side／inline diff、accept／revert。
- **Tests**：targeted／full tests、logs、fail clusters。
- **Findings**：P0／P1／P2 findings 與 evidence。
- **Report**：Markdown report。
- **History**：task traces 與 comparison。

---

## 26. Animate UI 元件映射

Animate UI 是以 Tailwind CSS 與 Motion 建構的 copy-first React component distribution，可直接複製後依產品 design system 修改。Desk Code Agent 不會照抄炫目背景，而會選用適合工程 workspace 的元件。

| Animate UI Component | Desk Code Agent 用途 |
|---|---|
| `Files` | Repo Explorer，顯示 folder、file、Git status |
| `Sidebar` | 左側 navigation 與可收合 workspace rail |
| `Tabs` | Overview／Flow／Code／Diff／Tests／Report 切換 |
| `Code` | onboarding demo、streaming patch preview |
| `Code Tabs` | bash／Python／C++ setup commands |
| `Sheet` | 右側 evidence／agent／finding inspector |
| `Dialog` | task detail、model profile、settings |
| `Alert Dialog` | delete、install dependency、push、high-risk approval |
| `Progress` | indexing、test、report generation |
| `Tooltip` | icon-only tools 與 keyboard shortcuts |
| `Dropdown Menu` | task mode、model profile、export actions |
| `Switch` | Local-only、thinking、auto-apply、reduced motion |
| `Management Bar` | selected files／findings 的 contextual action bar |
| `Notification List` | event timeline、completed／failed actions |

### 26.1 使用規則

- 將 Animate UI 元件 source 複製進本 repo，納入自己的 design tokens 與 tests。
- 不依賴遠端 runtime component registry。
- 每次升級都要 visual regression、keyboard 與 reduced-motion test。
- 使用前確認元件與其 dependency 的 license。

---

## 27. Design Tokens

### 27.1 Dark Theme

| Token | Value | 用途 |
|---|---|---|
| `canvas` | `#0C1016` | 主背景 |
| `surface-1` | `#121822` | panel |
| `surface-2` | `#18202B` | elevated card |
| `border` | `#273141` | 邊界 |
| `text-primary` | `#F3F6FB` | 主文字 |
| `text-secondary` | `#9BA8BA` | 次文字 |
| `accent` | `#7C9CFF` | active、link |
| `success` | `#66C78C` | verified |
| `warning` | `#E3B96E` | approval／risk |
| `error` | `#E47D84` | fail |
| `info` | `#A88BFF` | analysis |

### 27.2 Typography

- UI：Inter／system sans。
- Code：JetBrains Mono／Cascadia Code。
- 14px 基準，重要數據 12–13px compact，報告正文 15–16px。
- 不用過細字重；暗色介面至少 400／500。

### 27.3 Geometry

- Radius：8、12、16。
- Panel gap：8–12px。
- Workspace outer padding：16px。
- 無強烈深陰影，以 border + subtle elevation 建立層次。

---

## 28. Motion System

### 28.1 Timing Tokens

| Token | Duration | 用途 |
|---|---:|---|
| `instant` | 80–100ms | icon feedback |
| `micro` | 120–160ms | hover、toggle |
| `standard` | 180–220ms | tabs、small panel |
| `panel` | 260–320ms | sheet、inspector |
| `scene` | 420–600ms | workspace mode transition |
| `flow` | 900–1400ms | edge particle travel |

### 28.2 Agent Node States

| State | 視覺 |
|---|---|
| Idle | 靜止、低對比 |
| Queued | 低頻 pulse 一次 |
| Running | 1.8–2.4s subtle breathing，scale ≤1.02 |
| Tool call | 細粒子沿 edge 이동 |
| Completed | `○ → ✓` 240ms spring |
| Failed | border／icon 變化，避免整體紅閃 |
| Retry | edge 回流 + retry badge |
| Waiting approval | amber halo，無循環強光 |

### 28.3 Event-driven animation

Backend 發出 typed events：

```text
repo.index.started
repo.index.progress
agent.started
agent.completed
tool.called
tool.completed
patch.created
test.started
test.failed
test.passed
review.request_changes
approval.required
task.completed
```

UI 只根據 event store render，不等待 inference function return，因此 GPU 高負載時 UI thread 仍可保持順暢。

### 28.4 Reduced Motion

App root：

```tsx
<MotionConfig reducedMotion="user">
  <App />
</MotionConfig>
```

Reduced Motion 啟用時：

- 停用 translate／scale／parallax／looping particles。
- 保留 opacity、background、status icon transition。
- Agent Flow 改以 progress stroke 與文字狀態表示。

---

## 29. UI 效能預算

- Target：60 FPS；高更新區域 p95 frame time < 20ms。
- Main-thread long task > 50ms 必須記錄。
- 連續動畫只使用 transform／opacity。
- 同時 looping animation 不超過 2 個視覺區域。
- File tree > 500 nodes 啟用 virtualization。
- Logs > 1,000 rows 啟用 virtualization／windowing。
- Monaco 與 React Flow lazy-load。
- 不可在每個 token streaming 時重排整個 layout；以 batch 更新。
- 視窗隱藏時暫停非必要 animation。
- UI process 不執行 repo indexing、test 或 model inference。

---

## 30. UX Trust Model

任何結論都顯示：

- `Proposed`
- `Applied in worktree`
- `Syntax verified`
- `Targeted tests passed`
- `Full tests passed`
- `Reviewer approved`
- `User accepted`
- `Committed`
- `Pushed`

不得只顯示模糊的「Done」。

### 30.1 Finding Card

```text
P1 · Missing empty-input handling
Confidence: High
Evidence:
- src/config/loader.py:41–52
- tests/test_loader.py:18–37
Validation:
- Reproduced: yes
- Hidden regression test: pending
Action: Safe local patch
```

### 30.2 Diff UX

- Side-by-side 與 inline 切換。
- 每個 hunk 顯示 reason 與 acceptance criterion。
- `Accept all`、`Accept hunk`、`Revert`、`Ask Agent`。
- 測試結果固定顯示在 diff 旁，不藏在聊天紀錄。

---
