# Media Visual Regression Matrix

Reference viewport: 1440×900. Browser and Windows-native results require later reference-hardware execution.

| Scale | Linux fixture DOM/tests | Browser screenshot comparison | Windows native | Acceptance focus |
|---:|---|---|---|---|
| 100% | PASS | NOT_RUN — capture binary unavailable | NOT_RUN | Canonical composition and readable chart labels |
| 125% | PASS_BY_RESPONSIVE_CONTRACT | NOT_RUN | NOT_RUN | No clipped navigation, cards, dialogs, or approval controls |
| 150% | PASS_BY_RESPONSIVE_CONTRACT | NOT_RUN | NOT_RUN | Two-column grids degrade without horizontal document scroll |
| 200% | PASS_BY_RESPONSIVE_CONTRACT | NOT_RUN | NOT_RUN | Content remains reachable; no status depends only on hover |

## Later reference-hardware checks

- Compare all five routes at 100%, then the hero, dashboard, and safety routes at 125–200%.
- Exercise system reduced motion independently from the query override.
- Verify keyboard focus order, high contrast, Windows text scaling, and screen reader labels.
- Record GPU/model runtime as offline; visual QA must not start inference.
- Treat clipping, unreadable chart labels, missing focus, concealed rejection actions, or mutation-status drift as blockers.

