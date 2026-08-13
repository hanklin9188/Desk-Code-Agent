import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { link, lstat, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = path.resolve(process.cwd());
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
async function publish(target:string,contents:string){await mkdir(path.dirname(target),{recursive:true});try{const s=await lstat(target);if(!s.isFile()||s.isSymbolicLink()||await readFile(target,"utf8")!==contents)throw new Error(`Immutable collision ${target}`);return;}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}const pending=`${target}.next.${process.pid}.${randomUUID()}`,handle=await open(pending,"wx",0o600);try{await handle.writeFile(contents);await handle.sync();}finally{await handle.close();}try{await link(pending,target);}finally{await unlink(pending).catch(()=>undefined);}}
async function verified(relative:string){const target=path.join(root,relative),[bytes,s,ss]=await Promise.all([readFile(target),lstat(target),lstat(`${target}.sha256`)]),digest=sha256(bytes);if(!s.isFile()||s.isSymbolicLink()||!ss.isFile()||ss.isSymbolicLink()||await readFile(`${target}.sha256`,"utf8")!==`${digest}  ${path.basename(target)}\n`)throw new Error(`Invalid artifact ${relative}`);return{path:relative,sha256:digest,value:JSON.parse(bytes.toString("utf8")) as any};}

const sessionA=await verified("docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_A.v1.json");
if(sessionA.sha256!=="9d6a610829405f146ee36651961273bd25c9d6264a1c54c1e20917e186af7200"||sessionA.value.status!=="PASS")throw new Error("Session A drift");
const candidateIds=["M1","M2","M3"] as const;
const candidates=[] as any[];
const requestIntentDigests:string[]=[];
for(const candidateId of candidateIds){
  const acquisition=await verified(`docs/experiments/model-specialization/tournament-session-b/${candidateId}_ACQUISITION.v1.json`);
  const smoke=await verified(`docs/experiments/model-specialization/tournament-session-b/${candidateId}_SMOKE.v1.json`);
  const cleanup=await verified(`docs/experiments/model-specialization/tournament-session-b/${candidateId}_CLEANUP.v1.json`);
  if(!String(acquisition.value.status).startsWith("PASS_")||smoke.value.status!=="PASS_RUNTIME_PENDING_SHUTDOWN_CLEANUP"||cleanup.value.status!=="PASS_FULLY_CLEANED")throw new Error(`${candidateId} evidence status failed`);
  if(smoke.value.candidate.candidateId!==candidateId||cleanup.value.candidateId!==candidateId||cleanup.value.inputs.smoke.sha256!==smoke.sha256)throw new Error(`${candidateId} evidence lineage failed`);
  if(smoke.value.telemetry.endpointRequests!==10||smoke.value.telemetry.completedStructuredSmokeCalls!==6||smoke.value.checks.p2JsonSchema!=="PASS")throw new Error(`${candidateId} smoke count/compatibility failed`);
  if(smoke.value.fairness.candidateSpecificPrompt||smoke.value.fairness.candidateSpecificDecoding||smoke.value.fairness.profile!=="fp8_per_tensor")throw new Error(`${candidateId} fairness failed`);
  requestIntentDigests.push(smoke.value.fairness.requestIntentsSha256);
  if(cleanup.value.checks.modelProcessCount!==0||!cleanup.value.checks.port8000Clear||cleanup.value.checks.gpuMemoryMiB!==0||!cleanup.value.checks.ephemeralApiKeyAbsent||!cleanup.value.checks.stateFilesRemoved)throw new Error(`${candidateId} cleanup failed`);
  let idleVramMiB=smoke.value.telemetry.idleVramMiB,idleEvidence={path:smoke.path,sha256:smoke.sha256,measurement:"POST_SMOKE_IDLE"};
  const supplements:any={};
  if(candidateId==="M1"){
    const failure=await verified("docs/experiments/model-specialization/tournament-session-b/M1_PRECALL_LAUNCH_FAILURE.v1.json");
    const supplement=await verified("docs/experiments/model-specialization/tournament-session-b/M1_IDLE_VRAM_SUPPLEMENT.v1.json");
    const telemetryCleanup=await verified("docs/experiments/model-specialization/tournament-session-b/M1_TELEMETRY_CLEANUP.v1.json");
    if(failure.value.modelEndpointCalls!==0||failure.value.cleanup.gpuMemoryMiB!==0||supplement.value.modelEndpointCalls!==0||supplement.value.status!=="PASS_NO_INFERENCE_CALLS"||telemetryCleanup.value.status!=="PASS_FULLY_CLEANED")throw new Error("M1 diagnostic/supplement failed");
    idleVramMiB=supplement.value.idleVramMiBMedian;
    idleEvidence={path:supplement.path,sha256:supplement.sha256,measurement:"FIVE_SAMPLE_MEDIAN_ON_SEPARATE_ZERO_INFERENCE_RELOAD"};
    Object.assign(supplements,{precallFailure:{path:failure.path,sha256:failure.sha256},idleTelemetry:{path:supplement.path,sha256:supplement.sha256},telemetryCleanup:{path:telemetryCleanup.path,sha256:telemetryCleanup.sha256}});
  }
  candidates.push({candidateId,modelId:smoke.value.candidate.modelId,revision:smoke.value.candidate.revision,outcome:"READY_FOR_SESSION_C_PRIMARY_SCREENING",licenseAndProvenanceStatus:acquisition.value.status,sourcePrecision:"BF16",runtimePrecision:"FP8_PER_TENSOR_W8A8",artifacts:{acquisition:{path:acquisition.path,sha256:acquisition.sha256},smoke:{path:smoke.path,sha256:smoke.sha256},cleanup:{path:cleanup.path,sha256:cleanup.sha256},...supplements},telemetry:{loadTimeMs:smoke.value.telemetry.loadTimeMs,idleVramMiB,idleEvidence,peakVramMiB:smoke.value.telemetry.peakVramMiB,ttftMs:smoke.value.telemetry.ttftMs,streamLatencyMs:smoke.value.telemetry.streamLatencyMs,generationThroughputTokensPerSecond:smoke.value.telemetry.generationThroughputTokensPerSecond,queueLatencyMs:smoke.value.telemetry.queueLatencyMs,endpointRequests:smoke.value.telemetry.endpointRequests},checks:smoke.value.checks});
}
const intentDigests=[...new Set(requestIntentDigests)];
if(intentDigests.length!==1)throw new Error("Cross-candidate request intent drift");
const {stdout:processes}=await exec("ps",["-eo","args="]),{stdout:sockets}=await exec("ss",["-ltn"]),{stdout:gpu}=await exec("nvidia-smi",["--query-gpu=memory.used","--format=csv,noheader,nounits"]);
const modelProcesses=processes.split("\n").filter(line=>/launch_model_tournament_candidate|vllm\.entrypoints/.test(line)&&!line.includes("finalize_model_tournament_session_b"));
const port8000Clear=!sockets.split("\n").some(line=>/(?:^|:)8000\s/.test(line)),gpuMemoryMiB=Number(gpu.trim());
const forbiddenState=["tournament-api-key","tournament-start.json","tournament-launch.json","tournament-ready.json"];
const stateAbsent=[] as boolean[];for(const name of forbiddenState){try{await lstat(path.join(root,".runtime/model",name));stateAbsent.push(false);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")stateAbsent.push(true);else throw error;}}
if(modelProcesses.length||!port8000Clear||gpuMemoryMiB!==0||!stateAbsent.every(Boolean))throw new Error("Session-B boundary cleanup failed");
const sources=["scripts/verify_model_tournament_snapshot.ts","scripts/start_model_tournament_candidate.sh","scripts/launch_model_tournament_candidate.py","scripts/run_model_tournament_smoke.ts","scripts/record_model_tournament_precall_failure.ts","scripts/measure_model_tournament_idle.ts","scripts/record_model_tournament_cleanup.ts","scripts/finalize_model_tournament_session_b.ts"];
const sourceClosure=[];for(const relative of sources){const bytes=await readFile(path.join(root,relative));sourceClosure.push({path:relative,sha256:sha256(bytes),bytes:bytes.byteLength});}
const value={schemaVersion:1,sessionId:"dca-practical-local-model-tournament-session-b-v1",session:"B",status:"PASS",classification:"EXACT_ACQUISITION_AND_NON_PRIMARY_COMPATIBILITY_VALIDATION",completedAt:new Date().toISOString(),contract:{sessionA:{path:sessionA.path,sha256:sessionA.sha256},candidateCount:3,authorizedExactSnapshots:3,downloadedExactSnapshots:3,otherSnapshotsDownloaded:0,sourcePrecision:"BF16",runtimePrecision:"VLLM_ONLINE_FP8_PER_TENSOR_W8A8",primaryTournamentCalls:0,nonPrimaryEndpointRequests:30,m1TelemetrySupplementEndpointCalls:0,requestIntentsSha256:intentDigests[0],candidateSpecificPrompt:false,candidateSpecificDecoding:false,automaticFallback:false,contextLength:8192,eMinV2Changed:false,c1Changed:false,eEditP2Changed:false,productMutationDecision:"KEEP_MUTATION_DISABLED"},candidates,sourceClosure,cleanup:{modelProcessCount:modelProcesses.length,port8000Clear,gpuMemoryMiB,ephemeralApiKeyAndStateAbsent:stateAbsent.every(Boolean)},nextSession:{session:"C",status:"READY_SEPARATE_INVOCATION_REQUIRED",executedInThisInvocation:false},privacy:{rawPromptsStored:false,rawModelOutputsStored:false,apiKeysStored:false},protectedActions:{sessionC:false,primaryHoldoutCalls:false,otherModelDownload:false,preQuantizedSnapshotDownload:false,automaticPrecisionFallback:false,dependencyInstall:false,sudo:false,commit:false,remote:false,push:false,pullRequest:false,tag:false,release:false,signing:false}};
const body=`${JSON.stringify(value,null,2)}\n`,relative="docs/experiments/model-specialization/MODEL_TOURNAMENT_SESSION_B.v1.json",target=path.join(root,relative);await publish(target,body);await publish(`${target}.sha256`,`${sha256(body)}  ${path.basename(target)}\n`);process.stdout.write(`${JSON.stringify({status:value.status,artifact:{path:relative,sha256:sha256(body)},requestIntentsSha256:intentDigests[0],candidates:candidates.map(item=>({candidateId:item.candidateId,outcome:item.outcome,telemetry:item.telemetry})),cleanup:value.cleanup,nextSession:value.nextSession},null,2)}\n`);
