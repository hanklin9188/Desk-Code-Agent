# Productization Visualization Specification

Status: `IMPLEMENTATION_BASELINE`  
Owner phase: `PRODUCTIZATION / PORTFOLIO`

## Data contract

The visualization system consumes a named `CanonicalArtifactBundle`. Each entry records its repository-relative path and parsed JSON value. Raw imports live in `canonicalArtifacts.ts`; domain validation and aggregation live in the experiment-visualization service; React chart components consume only `VisualizationDashboard` view-models.

The top-level result is a discriminated state:

```text
LOADING | READY(dashboard, warnings) | EMPTY(message) | ERROR(issues)
```

Required artifacts are the G4 capability routing evaluation, model capability matrix v6, model tournament Session D v2, semantic decomposition Session B, privacy-safe V3 paired report, and code-formation recovery results index v6. Every source link in a view-model must resolve to one of those paths or another explicitly registered sealed source.

## Validation rules

- Required objects and arrays must exist before aggregation.
- Counts must be finite and non-negative.
- Successes may not exceed denominators.
- Model rows marked scored must provide strict behavioral counts and denominators.
- Observability comparison denominators must agree with the paired-failure population.
- Privacy retention fields used in the dashboard must equal zero.
- Mutation status must equal `KEEP_MUTATION_DISABLED` in both research and product projections.
- Empty optional metric groups create an `EMPTY` chart state; malformed required data creates `ERROR`.

## Chart contracts

| View-model | Required representation | Source |
|---|---|---|
| Capability matrix | Task class × admission state heatmap | G4 routing evaluation |
| Research timeline | Ordered milestone/decision sequence | canonical session/index artifacts |
| Failure decomposition | One normalized stacked bar | semantic decomposition Session B |
| Intervention comparison | Grouped strict-behavioral bars | model capability matrix v6 |
| Verification funnel | Retrieved → valid → syntax → visible → hidden → strict | model capability matrix v6 |
| L0/L1 observability | Paired semantic, non-T14, confidence, T14 bars | V3 paired report |
| Model comparison | Scored candidates with admission thresholds | model capability matrix v6 |
| Runtime cards | Calls, median latency, p95 latency, raw retention | matrix + paired report |
| Paired transitions | L0 category → L1 category weighted flow | V3 paired report |

Every rendered chart includes a unique heading, one-sentence interpretation, a supporting artifact link, an accessible text/table equivalent, and loading/error/empty behavior through `ChartFrame`.

## UI behavior

- Dashboard opens on the frozen product status and links to evidence-oriented pages.
- Capabilities explains supported, assisted, research-only, and disabled without presenting a disabled route as actionable.
- Experiments contains the evidence charts and milestone timeline.
- Repository and Flow preserve the typed-event task journey.
- Safety combines deterministic verification, rollback, privacy retention, and the mutation lock.
- The global model status states that runtime is offline; sealed benchmark metrics never masquerade as live telemetry.

## Motion and accessibility

Motion tokens are 120–180 ms for micro interaction, 180–240 ms for normal transitions, and 240–320 ms for panels. Chart reveals use opacity and short translate only. Reduced-motion removes transforms, travel, and ambient loops while retaining state labels. Charts do not rely on color alone and expose labels/values in text.

## Non-goals

No charting dependency, live artifact polling, benchmark runner, model call, research branch, autonomous edit control, Windows packaging, release signing, or external publication is introduced.
