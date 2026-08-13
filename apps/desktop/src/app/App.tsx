import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent, RunState } from "../../../../packages/contracts/src/index";
import { initialProjection, reduceEvent, replayEvents } from "../../../../packages/event-protocol/src/index";
import { Icon } from "../components/Icon";
import { canonicalArtifacts, resolveCanonicalArtifact } from "../../../../services/experiment-visualization/src/canonicalArtifacts";
import { buildVisualizationState } from "../../../../services/experiment-visualization/src/index";
import { demoEvents, evidence, fileTree, verification } from "./demo";
import { WorkspaceView } from "./Views";
import { resolveCapturePreset } from "./captureMode";

const views = [
  ["Repository", "files"], ["Overview", "overview"], ["Architecture", "architecture"], ["Flow", "flow"],
  ["Code", "code"], ["Diff", "diff"], ["Verify", "verify"], ["Findings", "shield"], ["Report", "report"],
  ["Dashboard", "overview"], ["Capabilities", "shield"], ["Experiments", "history"], ["Workspace", "flow"], ["Safety", "verify"],
  ["History", "history"], ["Runtime", "overview"], ["Approvals", "shield"]
] as const;

const visualizationState = buildVisualizationState(canonicalArtifacts);

const stateLabel: Record<RunState, string> = {
  CREATED: "Ready", INGESTING: "Starting", CONTRACTING: "Contracting", SCOPING: "Scoping", INDEXING: "Indexing",
  RETRIEVING: "Retrieving", ANALYZING: "Analyzing", PLANNING: "Planning", EDITING: "Editing", VERIFYING: "Verifying",
  DIAGNOSING: "Diagnosing", REVIEWING: "Reviewing", AWAITING_APPROVAL: "Approval", REPORTING: "Reporting",
  DONE: "Complete", BLOCKED: "Blocked", FAILED: "Failed", CANCELLED: "Cancelled"
};

function useDemoRun(initialEventCount?: number) {
  const [projection, setProjection] = useState(() => initialEventCount ? replayEvents(demoEvents.slice(0, initialEventCount)) : initialProjection("run_demo_001", "task_demo_001"));
  const [running, setRunning] = useState(false);
  const timer = useRef<number | null>(null);
  const cursor = useRef(0);
  const stopTimer = useCallback(() => { if (timer.current !== null) window.clearInterval(timer.current); timer.current = null; }, []);
  const start = useCallback(() => {
    stopTimer(); cursor.current = 0; setProjection(initialProjection("run_demo_001", "task_demo_001")); setRunning(true);
    timer.current = window.setInterval(() => {
      const event = demoEvents[cursor.current++];
      if (!event) { stopTimer(); setRunning(false); return; }
      setProjection((current) => reduceEvent(current, event));
    }, 340);
  }, [stopTimer]);
  const cancel = useCallback(() => {
    stopTimer(); setRunning(false);
    setProjection((current) => reduceEvent(current, {
      eventId: "evt_cancelled", runId: current.runId, taskId: current.taskId, sequence: current.lastSequence + 1,
      timestamp: new Date().toISOString(), source: "runtime", type: "run.cancelled", severity: "warning",
      payload: { message: "Run cancelled · partial evidence retained" }, privacy: "local_only"
    }));
  }, [stopTimer]);
  const replay = useCallback(() => { stopTimer(); setRunning(false); setProjection(replayEvents(demoEvents)); }, [stopTimer]);
  const decideApproval = useCallback((approved: boolean) => {
    setProjection((current) => reduceEvent(current, {
      eventId: `evt_approval_${approved ? "granted" : "denied"}`, runId: current.runId, taskId: current.taskId,
      sequence: current.lastSequence + 1, timestamp: new Date().toISOString(), source: "approval",
      type: approved ? "approval.granted" : "approval.denied", severity: approved ? "info" : "warning",
      payload: { message: approved ? "Verified patch accepted once" : "Protected action denied" }, privacy: "local_only"
    }));
  }, []);
  useEffect(() => stopTimer, [stopTimer]);
  return { projection, running, start, cancel, replay, decideApproval };
}

export function App() {
  const [capture] = useState(() => resolveCapturePreset(window.location.search));
  const [view, setView] = useState(() => capture?.view ?? "Dashboard");
  const [inspectorOpen, setInspectorOpen] = useState(() => capture?.inspectorOpen ?? true);
  const [repositoryOpen, setRepositoryOpen] = useState(() => capture?.repositoryOpen ?? true);
  const [reducedMotion] = useState(() => capture?.reducedMotion || (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false));
  const [task, setTask] = useState(() => capture?.task ?? "Analyze the runtime flow, rank the top risks, and safely fix what is bounded.");
  const [selectedEvidence, setSelectedEvidence] = useState(evidence[0]);
  const [toast, setToast] = useState<string | null>(null);
  const [artifactPath, setArtifactPath] = useState<string | null>(null);
  const artifactDialog = useRef<HTMLElement | null>(null);
  const artifactCloseButton = useRef<HTMLButtonElement | null>(null);
  const artifactReturnFocus = useRef<HTMLElement | null>(null);
  const { projection, running, start, cancel, replay, decideApproval } = useDemoRun(capture?.eventCount);

  const artifact = artifactPath ? resolveCanonicalArtifact(artifactPath) : undefined;
  const closeArtifact = useCallback(() => setArtifactPath(null), []);

  useEffect(() => {
    const openArtifact = (event: Event) => {
      artifactReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setArtifactPath((event as CustomEvent<string>).detail);
    };
    window.addEventListener("dca:artifact-open", openArtifact);
    return () => window.removeEventListener("dca:artifact-open", openArtifact);
  }, []);

  useEffect(() => {
    if (!artifactPath) return;
    artifactCloseButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeArtifact();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = artifactDialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (controls.length === 1 || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      artifactReturnFocus.current?.focus();
    };
  }, [artifactPath, closeArtifact]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return;
      const index = Number(event.key) - 1;
      if (index >= 0 && index < views.length) { event.preventDefault(); setView(views[index][0]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2400); };
  const visibleVerification = projection.verification.length ? projection.verification : verification.map((stage) => ({ ...stage, status: "NOT_RUN" as const, durationMs: undefined, summary: "No runtime evidence recorded" }));

  const appClass = ["app", reducedMotion ? "reduce-motion" : "", capture ? `capture-mode capture-${capture.id}` : "", capture?.hideComposer ? "no-composer" : ""].filter(Boolean).join(" ");
  return <div className={appClass}>
    <a className="skip-link" href="#workspace">Skip to workspace</a>
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Icon name="logo" size={18} /></span><span>Desk</span></div>
      <button className="repo-identity" onClick={() => setRepositoryOpen((value) => !value)} aria-expanded={repositoryOpen}>
        <span className="repo-avatar">D</span><span><strong>desk-code-agent</strong><small><Icon name="branch" size={12} /> master&nbsp; · &nbsp;0c49a85</small></span><Icon name="chevron" className="down" />
      </button>
      <div className="top-spacer" />
      {capture && <div className="capture-chip">DETERMINISTIC CAPTURE</div>}
      <div className="privacy-chip"><span className="status-dot good" /> Local only</div>
      <div className="model-status"><span className="model-glyph">Q</span><span><strong>Qwen3.5-4B</strong><small>{capture ? "Fixture replay · zero model calls" : running ? "Trace replay · BF16 profile" : "Offline · NOT RUN"}</small></span></div>
      <div className="telemetry" aria-label="Model telemetry"><span><b>{running ? "Replay" : "—"}</b> VRAM</span><span><b>{running ? projection.totalEvents : "—"}</b> events</span><span><b>0</b> queued</span></div>
      <button className="icon-button" aria-label="Settings" onClick={() => setView("Settings")}><Icon name="settings" /></button>
    </header>

    <div className={`shell ${repositoryOpen ? "" : "repo-closed"} ${inspectorOpen ? "" : "inspector-closed"}`}>
      <aside className="rail" aria-label="Primary navigation"><nav>{views.map(([label, icon], index) => { const shortcut = index < 9 ? ` (Ctrl+${index + 1})` : ""; return <button key={label} className={view === label ? "active" : ""} onClick={() => setView(label)} aria-label={`${label}${shortcut}`} title={`${label}${shortcut}`}><Icon name={icon} size={18}/><span>{label}</span></button>; })}</nav><button className={view === "Settings" ? "active bottom" : "bottom"} onClick={() => setView("Settings")}><Icon name="settings" size={18}/><span>Settings</span></button></aside>
      {repositoryOpen && <RepositoryPanel onSelect={() => setView("Code")} />}
      <main id="workspace" className="workspace" tabIndex={-1}>
        <div className="workspace-heading"><div><span className="eyebrow">Workspace</span><h1>{view}</h1></div><div className="heading-actions">{(view === "Flow" || view === "Dashboard") && <button className="soft-button" onClick={replay}><Icon name="history"/> Replay trace</button>}<button className="icon-button" aria-label={inspectorOpen ? "Close inspector" : "Open inspector"} onClick={() => setInspectorOpen((value) => !value)}><Icon name="overview" /></button><button className="icon-button" aria-label="More"><Icon name="more" /></button></div></div>
        <div className="view-container"><WorkspaceView view={view} projection={projection} verification={visibleVerification} reducedMotion={reducedMotion} onReplay={replay} onNotify={notify} onNavigate={setView} onRun={start} visualizationState={visualizationState} /></div>
      </main>
      {inspectorOpen && <Inspector projection={projection} selected={selectedEvidence} onSelect={setSelectedEvidence} />}
    </div>

    {!capture?.hideComposer && <footer className="composer-wrap">
      <div className="run-summary"><span className={`run-state state-${projection.state.toLowerCase()}`}><span className="status-dot" />{stateLabel[projection.state]}</span><span className="run-copy">{projection.currentMessage}</span><span className="run-progress"><i style={{ width: `${projection.progress}%` }} /></span></div>
      <div className="composer"><div className="composer-icon"><Icon name="logo" /></div><label className="sr-only" htmlFor="task">Task</label><textarea id="task" value={task} onChange={(event) => setTask(event.target.value)} rows={1} /><div className="contract-chips"><button>MIXED <Icon name="chevron" size={12}/></button><span>L2 scope</span><span><Icon name="shield" size={12}/> Worktree</span></div>{running ? <button className="stop-button" onClick={cancel}><Icon name="stop" size={14}/> Stop</button> : <button className="run-button" onClick={start} disabled={!task.trim()}><Icon name="play" size={14}/> Run</button>}</div>
    </footer>}
    {projection.approval && <div className="approval-bar" role="region" aria-label="Approval required"><span className="approval-symbol">◇</span><div><strong>{projection.approval.action}</strong><small>Target: {projection.approval.target} · {projection.approval.scope} · {projection.approval.artifactHash}</small><em>{projection.approval.rollback}</em></div><button className="soft-button" onClick={() => notify("Exact artifact and scope verified")}>Review details</button><button className="deny-button" onClick={() => decideApproval(false)}>Deny</button><button className="approve-button" onClick={() => decideApproval(true)}>Approve once</button></div>}
    {toast && <div className="toast" role="status"><span className="status-dot good" />{toast}</div>}
    {artifactPath && <div className="artifact-backdrop" onMouseDown={closeArtifact}><section ref={artifactDialog} className="artifact-dialog" role="dialog" aria-modal="true" aria-label="Canonical artifact" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="viz-kicker">READ-ONLY BUNDLED EVIDENCE</span><h2>Canonical artifact</h2><code>{artifactPath}</code></div><button ref={artifactCloseButton} className="icon-button" aria-label="Close artifact" onClick={closeArtifact}><Icon name="close"/></button></header>{artifact ? <pre>{JSON.stringify(artifact.data, null, 2)}</pre> : <div className="visual-state error">Artifact is not part of the canonical bundled allowlist.</div>}</section></div>}
  </div>;
}

function RepositoryPanel({ onSelect }: { onSelect: () => void }) {
  const [filter, setFilter] = useState("");
  const filtered = fileTree.filter((item) => item.name.toLowerCase().includes(filter.toLowerCase()));
  return <aside className="repository-panel"><div className="panel-tabs"><button className="active">Files</button><button>Symbols</button><button>Tests</button></div><label className="search"><Icon name="search" size={14}/><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter repository" aria-label="Filter repository"/><kbd>⌘P</kbd></label><div className="tree-meta"><span>DESK-CODE-AGENT</span><button aria-label="Repository actions"><Icon name="more" /></button></div><div className="file-tree" aria-label="Virtualized repository files">{filtered.slice(0, 200).map((item, index) => <button key={`${item.name}-${index}`} style={{ paddingLeft: 12 + item.depth * 14 }} className={item.name === "App.tsx" ? "selected" : ""} onClick={onSelect}><Icon name={item.kind === "folder" ? "chevron" : "code"} size={12}/><span className={`file-icon ${item.kind}`}>{item.kind === "folder" ? "" : item.kind.toUpperCase()}</span><span>{item.name}</span></button>)}</div><div className="index-card"><div><span className="status-dot good"/><strong>Index snapshot loaded</strong></div><p>Fixture repository · local only</p><small>Runtime refresh required for current metrics</small></div></aside>;
}

function Inspector({ projection, selected, onSelect }: { projection: ReturnType<typeof initialProjection>; selected: typeof evidence[number]; onSelect: (item: typeof evidence[number]) => void }) {
  const [tab, setTab] = useState("Evidence");
  const items = projection.evidence.length ? projection.evidence : evidence;
  return <aside className="inspector"><div className="inspector-tabs">{["Evidence", "Activity", "Details"].map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item}{item === "Evidence" && <span>{items.length}</span>}</button>)}</div>{tab === "Evidence" ? <><div className="inspector-section current"><span className="section-kicker">CURRENT FOCUS</span><div className="focus-title"><span className="agent-avatar">A</span><span><strong>{projection.currentSkill ?? "R08 Evidence Retrieval"}</strong><small>{projection.activeAgent ?? "Repo Analyst"} · {stateLabel[projection.state]}</small></span></div><div className="budget"><span>Context budget</span><span>4.8K / 12K</span><i><b style={{width:"40%"}}/></i></div></div><div className="inspector-section"><div className="section-head"><span className="section-kicker">SELECTED EVIDENCE</span><span>confidence</span></div>{items.map((item) => <button className={`evidence-row ${selected.id === item.id ? "active" : ""}`} key={item.id} onClick={() => onSelect(item)}><span className="evidence-kind">TS</span><span><strong>{item.path.split("/").at(-1)}</strong><small>{item.path}<br/>Lines {item.startLine}–{item.endLine}</small></span><b>{Math.round(item.confidence*100)}%</b></button>)}</div><div className="inspector-section evidence-detail"><div><span className="section-kicker">PROVENANCE</span><span className="verified-label">✓ Verified</span></div><dl><dt>Evidence ID</dt><dd>{selected.id}</dd><dt>Source hash</dt><dd><code>{selected.hash}</code></dd><dt>Retrieved by</dt><dd>lexical + symbol</dd><dt>Trust</dt><dd>Untrusted source data</dd></dl></div></> : <div className="empty-tab"><Icon name={tab === "Activity" ? "history" : "overview"} size={24}/><strong>{tab}</strong><p>{tab === "Activity" ? `${projection.events.length} typed events in this run.` : "Select a node, tool or artifact for structured details."}</p></div>}</aside>;
}
