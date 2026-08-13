import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { RunState } from "../../../../packages/contracts/src/index";
import { initialProjection, reduceEvent, replayEvents } from "../../../../packages/event-protocol/src/index";
import { canonicalArtifacts, resolveCanonicalArtifact } from "../../../../services/experiment-visualization/src/canonicalArtifacts";
import { buildVisualizationState } from "../../../../services/experiment-visualization/src/index";
import { Icon } from "../components/Icon";
import { demoEvents, evidence, fileTree, verification } from "./demo";
import {
  friendlyRepositoryError,
  nativeRepositoryGateway,
  type RepositoryGateway,
  type RepositorySummary
} from "./repositoryGateway";
import { WorkspaceView } from "./Views";
import { resolveCapturePreset } from "./captureMode";
import { resolvePresentationPreset } from "./presentationMode";

const navigation = [
  ["Start", "logo"],
  ["Repository", "files"],
  ["Workspace", "flow"],
  ["Changes", "diff"],
  ["Verify", "verify"],
  ["Report", "report"],
  ["Research", "overview"],
  ["History", "history"]
] as const;

const visualizationState = buildVisualizationState(canonicalArtifacts);
const demoTask = "Trace the runtime safety boundary and explain the evidence behind each decision.";

type RepositoryState = "EMPTY" | "SELECTING" | "VALIDATING" | "READY_READ_ONLY" | "ERROR" | "DEMO" | "CAPTURE";
type ThemePreference = "system" | "dark" | "light";
type TextScale = "100" | "110" | "125";
type Density = "comfortable" | "compact";

export interface AppProps {
  repositoryGateway?: RepositoryGateway;
}

const stateLabel: Record<RunState, string> = {
  CREATED: "Ready", INGESTING: "Starting", CONTRACTING: "Contracting", SCOPING: "Scoping", INDEXING: "Indexing",
  RETRIEVING: "Retrieving", ANALYZING: "Analyzing", PLANNING: "Planning", EDITING: "Editing", VERIFYING: "Verifying",
  DIAGNOSING: "Diagnosing", REVIEWING: "Reviewing", AWAITING_APPROVAL: "Approval", REPORTING: "Reporting",
  DONE: "Complete", BLOCKED: "Blocked", FAILED: "Failed", CANCELLED: "Cancelled"
};

function readPreference<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const value = window.localStorage.getItem(key) as T | null;
  return value && allowed.includes(value) ? value : fallback;
}

function useSystemReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = (event: MediaQueryListEvent | MediaQueryList) => setReduced(event.matches);
    update(query);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

function useDemoRun(initialEventCount?: number) {
  const createInitial = useCallback(() => initialEventCount
    ? replayEvents(demoEvents.slice(0, initialEventCount))
    : initialProjection("run_demo_001", "task_demo_001"), [initialEventCount]);
  const [projection, setProjection] = useState(createInitial);
  const [running, setRunning] = useState(false);
  const timer = useRef<number | null>(null);
  const cursor = useRef(0);
  const stopTimer = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  }, []);
  const reset = useCallback(() => {
    stopTimer();
    cursor.current = 0;
    setRunning(false);
    setProjection(createInitial());
  }, [createInitial, stopTimer]);
  const start = useCallback(() => {
    stopTimer();
    cursor.current = 0;
    setProjection(initialProjection("run_demo_001", "task_demo_001"));
    setRunning(true);
    timer.current = window.setInterval(() => {
      const event = demoEvents[cursor.current++];
      if (!event) {
        stopTimer();
        setRunning(false);
        return;
      }
      setProjection((current) => reduceEvent(current, event));
    }, 340);
  }, [stopTimer]);
  const cancel = useCallback(() => {
    stopTimer();
    setRunning(false);
    setProjection((current) => reduceEvent(current, {
      eventId: "evt_cancelled", runId: current.runId, taskId: current.taskId, sequence: current.lastSequence + 1,
      timestamp: new Date().toISOString(), source: "runtime", type: "run.cancelled", severity: "warning",
      payload: { message: "Run cancelled · partial evidence retained" }, privacy: "local_only"
    }));
  }, [stopTimer]);
  const replay = useCallback(() => {
    stopTimer();
    setRunning(false);
    setProjection(replayEvents(demoEvents));
  }, [stopTimer]);
  const decideApproval = useCallback((approved: boolean) => {
    setProjection((current) => reduceEvent(current, {
      eventId: `evt_approval_${approved ? "granted" : "denied"}`, runId: current.runId, taskId: current.taskId,
      sequence: current.lastSequence + 1, timestamp: new Date().toISOString(), source: "approval",
      type: approved ? "approval.granted" : "approval.denied", severity: approved ? "info" : "warning",
      payload: { message: approved ? "Verified patch accepted once" : "Protected action denied" }, privacy: "local_only"
    }));
  }, []);
  useEffect(() => stopTimer, [stopTimer]);
  return { projection, running, start, cancel, replay, decideApproval, reset };
}

export function App({ repositoryGateway = nativeRepositoryGateway }: AppProps) {
  const [capture] = useState(() => resolveCapturePreset(window.location.search));
  const [presentation] = useState(() => resolvePresentationPreset(window.location.search));
  const [systemLightTheme, setSystemLightTheme] = useState(() => window.matchMedia?.("(prefers-color-scheme: light)").matches ?? false);
  const [repositoryState, setRepositoryState] = useState<RepositoryState>(() => capture ? "CAPTURE" : presentation?.repositoryState ?? "EMPTY");
  const [repositorySelectionPhase, setRepositorySelectionPhase] = useState<"IDLE" | "SELECTING" | "VALIDATING">("IDLE");
  const [repository, setRepository] = useState<RepositorySummary | null>(() => presentation?.repository ?? null);
  const [repositoryError, setRepositoryError] = useState<string | null>(null);
  const [view, setView] = useState(() => capture?.view ?? presentation?.view ?? "Start");
  const [inspectorOpen, setInspectorOpen] = useState(() => capture?.inspectorOpen ?? presentation?.inspectorOpen ?? false);
  const [repositoryOpen, setRepositoryOpen] = useState(() => capture?.repositoryOpen ?? presentation?.repositoryOpen ?? false);
  const systemReducedMotion = useSystemReducedMotion();
  const [motionOverride, setMotionOverride] = useState<boolean | null>(() => {
    const stored = window.localStorage.getItem("dca.motion");
    return stored === "reduce" ? true : stored === "full" ? false : null;
  });
  const [theme, setTheme] = useState<ThemePreference>(() => presentation?.theme ?? readPreference("dca.theme", ["system", "dark", "light"] as const, "system"));
  const [textScale, setTextScale] = useState<TextScale>(() => presentation?.textScale ?? readPreference("dca.textScale", ["100", "110", "125"] as const, "100"));
  const [density, setDensity] = useState<Density>(() => readPreference("dca.density", ["comfortable", "compact"] as const, "comfortable"));
  const reducedMotion = capture?.reducedMotion ?? presentation?.reducedMotion ?? motionOverride ?? systemReducedMotion;
  const resolvedTheme: "dark" | "light" = theme === "system" ? (systemLightTheme ? "light" : "dark") : theme;
  const [task, setTask] = useState(() => capture?.task ?? presentation?.task ?? "");
  const [selectedEvidence, setSelectedEvidence] = useState(evidence[0]);
  const [toast, setToast] = useState<string | null>(null);
  const [artifactPath, setArtifactPath] = useState<string | null>(null);
  const artifactDialog = useRef<HTMLElement | null>(null);
  const artifactCloseButton = useRef<HTMLButtonElement | null>(null);
  const artifactReturnFocus = useRef<HTMLElement | null>(null);
  const repositorySelectionActive = useRef(false);
  const repositorySelectionGeneration = useRef(0);
  const { projection, running, start, cancel, replay, decideApproval, reset } = useDemoRun(capture?.eventCount ?? presentation?.eventCount);

  const isDemo = repositoryState === "DEMO" || repositoryState === "CAPTURE";
  const isRepositoryReady = repositoryState === "READY_READ_ONLY";
  const repositoryBusy = repositorySelectionPhase !== "IDLE";
  const canRun = isDemo && !repositoryBusy;
  const artifact = artifactPath ? resolveCanonicalArtifact(artifactPath) : undefined;
  const closeArtifact = useCallback(() => setArtifactPath(null), []);

  useEffect(() => {
    window.localStorage.setItem("dca.theme", theme);
    window.localStorage.setItem("dca.textScale", textScale);
    window.localStorage.setItem("dca.density", density);
    if (motionOverride === null) window.localStorage.removeItem("dca.motion");
    else window.localStorage.setItem("dca.motion", motionOverride ? "reduce" : "full");
  }, [density, motionOverride, textScale, theme]);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!query) return;
    const update = (event: MediaQueryListEvent | MediaQueryList) => setSystemLightTheme(event.matches);
    update(query);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

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
      if (index >= 0 && index < navigation.length) {
        const target = navigation[index][0];
        const requiresDemo = ["Workspace", "Changes", "Verify", "Report", "History"].includes(target);
        if (requiresDemo && !isDemo) return;
        event.preventDefault();
        setView(target);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDemo]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  };

  const chooseRepository = useCallback(async () => {
    if (repositorySelectionActive.current) return;
    repositorySelectionActive.current = true;
    const generation = ++repositorySelectionGeneration.current;
    const originError = repositoryError;
    setRepositoryError(null);
    setRepositorySelectionPhase("SELECTING");
    try {
      const path = await repositoryGateway.pickLocalDirectory();
      if (generation !== repositorySelectionGeneration.current) return;
      if (!path) {
        setRepositoryError(originError);
        return;
      }
      setRepositorySelectionPhase("VALIDATING");
      const summary = await repositoryGateway.inspectLocalRepository(path);
      if (generation !== repositorySelectionGeneration.current) return;
      reset();
      setRepository(summary);
      setRepositoryError(null);
      setRepositoryState("READY_READ_ONLY");
      setTask("");
      setView("Repository");
      setRepositoryOpen(true);
      setInspectorOpen(false);
    } catch (error) {
      if (generation !== repositorySelectionGeneration.current) return;
      reset();
      setRepository(null);
      setTask("");
      setView("Start");
      setRepositoryOpen(false);
      setInspectorOpen(false);
      setRepositoryError(friendlyRepositoryError(error));
      setRepositoryState("ERROR");
    } finally {
      if (generation === repositorySelectionGeneration.current) {
        repositorySelectionActive.current = false;
        setRepositorySelectionPhase("IDLE");
      }
    }
  }, [repositoryError, repositoryGateway, reset]);

  const enterDemo = useCallback(() => {
    setRepository(null);
    setRepositoryError(null);
    setRepositoryState("DEMO");
    setTask(demoTask);
    setView("Workspace");
    setRepositoryOpen(true);
    setInspectorOpen(true);
    reset();
  }, [reset]);

  const exitDemo = useCallback(() => {
    reset();
    setRepositoryState("EMPTY");
    setRepository(null);
    setTask("");
    setView("Start");
    setRepositoryOpen(false);
    setInspectorOpen(false);
  }, [reset]);

  const startDemo = useCallback(() => {
    if (canRun) start();
  }, [canRun, start]);

  const visibleVerification = projection.verification.length
    ? projection.verification
    : verification.map((stage) => ({ ...stage, status: "NOT_RUN" as const, durationMs: undefined, summary: "No runtime evidence recorded" }));

  const mappedView = view === "Changes" ? "Diff" : view === "Research" ? "Dashboard" : view;
  const showInspector = isDemo && inspectorOpen;
  const showRepository = (isDemo || isRepositoryReady) && repositoryOpen;
  const appClass = [
    "app", reducedMotion ? "reduce-motion" : "", capture ? `capture-mode capture-${capture.id}` : "",
    presentation ? `presentation-mode presentation-${presentation.id}` : "",
    capture?.hideComposer || presentation?.hideComposer ? "no-composer" : ""
  ].filter(Boolean).join(" ");
  const appStyle = { "--font-scale": Number(textScale) / 100 } as CSSProperties;

  const renderWorkspace = () => {
    if (view === "Start" || (view === "Repository" && !isRepositoryReady && !isDemo)) {
      if (isRepositoryReady && repository) {
        return <RepositoryReadyView repository={repository} onChoose={chooseRepository} acquisitionDisabled={repositoryBusy}/>;
      }
      return <StartView state={repositorySelectionPhase === "IDLE" ? repositoryState : repositorySelectionPhase} error={repositoryError} onChoose={chooseRepository} onDemo={enterDemo}/>;
    }
    if (isRepositoryReady && repository) {
      if (view === "Repository") return <RepositoryReadyView repository={repository} onChoose={chooseRepository} acquisitionDisabled={repositoryBusy}/>;
      if (["Settings", "Research", "Dashboard", "Experiments", "Capabilities", "Safety"].includes(view)) {
        return <WorkspaceView view={mappedView} projection={projection} verification={visibleVerification} reducedMotion={reducedMotion} onReplay={replay} onNotify={notify} onNavigate={setView} onRun={startDemo} visualizationState={visualizationState} theme={theme} textScale={textScale} density={density} motionOverride={motionOverride} onThemeChange={setTheme} onTextScaleChange={setTextScale} onDensityChange={setDensity} onMotionOverrideChange={setMotionOverride}/>;
      }
      return <RuntimeUnavailableView repository={repository}/>;
    }
    if (!isDemo && view === "Research") {
      return <WorkspaceView view="Dashboard" projection={projection} verification={visibleVerification} reducedMotion={reducedMotion} onReplay={replay} onNotify={notify} onNavigate={setView} onRun={startDemo} visualizationState={visualizationState} theme={theme} textScale={textScale} density={density} motionOverride={motionOverride} onThemeChange={setTheme} onTextScaleChange={setTextScale} onDensityChange={setDensity} onMotionOverrideChange={setMotionOverride}/>;
    }
    return <WorkspaceView view={mappedView} projection={projection} verification={visibleVerification} reducedMotion={reducedMotion} onReplay={replay} onNotify={notify} onNavigate={setView} onRun={startDemo} visualizationState={visualizationState} theme={theme} textScale={textScale} density={density} motionOverride={motionOverride} onThemeChange={setTheme} onTextScaleChange={setTextScale} onDensityChange={setDensity} onMotionOverrideChange={setMotionOverride}/>;
  };

  const workspaceTitle = view === "Start" ? (isRepositoryReady ? "Repository ready" : "Welcome") : view;
  const runCopy = isDemo
    ? projection.currentMessage
    : isRepositoryReady
      ? "Read-only repository connected · task runtime is not connected in this build"
      : "Choose a repository or enter the guided demo to begin";

  return <div className={appClass} data-theme={resolvedTheme} data-theme-preference={theme} data-density={density} style={appStyle}>
    <a className="skip-link" href="#workspace">Skip to workspace</a>
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Icon name="logo" size={18}/></span><span>Desk</span></div>
      <button className="repo-identity" aria-label={isDemo ? "Guided demo repository" : repository ? `Repository ${repository.name}, ${repository.branch}` : "Choose local repository"} onClick={isDemo || isRepositoryReady ? () => setRepositoryOpen((value) => !value) : chooseRepository} aria-expanded={isDemo || isRepositoryReady ? repositoryOpen : undefined} disabled={repositoryBusy}>
        <span className="repo-avatar">{isDemo ? "D" : repository?.name.charAt(0).toUpperCase() ?? "+"}</span>
        <span>
          <strong>{isDemo ? "Guided demo" : repository?.name ?? "Open repository"}</strong>
          <small>{isDemo ? <><Icon name="branch" size={12}/> demo · fixture</> : repository ? <><Icon name="branch" size={12}/> {repository.branch} · {repository.headSha.slice(0, 7)}</> : "Local Git folder"}</small>
        </span>
        <Icon name="chevron" className="down"/>
      </button>
      <div className="top-spacer"/>
      {capture && <div className="capture-chip">DETERMINISTIC CAPTURE</div>}
      {presentation && <div className="capture-chip">DETERMINISTIC PRESENTATION</div>}
      <div className="privacy-chip"><span className="status-dot good"/> Local only</div>
      <div className="model-status"><span className="model-glyph">Q</span><span><strong>Local model</strong><small>{isDemo ? "Fixture replay · zero model calls" : "Offline · no request"}</small></span></div>
      <button className="icon-button" aria-label="Open settings" onClick={() => setView("Settings")}><Icon name="settings"/></button>
    </header>

    {repositoryState === "DEMO" && <div className="demo-banner" role="status" aria-label="Guided demo mode"><span>DEMO DATA · NO REPOSITORY ACCESSED · ZERO MODEL CALLS</span><button onClick={exitDemo} disabled={repositoryBusy}>Exit demo</button></div>}

    <div className={`shell ${showRepository ? "" : "repo-closed"} ${showInspector ? "" : "inspector-closed"} ${repositoryState === "DEMO" ? "has-demo-banner" : ""}`}>
      <aside className="rail" aria-label="Primary navigation">
        <nav>{navigation.map(([label, icon], index) => {
          const shortcut = `Ctrl+${index + 1}`;
          const unavailable = ["Workspace", "Changes", "Verify", "Report", "History"].includes(label) && !isDemo;
          return <button key={label} className={view === label ? "active" : ""} onClick={() => setView(label)} disabled={unavailable} aria-current={view === label ? "page" : undefined} aria-label={`${label} (${shortcut})`} title={unavailable ? "Available in the guided demo until the task runtime is connected" : `${label} (${shortcut})`}><Icon name={icon} size={18}/><span>{label}</span></button>;
        })}</nav>
        <button className={view === "Settings" ? "active bottom" : "bottom"} onClick={() => setView("Settings")} aria-current={view === "Settings" ? "page" : undefined}><Icon name="settings" size={18}/><span>Settings</span></button>
      </aside>
      {showRepository && <RepositoryPanel repository={repository} demo={isDemo} onSelect={() => setView("Code")} onChoose={chooseRepository} acquisitionDisabled={repositoryBusy}/>}
      <main id="workspace" className="workspace" tabIndex={-1}>
        <div className="workspace-heading">
          <div><span className="eyebrow">{view === "Research" ? "Sealed evidence" : isDemo ? "Guided demo" : "Local workspace"}</span><h1>{workspaceTitle}</h1></div>
          <div className="heading-actions">
            {isDemo && (mappedView === "Flow" || mappedView === "Dashboard" || mappedView === "Workspace") && <button className="soft-button" onClick={replay}><Icon name="history"/> Replay demo</button>}
            {isDemo && <button className="icon-button" aria-label={inspectorOpen ? "Close inspector" : "Open inspector"} onClick={() => setInspectorOpen((value) => !value)}><Icon name="overview"/></button>}
          </div>
        </div>
        <div className="view-container">{renderWorkspace()}</div>
      </main>
      {showInspector && <Inspector projection={projection} selected={selectedEvidence} onSelect={setSelectedEvidence}/>}
    </div>

    {!capture?.hideComposer && !presentation?.hideComposer && <footer className="composer-wrap">
      <div className="run-summary"><span className={`run-state state-${isDemo ? projection.state.toLowerCase() : "created"}`}><span className="status-dot"/>{isDemo ? stateLabel[projection.state] : isRepositoryReady ? "Connected" : "Not ready"}</span><span className="run-copy">{runCopy}</span>{isDemo && <span className="run-progress"><i style={{ width: `${projection.progress}%` }}/></span>}</div>
      <div className="composer"><div className="composer-icon"><Icon name="logo"/></div><label className="sr-only" htmlFor="task">Task</label><textarea id="task" value={task} onChange={(event) => setTask(event.target.value)} rows={1} readOnly={isDemo} disabled={!isDemo} aria-describedby={isDemo ? "demo-task-contract" : undefined} placeholder={isDemo ? "Fixed guided-demo scenario" : "Task entry is unavailable until the selected-repository runtime is connected"}/><div className="contract-chips"><span id={isDemo ? "demo-task-contract" : undefined}>{isDemo ? "FIXED DEMO SCENARIO" : "REPORT ONLY"}</span><span><Icon name="shield" size={12}/> Mutation disabled</span><span>Local only</span></div>{running ? <button className="stop-button" onClick={cancel}><Icon name="stop" size={14}/> Stop</button> : <button className="run-button" onClick={startDemo} disabled={!canRun || !task.trim()} title={canRun ? "Replay the fixed deterministic guided demo" : "Task execution is not connected in this build"}><Icon name="play" size={14}/> Run</button>}</div>
    </footer>}
    {isDemo && projection.approval && <div className="approval-bar" role="region" aria-label="Approval required"><span className="approval-symbol">◇</span><div><strong>{projection.approval.action}</strong><small>Target: {projection.approval.target} · {projection.approval.scope} · {projection.approval.artifactHash}</small><em>{projection.approval.rollback}</em></div><button className="soft-button" onClick={() => notify("Exact artifact and scope verified")}>Review details</button><button className="deny-button" onClick={() => decideApproval(false)}>Deny</button><button className="approve-button" onClick={() => decideApproval(true)}>Approve once</button></div>}
    {toast && <div className="toast" role="status"><span className="status-dot good"/>{toast}</div>}
    {artifactPath && <div className="artifact-backdrop" onMouseDown={closeArtifact}><section ref={artifactDialog} className="artifact-dialog" role="dialog" aria-modal="true" aria-label="Canonical artifact" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="viz-kicker">READ-ONLY BUNDLED EVIDENCE</span><h2>Canonical artifact</h2><code>{artifactPath}</code></div><button ref={artifactCloseButton} className="icon-button" aria-label="Close artifact" onClick={closeArtifact}><Icon name="close"/></button></header>{artifact ? <pre>{JSON.stringify(artifact.data, null, 2)}</pre> : <div className="visual-state error">Artifact is not part of the canonical bundled allowlist.</div>}</section></div>}
  </div>;
}

function StartView({ state, error, onChoose, onDemo }: {
  state: RepositoryState;
  error: string | null;
  onChoose: () => void;
  onDemo: () => void;
}) {
  const busy = state === "SELECTING" || state === "VALIDATING";
  return <section className="onboarding-view">
    <article className="onboarding-hero">
      <span className="section-kicker">PRIVATE BY DEFAULT · READ ONLY</span>
      <h2>Start with a repository</h2>
      <p>Choose a Git repository folder already on this computer. Your source stays where it is, is never uploaded, and Desk will not modify it.</p>
      <div className="onboarding-actions">
        <button className="run-button inline-action" onClick={onChoose} disabled={busy}>{state === "SELECTING" ? "Waiting for folder…" : state === "VALIDATING" ? "Checking repository…" : error ? "Choose another folder" : "Choose local folder"}</button>
        <button className="soft-button" onClick={onDemo} disabled={busy}>Try guided demo</button>
      </div>
      {busy && <div className="onboarding-progress" role="status"><span className="status-dot good"/>{state === "SELECTING" ? "Choose a folder in the desktop dialog" : "Reading observed HEAD metadata and a bounded file manifest"}</div>}
      {error && <div className="onboarding-error" role="alert"><strong>We could not open that folder.</strong><span>{error}</span></div>}
    </article>
    <div className="onboarding-steps" aria-label="Getting started">
      <article><b>1</b><div><strong>Choose a local Git folder</strong><p>Desk observes HEAD metadata and a bounded list of files.</p></div></article>
      <article><b>2</b><div><strong>Confirm the safety boundary</strong><p>Local-only mode stays on. Repository mutation stays disabled.</p></div></article>
      <article><b>3</b><div><strong>Review observed repository facts</strong><p>Review the name, repository-reported branch and HEAD, manifests, and bounded file list. Worktree status stays not checked for safety.</p></div></article>
    </div>
    <div className="task-examples"><span>Explore the guided demo</span>{[
      "Explain the architecture and show the supporting files",
      "Find the likely cause of a failing test without changing code",
      "Review a proposed patch and list the verification still needed"
    ].map((example) => <button key={example} onClick={onDemo} disabled={busy} title="Open this fixture-only workflow in the guided demo">{example}</button>)}</div>
    <aside className="github-guidance"><Icon name="branch" size={18}/><div><strong>Repository on GitHub?</strong><p>Clone it first with Git or GitHub Desktop, then choose the local folder. Network cloning is not available in this build.</p></div></aside>
  </section>;
}

function RepositoryReadyView({ repository, onChoose, acquisitionDisabled }: { repository: RepositorySummary; onChoose: () => void; acquisitionDisabled: boolean }) {
  return <section className="repository-ready-view">
    <header><span className="ready-mark">✓</span><div><span className="section-kicker">READ-ONLY REPOSITORY</span><h2>Read-only repository connected</h2><p>Desk observed repository-reported HEAD metadata and created a bounded local file manifest. No source was uploaded or changed.</p></div></header>
    <div className="repository-facts"><article><span>Repository</span><strong>{repository.name}</strong><small>Working tree status not inspected for safety</small></article><article><span>Observed HEAD</span><strong>{repository.branch}</strong><small>{repository.headSha.slice(0, 12)} · untrusted metadata</small></article><article><span>Observed files</span><strong>{repository.fileCount}</strong><small>{repository.manifestFiles.length ? `${repository.manifestFiles.length} project manifest${repository.manifestFiles.length === 1 ? "" : "s"}` : "No recognized project manifest"}</small></article></div>
    <div className="repository-boundary"><Icon name="shield" size={20}/><div><strong>What is available now</strong><p>You can inspect observed HEAD metadata and a bounded file manifest. Desk does not validate the referenced Git object. Task execution and semantic indexing are not connected, so Run remains disabled.</p></div><button className="soft-button" onClick={onChoose} disabled={acquisitionDisabled}>Switch repository</button></div>
  </section>;
}

function RuntimeUnavailableView({ repository }: { repository: RepositorySummary }) {
  return <section className="unavailable-view"><span className="unavailable-icon"><Icon name="shield" size={24}/></span><span className="section-kicker">HONEST CAPABILITY BOUNDARY</span><h2>Task runtime is not connected yet</h2><p><strong>{repository.name}</strong> is safely connected read-only, but this desktop build cannot run analysis against it yet. Use Repository to inspect what was observed, or open the explicit guided demo to learn the workflow.</p><div><span>Repository access: READY</span><span>Mutation: DISABLED</span><span>Model calls: 0</span></div></section>;
}

function RepositoryPanel({ repository, demo, onSelect, onChoose, acquisitionDisabled }: { repository: RepositorySummary | null; demo: boolean; onSelect: () => void; onChoose: () => void; acquisitionDisabled: boolean }) {
  const [filter, setFilter] = useState("");
  const filterInput = useRef<HTMLInputElement | null>(null);
  const demoFiles = fileTree.filter((item) => item.name.toLowerCase().includes(filter.toLowerCase()));
  const repositoryFiles = (repository?.files ?? []).filter((item) => item.toLowerCase().includes(filter.toLowerCase()));
  useEffect(() => {
    const focusFilter = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "p") return;
      event.preventDefault();
      filterInput.current?.focus();
    };
    window.addEventListener("keydown", focusFilter);
    return () => window.removeEventListener("keydown", focusFilter);
  }, []);
  return <aside className="repository-panel" aria-label="Repository files">
    <div className="panel-heading"><span>Files</span><button onClick={onChoose} disabled={acquisitionDisabled}>{demo ? "Open local repo" : "Switch"}</button></div>
    <label className="search"><Icon name="search" size={14}/><input ref={filterInput} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter files" aria-label="Filter repository files"/><kbd>Ctrl+P</kbd></label>
    <div className="tree-meta"><span>{demo ? "GUIDED DEMO" : repository?.name.toUpperCase()}</span><small>{demo ? "Fixture" : `${repository?.fileCount ?? 0} files`}</small></div>
    <div className="file-tree" aria-label="Repository file manifest">{demo ? demoFiles.slice(0, 200).map((item, index) => <button key={`${item.name}-${index}`} style={{ paddingLeft: 12 + item.depth * 14 }} className={item.name === "App.tsx" ? "selected" : ""} onClick={onSelect}><Icon name={item.kind === "folder" ? "chevron" : "code"} size={12}/><span className={`file-icon ${item.kind}`}>{item.kind === "folder" ? "" : item.kind.toUpperCase()}</span><span>{item.name}</span></button>) : repositoryFiles.slice(0, 200).map((path) => <div className="file-manifest-row" key={path}><Icon name="code" size={12}/><span>{path}</span></div>)}</div>
    <div className="index-card"><div><span className="status-dot good"/><strong>{demo ? "Demo snapshot" : "Connected read-only"}</strong></div><p>{demo ? "Fixture data · no repository accessed" : `Observed HEAD ${repository?.headSha.slice(0, 7)} · worktree not checked`}</p><small>{demo ? "Zero model calls" : "Untrusted metadata · bounded file manifest"}</small></div>
  </aside>;
}

function Inspector({ projection, selected, onSelect }: { projection: ReturnType<typeof initialProjection>; selected: typeof evidence[number]; onSelect: (item: typeof evidence[number]) => void }) {
  const [tab, setTab] = useState("Evidence");
  const items = projection.evidence.length ? projection.evidence : evidence;
  return <aside className="inspector"><div className="inspector-tabs" role="tablist" aria-label="Demo inspector">{["Evidence", "Activity", "Details"].map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item}{item === "Evidence" && <span>{items.length}</span>}</button>)}</div>{tab === "Evidence" ? <><div className="inspector-section current"><span className="section-kicker">DEMO CURRENT FOCUS</span><div className="focus-title"><span className="agent-avatar">A</span><span><strong>{projection.currentSkill ?? "R08 Evidence Retrieval"}</strong><small>{projection.activeAgent ?? "Repo Analyst"} · {stateLabel[projection.state]}</small></span></div><div className="budget"><span>Fixture context</span><span>4.8K / 12K</span><i><b style={{ width: "40%" }}/></i></div></div><div className="inspector-section"><div className="section-head"><span className="section-kicker">DEMO EVIDENCE</span><span>confidence</span></div>{items.map((item) => <button className={`evidence-row ${selected.id === item.id ? "active" : ""}`} key={item.id} onClick={() => onSelect(item)}><span className="evidence-kind">TS</span><span><strong>{item.path.split("/").at(-1)}</strong><small>{item.path}<br/>Lines {item.startLine}–{item.endLine}</small></span><b>{Math.round(item.confidence * 100)}%</b></button>)}</div><div className="inspector-section evidence-detail"><div><span className="section-kicker">PROVENANCE</span><span className="verified-label">✓ Demo fixture</span></div><dl><dt>Evidence ID</dt><dd>{selected.id}</dd><dt>Source hash</dt><dd><code>{selected.hash}</code></dd><dt>Retrieved by</dt><dd>fixture replay</dd><dt>Trust</dt><dd>Untrusted source data</dd></dl></div></> : <div className="empty-tab"><Icon name={tab === "Activity" ? "history" : "overview"} size={24}/><strong>{tab}</strong><p>{tab === "Activity" ? `${projection.events.length} typed demo events in this replay.` : "Select a demo node or artifact for structured details."}</p></div>}</aside>;
}
