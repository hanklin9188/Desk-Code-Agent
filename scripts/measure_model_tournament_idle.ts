import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { link, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = path.resolve(process.cwd());
const runtime = path.join(root, ".runtime/model");
const candidateId = process.argv.find((value) => value.startsWith("--candidate="))?.slice(12);
if (candidateId !== "M1") throw new Error("Idle telemetry supplement is authorized only for M1 instrumentation correction");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
async function publish(target:string,contents:string){await mkdir(path.dirname(target),{recursive:true});const pending=`${target}.next.${process.pid}.${randomUUID()}`;const handle=await open(pending,"wx",0o600);try{await handle.writeFile(contents);await handle.sync();}finally{await handle.close();}try{await link(pending,target);}finally{await unlink(pending).catch(()=>undefined);}}
const manifest=JSON.parse(await readFile(path.join(root,"benchmarks/model-specialization/MODEL_TOURNAMENT_CANDIDATE_MANIFEST.v1.json"),"utf8"));
const selected=manifest.candidates.find((item:any)=>item.candidateId===candidateId);
const key=(await readFile(path.join(runtime,"tournament-api-key"),"utf8")).trim();
const start=JSON.parse(await readFile(path.join(runtime,"tournament-start.json"),"utf8"));
const deadline=Date.now()+12*60_000;let ready=false;
while(Date.now()<deadline){try{const response=await fetch("http://127.0.0.1:8000/v1/models",{headers:{authorization:`Bearer ${key}`},signal:AbortSignal.timeout(1500)});const body=await response.json() as any;if(response.ok&&body.data?.length===1&&body.data[0].id===selected.modelId){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
if(!ready)throw new Error("M1 telemetry reload did not become ready");
await writeFile(path.join(runtime,"tournament-ready.json"),`${JSON.stringify({schemaVersion:1,candidateId,readyEpochMs:Date.now(),loadTimeMs:Date.now()-start.startedEpochMs})}\n`,{flag:"wx",mode:0o600});
const samples:number[]=[];for(let index=0;index<5;index++){const{stdout}=await exec("nvidia-smi",["--query-gpu=memory.used","--format=csv,noheader,nounits"]);samples.push(Number(stdout.trim()));await new Promise(resolve=>setTimeout(resolve,500));}
if(samples.some(value=>!Number.isInteger(value)||value<=0))throw new Error("Invalid idle VRAM samples");
const value={schemaVersion:1,supplementId:"dca-practical-local-model-tournament-m1-idle-vram-supplement-v1",status:"PASS_NO_INFERENCE_CALLS",classification:"SESSION_B_TELEMETRY_INSTRUMENTATION_CORRECTION",completedAt:new Date().toISOString(),candidateId,reason:"M1_SMOKE_V1_SELECTED_FIRST_NONZERO_LOAD_SAMPLE_INSTEAD_OF_POST_SMOKE_IDLE_SAMPLE",modelEndpointCalls:0,loadTimeMs:Date.now()-start.startedEpochMs,idleVramMiBSamples:samples,idleVramMiBMedian:[...samples].sort((a,b)=>a-b)[Math.floor(samples.length/2)],sourceSmoke:{path:"docs/experiments/model-specialization/tournament-session-b/M1_SMOKE.v1.json",sha256:"17ed5e3377cf478ab9097955456acfb526eb2362446e955dfbf4a969c94dfd34"},protectedActions:{primaryHoldoutCalls:false,otherModelDownload:false,precisionFallback:false,sudo:false,commit:false,remote:false,push:false,pullRequest:false,tag:false,release:false,signing:false}};
const body=`${JSON.stringify(value,null,2)}\n`,relative="docs/experiments/model-specialization/tournament-session-b/M1_IDLE_VRAM_SUPPLEMENT.v1.json",target=path.join(root,relative);await publish(target,body);await publish(`${target}.sha256`,`${sha256(body)}  ${path.basename(target)}\n`);process.stdout.write(`${JSON.stringify({artifact:{path:relative,sha256:sha256(body)},idleVramMiBMedian:value.idleVramMiBMedian,samples},null,2)}\n`);
