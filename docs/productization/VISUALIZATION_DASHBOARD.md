# Visualization Dashboard

The productization dashboard is a deterministic projection of sealed experiment JSON. It introduces no model calls and does not modify historical artifacts.

## Architecture

```text
canonicalArtifacts.ts        raw imports + source paths
          ↓
experiment-visualization     validation + aggregation
          ↓
VisualizationDashboard      stable chart view-model
          ↓
React chart components       accessible presentation + states
```

`services/experiment-visualization/src/canonicalArtifacts.ts` is the only raw-loading layer. `index.ts` validates field types, count relationships, paired denominators, privacy invariants, and mutation status. The desktop imports only the resulting state. Invalid required data returns `ERROR`; absent chartable rows return `EMPTY`; asynchronous consumers can use `LOADING`.

## Chart inventory

The Dashboard, Capabilities, Experiments, and Safety pages render the capability matrix, research timeline, failure stack, retry intervention comparison, verification funnel, L0/L1 comparison, model comparison, measured runtime cards, and paired semantic transition flow. Every chart supplies a title, interpretation, source link, and textual values so color is not the sole carrier.

## Claim integrity

- FIM runtime is labeled as sealed historical measurement, not live telemetry.
- The strongest model bar does not imply promotion.
- The verification funnel uses monotonic pipeline-compatible fields; visible and hidden test totals are not incorrectly treated as nested stages.
- L0/L1 comparisons retain the exactly paired 44-failure denominator.
- Raw-retention zero values are validated before the dashboard reaches `READY`.

## Development

Run `npx vitest run tests/experiment-visualization.test.ts` for the data layer and `npm run check` for the complete gate. Do not invoke benchmark scripts to refresh this dashboard; update its canonical inputs only through a separately authorized research process.

