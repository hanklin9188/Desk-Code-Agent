# Motion System

## Motion is semantic

Animation answers one of four questions:

1. **What changed?**
2. **Where did it come from/go?**
3. **What is active now?**
4. **Does the user need to act?**

If motion answers none, remove it.

## State vocabulary

```text
idle        ○
queued      ◌
active      ◉
tool        ●→
waiting     …
approval    ◈
success     ✓
warning     △
failed      !
retry       ↻
cancelled   ×
blocked     ⛔
```

Color is never the only cue; icon, label and accessible status are required.

## Timing tokens

| Token | Use | Duration |
|---|---|---:|
| `motion.micro` | press, focus, badge, hover | 120–180ms |
| `motion.normal` | tab, list, status transition | 180–240ms |
| `motion.panel` | sheet, chart reveal, larger panel | 240–320ms |
| `motion.scene` | graph re-layout only when causally useful | 320ms maximum |
| `motion.ambient` | active-node breathing | 1600–2400ms cycle |

Avoid chaining more than 600ms before content becomes usable.

Production CSS uses `--motion-micro: 160ms`, `--motion-normal: 220ms`,
`--motion-panel: 300ms`, and `cubic-bezier(.22, 1, .36, 1)`. Productization
charts reveal with opacity and a short vertical settle. Bars use one bounded
scale reveal; they do not continuously animate or imply live progress.

## Productization surfaces

- Page entry: one 300ms opacity/6px settle after route selection.
- Card hover: one 160ms, 2px lift with border emphasis.
- Chart data: one 300ms bar/segment reveal from the chart origin.
- Status change: color, icon, and text transition together within 220ms.
- Loading: low-contrast skeleton shimmer only while a real load is pending.
- Error/empty: static state with a direct explanation; no retry spinner loop.

## Agent Flow

- Active node：opacity/halo and ≤2% scale breathing；不旋轉。
- Dispatch：edge顯示單一 travelling dot，250–600ms，代表真實 event。
- Tool waiting：node不無限 spinner；顯示 elapsed/pulse。
- Retry：新增帶 evidence label 的 back-edge，不能只讓線回跳。
- Success：check path + subtle settle。
- Failure：一次 restrained horizontal nudge ≤4px；禁止整頁 shake。
- Cancel：立即停 animation，node轉 cancelled，保留 partial trace。

## Data animation

- Repository index：顯示 files/symbols/tests counts與indeterminate→determinate stage；不把每個檔案做飛入動畫。
- Diff：新增 hunk淡入；不逐字打字機顯示大量 code。
- Tests：stage-based progress；test rows virtualized，結果按完成淡入。
- Telemetry：低頻採樣，graph update ≤4Hz，避免視覺抖動。
- Architecture graph：layout完成後一次 transition；drag時關閉 expensive layout animation。

## Reduced motion

App root使用 Motion的 user preference。Reduced-motion模式：

- 停止 translate/scale/rotate/layout travel與ambient loop。
- 保留 opacity/background/status icon transitions。
- Travelling dot改成 source/destination瞬時高亮。
- Sheet/Dialog不從遠處滑入，使用短 fade。
- Graph re-layout直接 settle或極短 crossfade。
- 所有功能與因果仍可由文字/狀態理解。

## Interruption

所有動畫必須 interruptible。新 event、cancel、route change或window blur時：

- 不排隊播放過時動畫。
- 用 latest-state reconciliation。
- 長 ambient loops在window hidden時pause。
- approval/dialog animation不能延遲 action availability。
