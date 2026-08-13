# Module Interfaces

## AgentRuntime

```python
start_run(contract: TaskContract) -> RunHandle
submit_user_decision(run_id, decision: ApprovalDecision) -> None
cancel_run(run_id) -> CancellationResult
subscribe_events(run_id) -> AsyncIterator[AgentEvent]
get_artifact(id) -> Artifact
```

Owns routing, state, Skills, context, approvals and recovery. It does not parse source code or perform model inference directly.

## ModelGateway

```python
health() -> ModelHealth
complete(request: StructuredModelRequest) -> StructuredModelResponse
stream(request) -> AsyncIterator[ModelChunk]
cancel(request_id) -> CancelResult
metrics() -> ModelMetrics
```

Owns vLLM lifecycle/client, model profiles, queues, structured outputs and token metrics.

## RepoIntelligence

```python
acquire(locator, policy) -> WorkspaceManifest
fingerprint(workspace) -> RepoFingerprint
build_map(workspace) -> CodebaseMapManifest
retrieve(query, budget) -> EvidenceBundle
invalidate(changes) -> IndexUpdate
```

Internal adapters: ripgrep, Tree-sitter, AST, optional LSP, Git, SQLite.

## ToolRuntime

```python
execute(tool_request, policy_snapshot) -> ToolResult
cancel(tool_call_id) -> CancelResult
```

Owns schema validation, sandbox, path/network/timeout/resource enforcement and auditing.

## VerificationRuntime

```python
plan(contract, fingerprint, patch_plan) -> VerificationPlan
run_stage(stage_id) -> VerificationStageResult
run_required() -> VerificationResult
```

Only trusted command templates; no LLM arbitrary shell.

## EventStore

```python
append(event) -> sequence
subscribe(run_id, after_sequence) -> stream
replay(run_id) -> RunProjection
finalize(run_id) -> RunSummary
```

Append-only, typed, redacted and backpressured.
