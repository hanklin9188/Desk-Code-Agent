import React from "react";
import type { ChartMeta, VisualizationDashboard, VisualizationState } from "../../../../../services/experiment-visualization/src/index";

type Charts = VisualizationDashboard["charts"];

export function VisualizationBoundary({ state, children }: { state: VisualizationState; children: (dashboard: VisualizationDashboard) => React.ReactNode }) {
  if (state.status === "LOADING") return <div className="visual-state loading" role="status"><span className="skeleton-line"/><span className="skeleton-line short"/>Loading sealed experiment evidence…</div>;
  if (state.status === "ERROR") return <div className="visual-state error" role="alert"><strong>Experiment evidence could not be validated</strong><ul>{state.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>;
  if (state.status === "EMPTY") return <div className="visual-state empty"><strong>No experiment evidence</strong><p>{state.message}</p></div>;
  return <>{children(state.dashboard)}</>;
}

function ChartFrame({ meta, className = "", children }: { meta: ChartMeta; className?: string; children: React.ReactNode }) {
  const openSource = () => window.dispatchEvent(new CustomEvent<string>("dca:artifact-open", { detail: meta.source.path }));
  return <figure className={`viz-card chart-reveal ${className}`}><figcaption><div><span className="viz-kicker">SEALED EVIDENCE</span><h3>{meta.title}</h3><p>{meta.takeaway}</p></div><button type="button" className="source-link" onClick={openSource} title={meta.source.path} aria-label={`Open source: ${meta.source.label}`}>↗ {meta.source.label}</button></figcaption><div className="chart-body">{children}</div></figure>;
}

const pct = (value: number, denominator: number) => denominator ? Math.round(value / denominator * 100) : 0;

export function CapabilityMatrix({ chart }: { chart: Charts["capabilityMatrix"] }) {
  return <ChartFrame meta={chart} className="span-2"><div className="capability-table" role="table" aria-label="Capability admission status">
    <div className="capability-head" role="row"><span role="columnheader">Capability</span><span role="columnheader">Evidence</span><span role="columnheader">Admission</span></div>
    {chart.rows.map((row) => <div className="capability-row" role="row" key={row.capability}><strong role="cell">{row.capability}</strong><span role="cell">{row.evidence}</span><b role="cell" className={`admission admission-${row.state.toLowerCase()}`}>{row.state.replace("_", " ")}</b></div>)}
  </div></ChartFrame>;
}

export function ExperimentTimeline({ chart }: { chart: Charts["timeline"] }) {
  return <ChartFrame meta={chart} className="span-2"><ol className="research-timeline">{chart.events.map((event) => <li key={event.label} className={`timeline-${event.state.toLowerCase()}`}><time>{event.date}</time><i/><div><strong>{event.label}</strong><span>{event.decision}</span></div><b>{event.state}</b></li>)}</ol></ChartFrame>;
}

export function FailureStack({ chart }: { chart: Charts["failureDecomposition"] }) {
  return <ChartFrame meta={chart}><div className="stacked-bar" aria-label={`${chart.total} classified failures`}>{chart.segments.map((segment) => <span key={segment.label} style={{ width: `${pct(segment.value, chart.total)}%`, background: segment.color }} title={`${segment.label}: ${segment.detail}`}/>)}</div><div className="chart-legend">{chart.segments.map((segment) => <div key={segment.label}><i style={{ background: segment.color }}/><span>{segment.label}</span><strong>{segment.value}</strong></div>)}</div></ChartFrame>;
}

export function InterventionBars({ chart }: { chart: Charts["interventionComparison"] }) {
  return <ChartFrame meta={chart}><div className="grouped-bars">{chart.groups.map((group) => <div className="bar-group" key={group.label}><span>{group.label}</span><div><i className="bar one" style={{ height: `${pct(group.oneShot, group.denominator)}%` }}><b>{group.oneShot}</b></i><i className="bar two" style={{ height: `${pct(group.intervention, group.denominator)}%` }}><b>{group.intervention}</b></i></div></div>)}</div><div className="mini-legend"><span><i className="one"/>One shot</span><span><i className="two"/>Max two calls</span></div></ChartFrame>;
}

export function VerificationFunnel({ chart }: { chart: Charts["verificationFunnel"] }) {
  return <ChartFrame meta={chart}><div className="funnel" aria-label="Verification stage counts">{chart.stages.map((stage, index) => <div key={stage.label} style={{ width: `${Math.max(34, pct(stage.value, chart.denominator))}%` }}><span>{index + 1}</span><strong>{stage.label}</strong><b>{stage.value}</b></div>)}</div></ChartFrame>;
}

export function ObservabilityComparison({ chart }: { chart: Charts["observability"] }) {
  return <ChartFrame meta={chart} className="span-2"><div className="observability-bars">{chart.metrics.map((metric) => <div key={metric.key}><header><strong>{metric.label}</strong><span>{metric.direction === "up" ? "Higher is better" : "Lower is better"}</span></header><div className="paired-row"><b>L0</b><i><span style={{ width: `${pct(metric.l0, chart.denominator)}%` }}/></i><strong>{metric.l0}<small>/{chart.denominator}</small></strong></div><div className="paired-row l1"><b>L1</b><i><span style={{ width: `${pct(metric.l1, chart.denominator)}%` }}/></i><strong>{metric.l1}<small>/{chart.denominator}</small></strong></div></div>)}</div></ChartFrame>;
}

export function ModelComparison({ chart }: { chart: Charts["modelComparison"] }) {
  const max = Math.max(...chart.rows.map((row) => row.denominator));
  return <ChartFrame meta={chart} className="span-2"><div className="model-bars">{chart.rows.map((row) => <div key={row.model} className={row.scored ? "" : "not-scored"}><span><strong>{row.model}</strong><small>{row.scored ? row.status.replaceAll("_", " ") : "NOT SCORED"}</small></span><i><b style={{ width: `${pct(row.value, max)}%` }}/></i><strong>{row.scored ? `${row.value}/${row.denominator}` : "Excluded"}</strong></div>)}</div><div className="threshold-line"><span style={{ left: `${pct(29, 95)}%` }}>Assisted 29</span><span style={{ left: `${pct(57, 95)}%` }}>Product 57</span></div></ChartFrame>;
}

export function RuntimeCards({ chart }: { chart: Charts["runtime"] }) {
  return <ChartFrame meta={chart} className="span-2"><div className="runtime-cards">{chart.cards.map((card) => <article key={card.label}><span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small></article>)}</div></ChartFrame>;
}

export function TransitionFlow({ chart }: { chart: Charts["transitions"] }) {
  const max = Math.max(...chart.links.map((link) => link.value));
  return <ChartFrame meta={chart} className="span-2"><div className="transition-flow">{chart.links.map((link) => <div key={`${link.from}-${link.to}`}><span>{link.from}</span><i><b style={{ width: `${Math.max(8, pct(link.value, max))}%` }}/><em>{link.value}</em></i><strong>{link.to}</strong></div>)}</div></ChartFrame>;
}
