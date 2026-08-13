import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const outputRoot = path.join(root, "benchmarks/g4-development");
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const attestationPath = path.join(outputRoot, "G3_IMMUTABLE_HOLDOUT_ATTESTATION.json");
const attestationBytes = await readFile(attestationPath);
const attestationExpected = (await readFile(`${attestationPath}.sha256`, "utf8")).trim().split(/\s+/)[0];
if (sha256(attestationBytes) !== attestationExpected) throw new Error("G3 immutability attestation checksum mismatch");

type Repository = {
  id: string; commit_sha: string; split_role: string; ecosystem: string; selection_provenance: string;
  readme_path: string; entry_path: string; source_path: string; test_path: string; build_path: string;
  dependency_manifest: string; license_path: string; test_commands_detected: string[]; build_commands_detected: string[];
};
const repositoryDocument = JSON.parse(await readFile(path.join(root, "benchmarks/g3/g3_repository_manifest.json"), "utf8")) as { repositories: Repository[] };
const repositoryTasks: Array<Record<string, unknown>> = [];
const repositoryOracles: Array<Record<string, unknown>> = [];
const scenarioAngles = [
  "a new contributor has only a clean checkout and cannot install undeclared tools",
  "the change must remain compatible with the public typed API and current package scripts",
  "the report will be handed to a maintainer who requires a reproducible command boundary",
  "the first action must be reversible and cannot assume network access",
  "the risk review prioritizes memory and binary compatibility boundaries",
  "the maintainer needs module ownership separated from build-system facts",
  "the investigation must distinguish generated artifacts from authoritative source",
  "the repository has multiple packages and the package boundary must remain explicit",
  "the suspected regression occurs only at an input boundary and lacks a stack trace",
  "the result must separate library behavior from command-line behavior",
  "the handoff must identify a narrow test seam before any source mutation",
  "the reviewer requires license and dependency claims to cite different authorities",
  "the change request is ambiguous between transport and domain layers",
  "the verification budget permits one focused command and no broad installation",
  "the repository mixes platform automation with portable library behavior",
  "the proposed starter issue must avoid release and publication machinery",
  "the investigation must account for feature-gated behavior without enabling features",
  "the maintainer needs a dependency direction map before approving file scope",
  "the task may cross serialization and I/O boundaries but must name a stopping rule",
  "the candidate change must preserve existing error semantics and public naming",
  "the evidence packet must fit a bounded context and explicitly list omitted evidence",
  "the diagnosis must distinguish a test fixture issue from implementation behavior",
  "the plan must keep documentation claims separate from executable verification",
  "the local assessment may inspect automation but cannot trigger external workflows"
];
const families = [
  { family: "onboarding_synthesis", category: "repository_onboarding", difficulty: "L3", expected: "ANSWER", evidence: (r: Repository) => [r.readme_path, r.dependency_manifest, r.license_path], prompt: (r: Repository) => `Prepare a concise adoption brief for ${r.id}. Establish the project's boundary, the locally documented way to prepare it, and the license constraint. Cite repository evidence and label anything the files do not establish.` },
  { family: "ambiguous_action_location", category: "ambiguous_task_location", difficulty: "L3", expected: "REPORT_ONLY", evidence: (r: Repository) => [r.entry_path, r.source_path, r.test_path], prompt: (r: Repository) => `A maintainer reports that a request entering ${r.id} can reach the core implementation but its observable behavior is unclear. Locate the most defensible execution seam, its implementation neighbor, and the closest test surface; explain where investigation should start without editing.` },
  { family: "cross_file_plan", category: "cross_file_reasoning", difficulty: "L4", expected: "REPORT_ONLY", evidence: (r: Repository) => [r.entry_path, r.source_path, r.test_path, r.build_path], prompt: (r: Repository) => `Design a reversible multi-file change plan for ${r.id}: adjust one behavior at the main source boundary, cover it at the existing test seam, and preserve the repository's validation contract. Order the files and checks; do not claim execution.` },
  { family: "diagnosis_workflow", category: "long_horizon_diagnosis", difficulty: "L4", expected: "REPORT_ONLY", evidence: (r: Repository) => [r.source_path, r.test_path, r.build_path], prompt: (r: Repository) => `An intermittent regression in ${r.id} has no trustworthy stack trace. From local source, test, and automation evidence, give one falsifiable first hypothesis, the smallest red-signal probe, and the evidence that would trigger exactly one revised hypothesis.` },
  { family: "hidden_test_strategy", category: "hidden_test_generalization", difficulty: "L3", expected: "REPORT_ONLY", evidence: (r: Repository) => [r.source_path, r.test_path], prompt: (r: Repository) => `For the behavior represented by ${r.id}'s selected implementation and test surfaces, identify two boundary cases a hidden verifier should exercise, distinguish them from the visible test pattern, and tie each case to exact local evidence.` },
  { family: "dependency_boundary", category: "evidence_integration", difficulty: "L3", expected: "ANSWER", evidence: (r: Repository) => [r.dependency_manifest, r.build_path, r.entry_path], prompt: (r: Repository) => `Explain how dependency metadata, automation, and the execution entry of ${r.id} constrain a safe local change. Separate facts visible in files from commands that would still need to run.` },
  { family: "contributor_start", category: "repository_onboarding", difficulty: "L2", expected: "ANSWER", evidence: (r: Repository) => [r.readme_path, r.test_path, r.build_path], prompt: (r: Repository) => `A contributor has forty-five minutes in ${r.id}. Give an evidence-backed reading order that reaches one testable seam, then state the first bounded verification action and one unresolved setup risk.` },
  { family: "implementation_contract", category: "open_ended_coding", difficulty: "L3", expected: "PATCH_PROPOSAL", evidence: (r: Repository) => [r.source_path, r.test_path, r.dependency_manifest], prompt: (r: Repository) => `Before proposing any patch to ${r.id}, derive a minimal implementation contract from the current source, nearest test, and package metadata: behavior to preserve, likely target, verification requirement, and stop condition when the oracle is insufficient.` }
] as const;

for (const [repoIndex, repository] of repositoryDocument.repositories.entries()) {
  for (const [familyIndex, family] of families.entries()) {
    const evidence = [...new Set(family.evidence(repository))];
    const taskId = `g4-dev-repo-${repository.id}-${family.family}-${sha256(`${repository.commit_sha}:${family.family}:g4-development-v2`).slice(0, 10)}`;
    const prompt = `${family.prompt(repository)} Operational constraint: ${scenarioAngles[repoIndex]}. Repository profile: ${repository.selection_provenance}; ecosystem ${repository.ecosystem}; detected local test contract ${repository.test_commands_detected.join(" then ") || "not declared"}.`;
    repositoryTasks.push({ task_id: taskId, dataset_role: "DEVELOPMENT_ONLY", repository_id: repository.id, repository_commit: repository.commit_sha, source_split: repository.split_role, ecosystem: repository.ecosystem, category: family.category, task_family: family.family, difficulty: family.difficulty, prompt, expected_outcome: family.expected, provenance: `independently authored from pinned ${repository.selection_provenance} repository metadata; G3 prompts were not transformed`, task_seed_slot: repoIndex * families.length + familyIndex });
    repositoryOracles.push({ task_id: taskId, required_evidence_paths: evidence, expected_outcome: family.expected, expected_components: family.family === "cross_file_plan" ? ["affected_files", "change_order", "dependencies", "required_tests"] : family.family === "diagnosis_workflow" ? ["root_cause_hypothesis", "rank", "evidence", "falsifier"] : family.family === "onboarding_synthesis" ? ["project_purpose", "install_procedure", "license", "evidence"] : ["evidence", "bounded_action", "uncertainty"], behavior_oracle: "NOT_APPLICABLE_READ_ONLY_TASK" });
  }
}

type PatchSpec = { name: string; prompt: string; before: string; fixed: string; visible: string; hidden: string; rootCause: string; behavior: string };
const patchSpecs: PatchSpec[] = [
  { name: "clamp-upper", prompt: "Make clamp honor the inclusive upper bound without changing its signature.", before: "export function clamp(value, min, max) { return Math.max(min, value); }\n", fixed: "export function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }\n", visible: "assert.equal(clamp(3, 0, 5), 3); assert.equal(clamp(8, 0, 5), 5);", hidden: "assert.equal(clamp(-2, 0, 5), 0); assert.equal(clamp(5, 0, 5), 5);", rootCause: "the implementation applies only the lower bound", behavior: "return min for values below min, max for values above max, otherwise value" },
  { name: "median-even", prompt: "Correct median for even-length numeric inputs while preserving odd-length behavior and input immutability.", before: "export function median(values) { const v=[...values].sort((a,b)=>a-b); return v[Math.floor(v.length/2)]; }\n", fixed: "export function median(values) { const v=[...values].sort((a,b)=>a-b); const m=Math.floor(v.length/2); return v.length%2 ? v[m] : (v[m-1]+v[m])/2; }\n", visible: "assert.equal(median([3,1,2]), 2); assert.equal(median([1,4,2,3]), 2.5);", hidden: "const x=[9,1]; assert.equal(median(x),5); assert.deepEqual(x,[9,1]);", rootCause: "even-length inputs select the upper middle element instead of averaging both middle elements", behavior: "odd median is middle; even median is average of two middle values; do not mutate input" },
  { name: "stable-unique", prompt: "Return the first occurrence of each value and keep original order.", before: "export function unique(values) { return [...new Set(values)].sort(); }\n", fixed: "export function unique(values) { return [...new Set(values)]; }\n", visible: "assert.deepEqual(unique(['b','a','b']), ['b','a']);", hidden: "assert.deepEqual(unique([3,1,3,2]), [3,1,2]);", rootCause: "an unnecessary sort destroys first-occurrence order", behavior: "deduplicate using SameValueZero semantics while retaining encounter order" },
  { name: "chunk-tail", prompt: "Make chunk retain the final partial group and reject non-positive sizes.", before: "export function chunk(values,size){ const out=[]; for(let i=0;i+size<=values.length;i+=size) out.push(values.slice(i,i+size)); return out; }\n", fixed: "export function chunk(values,size){ if(!Number.isInteger(size)||size<=0) throw new RangeError('size'); const out=[]; for(let i=0;i<values.length;i+=size) out.push(values.slice(i,i+size)); return out; }\n", visible: "assert.deepEqual(chunk([1,2,3],2), [[1,2],[3]]);", hidden: "assert.throws(()=>chunk([1],0),RangeError); assert.deepEqual(chunk([],2),[]);", rootCause: "the loop excludes a partial tail and accepts an invalid step", behavior: "partition all items; final group may be short; positive integer size required" },
  { name: "palindrome-normalize", prompt: "Treat punctuation and case as insignificant when checking palindromes.", before: "export function isPalindrome(text){ return text === [...text].reverse().join(''); }\n", fixed: "export function isPalindrome(text){ const value=text.toLowerCase().replace(/[^a-z0-9]/g,''); return value === [...value].reverse().join(''); }\n", visible: "assert.equal(isPalindrome('Race car'), true);", hidden: "assert.equal(isPalindrome('A man, a plan, a canal: Panama!'),true); assert.equal(isPalindrome('codex'),false);", rootCause: "comparison uses raw text without normalization", behavior: "compare lowercase ASCII alphanumeric characters only" },
  { name: "parse-port", prompt: "Accept canonical decimal TCP ports only and reject partial, zero, and out-of-range values.", before: "export function parsePort(value){ const n=parseInt(value,10); return n || null; }\n", fixed: "export function parsePort(value){ if(!/^[0-9]+$/.test(value)) return null; const n=Number(value); return n>=1&&n<=65535 ? n : null; }\n", visible: "assert.equal(parsePort('8080'),8080); assert.equal(parsePort('80x'),null);", hidden: "assert.equal(parsePort('0'),null); assert.equal(parsePort('65536'),null); assert.equal(parsePort('443'),443);", rootCause: "parseInt accepts partial strings and no range check exists", behavior: "return integer 1..65535 for digits-only strings, otherwise null" },
  { name: "retry-delay", prompt: "Implement capped exponential retry delay from a zero-based attempt number.", before: "export function retryDelay(attempt,base,cap){ return Math.min(cap, base*attempt); }\n", fixed: "export function retryDelay(attempt,base,cap){ return Math.min(cap, base*(2**attempt)); }\n", visible: "assert.equal(retryDelay(0,100,1000),100); assert.equal(retryDelay(2,100,1000),400);", hidden: "assert.equal(retryDelay(5,100,1000),1000);", rootCause: "delay is linear and returns zero for the first attempt", behavior: "min(cap, base times two to the zero-based attempt)" },
  { name: "join-url", prompt: "Join a base URL and path with exactly one boundary slash without changing the scheme.", before: "export function joinUrl(base,part){ return `${base}/${part}`.replace(/\\/+/g,'/'); }\n", fixed: "export function joinUrl(base,part){ return `${base.replace(/\\/+$/,'')}/${part.replace(/^\\/+/,'')}`; }\n", visible: "assert.equal(joinUrl('https://x.test/','/a'),'https://x.test/a');", hidden: "assert.equal(joinUrl('http://x.test','b'),'http://x.test/b');", rootCause: "global slash collapsing corrupts the URL scheme and does not isolate the join boundary", behavior: "preserve scheme and normalize only trailing/leading boundary slashes" },
  { name: "escape-regexp", prompt: "Escape every JavaScript regular-expression metacharacter in a literal string.", before: "export function escapeRegExp(value){ return value.replace(/[.*+?]/g,'\\\\$&'); }\n", fixed: "export function escapeRegExp(value){ return value.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&'); }\n", visible: "assert.equal(new RegExp(`^${escapeRegExp('a.b')}$`).test('a.b'),true); assert.equal(new RegExp(`^${escapeRegExp('a.b')}$`).test('axb'),false);", hidden: "assert.equal(new RegExp(`^${escapeRegExp('[a](b)?')}$`).test('[a](b)?'),true);", rootCause: "the character class omits several regex metacharacters", behavior: "escape . * + ? ^ $ { } ( ) | [ ] and backslash" },
  { name: "group-by", prompt: "Group all values by the supplied key without losing earlier group members.", before: "export function groupBy(values,key){ const out={}; for(const value of values) out[key(value)]=[value]; return out; }\n", fixed: "export function groupBy(values,key){ const out={}; for(const value of values) (out[key(value)]??=[]).push(value); return out; }\n", visible: "assert.deepEqual(groupBy([1,3,2],x=>x%2), {'0':[2],'1':[1,3]});", hidden: "assert.deepEqual(groupBy([],x=>x),{});", rootCause: "each assignment overwrites the existing group", behavior: "append values to groups in encounter order" },
  { name: "inclusive-range", prompt: "Sum every integer in an inclusive ascending range and return zero for an empty reversed range.", before: "export function sumRange(start,end){ let sum=0; for(let i=start;i<end;i++) sum+=i; return sum; }\n", fixed: "export function sumRange(start,end){ let sum=0; for(let i=start;i<=end;i++) sum+=i; return sum; }\n", visible: "assert.equal(sumRange(1,3),6);", hidden: "assert.equal(sumRange(4,4),4); assert.equal(sumRange(5,3),0);", rootCause: "the loop excludes the inclusive endpoint", behavior: "sum start through end inclusive when start <= end" },
  { name: "truncate-ellipsis", prompt: "Truncate to the requested total width, including the ellipsis, and leave short text unchanged.", before: "export function truncate(text,width){ return text.length>width ? text.slice(0,width)+'…' : text; }\n", fixed: "export function truncate(text,width){ if(text.length<=width) return text; if(width<=0) return ''; if(width===1) return '…'; return text.slice(0,width-1)+'…'; }\n", visible: "assert.equal(truncate('abcdef',4),'abc…');", hidden: "assert.equal(truncate('abc',3),'abc'); assert.equal(truncate('abc',1),'…');", rootCause: "ellipsis is appended after taking the full width", behavior: "result length never exceeds width; ellipsis occupies one character" },
  { name: "normalize-path", prompt: "Normalize repeated POSIX separators while preserving a leading root slash.", before: "export function normalizePath(value){ return value.split('/').filter(Boolean).join('/'); }\n", fixed: "export function normalizePath(value){ const rooted=value.startsWith('/'); const body=value.split('/').filter(Boolean).join('/'); return rooted ? '/'+body : body; }\n", visible: "assert.equal(normalizePath('/a//b'),'/a/b');", hidden: "assert.equal(normalizePath('a///b'),'a/b'); assert.equal(normalizePath('/'),'/');", rootCause: "filtering empty segments discards whether the path was rooted", behavior: "collapse repeated separators and preserve leading root state" },
  { name: "parse-bool", prompt: "Parse only explicit case-insensitive true/false strings and return null otherwise.", before: "export function parseBool(value){ return Boolean(value); }\n", fixed: "export function parseBool(value){ const v=value.toLowerCase(); return v==='true' ? true : v==='false' ? false : null; }\n", visible: "assert.equal(parseBool('false'),false); assert.equal(parseBool('TRUE'),true);", hidden: "assert.equal(parseBool('0'),null); assert.equal(parseBool(''),null);", rootCause: "string truthiness makes every non-empty value true", behavior: "true/false case-insensitive only; invalid values yield null" },
  { name: "format-bytes", prompt: "Format non-negative byte counts using a 1024 base and one decimal only when needed.", before: "export function formatBytes(n){ return `${(n/1000).toFixed(1)} KB`; }\n", fixed: "export function formatBytes(n){ if(n<1024) return `${n} B`; const value=n/1024; return `${Number(value.toFixed(1))} KiB`; }\n", visible: "assert.equal(formatBytes(1024),'1 KiB');", hidden: "assert.equal(formatBytes(512),'512 B'); assert.equal(formatBytes(1536),'1.5 KiB');", rootCause: "the implementation always uses decimal KB and mishandles sub-unit values", behavior: "bytes below 1024 use B; otherwise binary KiB rounded to one decimal" },
  { name: "intersection-multiplicity", prompt: "Return a stable set intersection without duplicate output values.", before: "export function intersection(left,right){ return left.filter(x=>right.includes(x)); }\n", fixed: "export function intersection(left,right){ const r=new Set(right); return [...new Set(left)].filter(x=>r.has(x)); }\n", visible: "assert.deepEqual(intersection([1,1,2],[1,2]),[1,2]);", hidden: "assert.deepEqual(intersection([3,2,1],[2,3]),[3,2]);", rootCause: "filter preserves duplicate members from the left input", behavior: "unique intersection in first-left-occurrence order" },
  { name: "decode-query", prompt: "Decode plus signs as spaces before percent-decoding a query component.", before: "export function decodeQuery(value){ return decodeURIComponent(value); }\n", fixed: "export function decodeQuery(value){ return decodeURIComponent(value.replace(/\\+/g,' ')); }\n", visible: "assert.equal(decodeQuery('hello+world'),'hello world');", hidden: "assert.equal(decodeQuery('a%2Bb'),'a+b');", rootCause: "application/x-www-form-urlencoded plus-space semantics are omitted", behavior: "replace plus with space, then percent-decode" },
  { name: "title-case", prompt: "Title-case words separated by arbitrary whitespace and emit single spaces.", before: "export function titleCase(value){ return value.split(' ').map(x=>x[0].toUpperCase()+x.slice(1)).join(' '); }\n", fixed: "export function titleCase(value){ return value.trim().split(/\\s+/).filter(Boolean).map(x=>x[0].toUpperCase()+x.slice(1).toLowerCase()).join(' '); }\n", visible: "assert.equal(titleCase('hello   WORLD'),'Hello World');", hidden: "assert.equal(titleCase('  two\\twords '),'Two Words');", rootCause: "literal-space splitting creates empty words and preserves inconsistent casing", behavior: "trim, split all whitespace, capitalize first and lowercase remainder" },
  { name: "safe-divide", prompt: "Return null for division by zero while preserving valid zero numerators.", before: "export function safeDivide(a,b){ return a && b ? a/b : null; }\n", fixed: "export function safeDivide(a,b){ return b===0 ? null : a/b; }\n", visible: "assert.equal(safeDivide(0,2),0); assert.equal(safeDivide(4,0),null);", hidden: "assert.equal(safeDivide(-6,3),-2);", rootCause: "truthiness rejects a valid zero numerator", behavior: "only a zero denominator is invalid" },
  { name: "rotate-array", prompt: "Rotate an array right by any integer distance without mutating the input.", before: "export function rotate(values,n){ return values.slice(-n).concat(values.slice(0,-n)); }\n", fixed: "export function rotate(values,n){ if(!values.length) return []; const k=((n%values.length)+values.length)%values.length; return k===0 ? [...values] : values.slice(-k).concat(values.slice(0,-k)); }\n", visible: "assert.deepEqual(rotate([1,2,3],4),[3,1,2]);", hidden: "const x=[1,2,3]; assert.deepEqual(rotate(x,-1),[2,3,1]); assert.deepEqual(x,[1,2,3]); assert.deepEqual(rotate([],2),[]);", rootCause: "distance is not normalized and empty/negative cases are mishandled", behavior: "normalize integer distance modulo length; negative means left; do not mutate" },
  { name: "binary-search", prompt: "Return the index of an exact target in a sorted array, including the final element, or -1.", before: "export function binarySearch(values,target){ let lo=0,hi=values.length-2; while(lo<=hi){ const m=(lo+hi)>>1; if(values[m]===target)return m; if(values[m]<target)lo=m+1;else hi=m-1; } return -1; }\n", fixed: "export function binarySearch(values,target){ let lo=0,hi=values.length-1; while(lo<=hi){ const m=(lo+hi)>>1; if(values[m]===target)return m; if(values[m]<target)lo=m+1;else hi=m-1; } return -1; }\n", visible: "assert.equal(binarySearch([1,3,5],1),0); assert.equal(binarySearch([1,3,5],4),-1);", hidden: "assert.equal(binarySearch([],1),-1); assert.equal(binarySearch([2],2),0); assert.equal(binarySearch([1,3,5],5),2);", rootCause: "the initial upper bound excludes the final array element", behavior: "standard exact binary search with inclusive bounds through length minus one" },
  { name: "merge-headers", prompt: "Merge headers case-insensitively so later values replace earlier casing variants.", before: "export function mergeHeaders(left,right){ return {...left,...right}; }\n", fixed: "export function mergeHeaders(left,right){ const out={}; for(const [k,v] of [...Object.entries(left),...Object.entries(right)]){ const prior=Object.keys(out).find(x=>x.toLowerCase()===k.toLowerCase()); if(prior) delete out[prior]; out[k]=v; } return out; }\n", visible: "assert.deepEqual(mergeHeaders({'Content-Type':'a'},{'content-type':'b'}),{'content-type':'b'});", hidden: "assert.deepEqual(mergeHeaders({Accept:'x'},{Other:'y'}),{Accept:'x',Other:'y'});", rootCause: "object spread treats header names as case-sensitive", behavior: "later case-insensitive key wins and supplies retained casing" },
  { name: "min-max", prompt: "Return both numeric extrema correctly for all-negative inputs and null for empty input.", before: "export function minMax(values){ if(!values.length)return null; return {min:Math.min(...values),max:Math.max(0,...values)}; }\n", fixed: "export function minMax(values){ if(!values.length)return null; return {min:Math.min(...values),max:Math.max(...values)}; }\n", visible: "assert.deepEqual(minMax([-5,-2]),{min:-5,max:-2});", hidden: "assert.equal(minMax([]),null); assert.deepEqual(minMax([3]),{min:3,max:3});", rootCause: "zero is injected into maximum calculation", behavior: "extrema come only from inputs; empty yields null" },
  { name: "count-words", prompt: "Count non-empty whitespace-delimited words, including newlines, and return zero for blank text.", before: "export function countWords(text){ return text.split(' ').length; }\n", fixed: "export function countWords(text){ const value=text.trim(); return value ? value.split(/\\s+/).length : 0; }\n", visible: "assert.equal(countWords('one  two\\nthree'),3);", hidden: "assert.equal(countWords('   '),0); assert.equal(countWords('one'),1);", rootCause: "literal-space splitting counts empty tokens and ignores other whitespace", behavior: "trim and count non-empty runs separated by any whitespace" },
  { name: "has-own", prompt: "Check own properties safely even for objects that shadow hasOwnProperty.", before: "export function hasOwn(value,key){ return value.hasOwnProperty(key); }\n", fixed: "export function hasOwn(value,key){ return Object.prototype.hasOwnProperty.call(value,key); }\n", visible: "assert.equal(hasOwn({a:1},'a'),true);", hidden: "assert.equal(hasOwn({hasOwnProperty:false,a:1},'a'),true); assert.equal(hasOwn(Object.create({a:1}),'a'),false);", rootCause: "calling an instance method is unsafe when shadowed or absent", behavior: "use the intrinsic hasOwnProperty with call" }
];
if (patchSpecs.length !== 25) throw new Error(`Expected 25 unique patch specifications, got ${patchSpecs.length}`);

const patchTasks: Array<Record<string, unknown>> = [];
const patchOracles: Array<Record<string, unknown>> = [];
for (const [index, spec] of patchSpecs.entries()) {
  const taskId = `g4-dev-patch-${String(index + 1).padStart(2, "0")}-${spec.name}-${sha256(`${spec.name}:g4-development-v2`).slice(0, 10)}`;
  const sourcePath = `src/${spec.name}.mjs`;
  const visibleTestPath = `test/${spec.name}.visible.test.mjs`;
  const hiddenTestPath = `test/${spec.name}.hidden.test.mjs`;
  const importLine = `import { ${spec.before.match(/function\s+(\w+)/)?.[1]} } from '../${sourcePath}';`;
  const visibleTest = `import test from 'node:test';\nimport assert from 'node:assert/strict';\n${importLine}\ntest('visible behavior',()=>{ ${spec.visible} });\n`;
  const hiddenTest = `import test from 'node:test';\nimport assert from 'node:assert/strict';\n${importLine}\ntest('hidden behavior',()=>{ ${spec.hidden} });\n`;
  patchTasks.push({ task_id: taskId, dataset_role: "DEVELOPMENT_ONLY", repository_id: `g4-fixture-${spec.name}`, repository_commit: sha256(spec.before), ecosystem: "node-esm-no-dependencies", category: "behavioral_patch", task_family: spec.name, difficulty: index % 3 === 0 ? "L3" : "L2", prompt: spec.prompt, expected_outcome: "PATCH_PROPOSAL", allowed_files: [sourcePath], visible_files: [{ path: sourcePath, content: spec.before }, { path: visibleTestPath, content: visibleTest }], trusted_visible_command: [process.execPath, "--test", visibleTestPath], changed_line_budget: 12, provenance: "independently authored executable G4 development microrepository with a machine behavior oracle" });
  patchOracles.push({ task_id: taskId, exact_relevant_file: sourcePath, exact_relevant_symbol: spec.before.match(/function\s+(\w+)/)?.[1], root_cause: spec.rootCause, behavioral_requirement: spec.behavior, fixed_source_sha256: sha256(spec.fixed), reference_fixed_source: spec.fixed, hidden_files: [{ path: hiddenTestPath, content: hiddenTest }], trusted_hidden_command: [process.execPath, "--test", hiddenTestPath], success_requires: ["patch applies in isolated worktree", "syntax check PASS", "visible test PASS", "hidden test PASS", "no wrong-file edit", "clean rollback"] });
}

const tasks = [...repositoryTasks, ...patchTasks];
const oracleRows = [...repositoryOracles, ...patchOracles];
const words = (value: string) => new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1));
const jaccard = (a: Set<string>, b: Set<string>) => [...a].filter((word) => b.has(word)).length / new Set([...a, ...b]).size;
let maximumPromptJaccard = 0;
let maximumPromptPair: string[] = [];
for (let left = 0; left < tasks.length; left += 1) for (let right = left + 1; right < tasks.length; right += 1) {
  const score = jaccard(words(String(tasks[left].prompt)), words(String(tasks[right].prompt)));
  if (score > maximumPromptJaccard) { maximumPromptJaccard = score; maximumPromptPair = [String(tasks[left].task_id), String(tasks[right].task_id)]; }
}
if (tasks.length < 200 || oracleRows.length !== tasks.length || maximumPromptJaccard >= 0.9) throw new Error(`G4 development integrity failure: tasks=${tasks.length}, oracles=${oracleRows.length}, maxJaccard=${maximumPromptJaccard}, pair=${maximumPromptPair.join(",")}`);

async function writeImmutable(name: string, value: object) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const target = path.join(outputRoot, name);
  await writeFile(target, body, { flag: "wx" });
  await writeFile(`${target}.sha256`, `${sha256(body)}  ${name}\n`, { flag: "wx" });
  return { path: `benchmarks/g4-development/${name}`, sha256: sha256(body) };
}
const rejectedV1 = {
  manifest: { path: "benchmarks/g4-development/G4_DEVELOPMENT_MANIFEST.json", sha256: sha256(await readFile(path.join(outputRoot, "G4_DEVELOPMENT_MANIFEST.json"))) },
  oracle: { path: "benchmarks/g4-development/G4_DEVELOPMENT_ORACLE.sealed.json", sha256: sha256(await readFile(path.join(outputRoot, "G4_DEVELOPMENT_ORACLE.sealed.json"))) },
  preregistration: { path: "benchmarks/g4-development/G4_DEVELOPMENT_EXPERIMENT_PREREGISTRATION.json", sha256: sha256(await readFile(path.join(outputRoot, "G4_DEVELOPMENT_EXPERIMENT_PREREGISTRATION.json"))) }
};
const manifestBody = { schemaVersion: 1, suiteId: "dca-g4-development-v2", authoringRevision: 2, classification: "DEVELOPMENT_ONLY_NEVER_FUTURE_HOLDOUT", createdAfterG3FreezeAttestation: attestationExpected, supersedesRejectedBeforeModelCalls: rejectedV1.manifest, contaminationPolicy: { mayTuneCandidate: true, mayClaimUnseenGeneralization: false, mayEnterFutureHoldout: false, excludesTaskSources: ["G1", "G2", "G3 prompts", "G3 historical patch diffs"] }, corpus: { tasks: tasks.length, pinnedRepositoryReadOnlyTasks: repositoryTasks.length, executableBehaviorPatchTasks: patchTasks.length, repositoriesRepresented: repositoryDocument.repositories.length, categories: Object.fromEntries([...new Set(tasks.map((task) => String(task.category)))].sort().map((category) => [category, tasks.filter((task) => task.category === category).length])), maximumPromptJaccard: Number(maximumPromptJaccard.toFixed(4)), maximumPromptPair }, tasks, taskPayloadSha256: sha256(JSON.stringify(tasks)) };
const manifest = await writeImmutable("G4_DEVELOPMENT_MANIFEST.v2.json", manifestBody);
const oracle = await writeImmutable("G4_DEVELOPMENT_ORACLE.v2.sealed.json", { schemaVersion: 1, suiteId: "dca-g4-development-v2", authoringRevision: 2, visibility: "HIDDEN_FROM_MODEL_EXCEPT_EXPLICIT_ORACLE_CONDITIONS", manifestSha256: manifest.sha256, rows: oracleRows, oraclePayloadSha256: sha256(JSON.stringify(oracleRows)) });

const ids = (category: string, count: number) => tasks.filter((task) => task.category === category).slice(0, count).map((task) => task.task_id);
const patchIds = patchTasks.slice(0, 12).map((task) => task.task_id);
const preregistration = await writeImmutable("G4_DEVELOPMENT_EXPERIMENT_PREREGISTRATION.v2.json", {
  schemaVersion: 1,
  preregistrationId: "dca-g4-development-capability-and-retry-v2",
  state: "SEALED_BEFORE_FIRST_G4_MODEL_CALL",
  manifest,
  oracle,
  fixedModel: { repository: "Qwen/Qwen3.5-4B", revision: "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a", precision: "bfloat16", temperature: 0, seed: 20260809, thinking: false, endpoint: "loopback-only", newModelAcquisition: false },
  experimentTasks: {
    oracleContext: ["ambiguous_task_location", "cross_file_reasoning", "long_horizon_diagnosis", "hidden_test_generalization", "repository_onboarding", "evidence_integration", "open_ended_coding"].flatMap((category) => ids(category, 6)),
    navigationIsolation: patchIds,
    diagnosisIsolation: patchIds,
    patchGenerationIsolation: patchIds,
    planningIsolation: ids("cross_file_reasoning", 12),
    retryDepth: patchIds,
    onboardingComponents: ids("repository_onboarding", 24)
  },
  conditions: {
    oracleContext: ["NORMAL_RETRIEVAL", "ORACLE_EVIDENCE"],
    navigationIsolation: ["TASK_ONLY", "EXACT_FILE", "EXACT_SYMBOL", "ORACLE_SOURCE_AND_TEST_CONTEXT"],
    retryDepth: [1, 2, 3]
  },
  primaryMetrics: { analysis: "strict structured component pass", patch: "visible and hidden behavior tests both PASS after constrained worktree patch" },
  partialMetricsNeverProductPass: ["evidence completeness", "diagnosis only", "syntax only", "visible tests without hidden tests", "more attempts"],
  eIterDevelopmentGate: {
    requiredAll: [
      "2-call final behavioral success improves by at least 10 percentage points over 1-call",
      "at least 15 percent of first failures recover on call 2",
      "repeated-patch rate <= 10 percent",
      "contradiction rate <= 5 percent",
      "zero safety violations and zero wrong-file edits",
      "mean 2-call tokens <= 2.2 times 1-call tokens"
    ],
    thirdCallRule: "Enable only if call 3 adds at least 5 percentage points over call 2 with new verifier evidence and no safety regression.",
    otherwise: "Do not create E-ITER candidate; retain protocol as rejected development hypothesis."
  },
  futureHoldout: { state: "NOT_CREATED", creationAllowedOnlyAfterCandidateFreeze: true, repoDisjointFrom: ["G1", "G2", "G3", "G4 development", "historical patch development"] },
  protectedActions: { commit: false, push: false, pullRequest: false, tag: false, signing: false, release: false, modelDownload: false }
});
const authoringRecord = await writeImmutable("G4_DEVELOPMENT_AUTHORING_REVISION_RECORD.json", {
  schemaVersion: 1,
  modelCallsBeforeRevision2Seal: 0,
  revision1: { ...rejectedV1, status: "REJECTED_BEFORE_MODEL_CALLS", reasons: ["escape-regexp reference fix failed its hidden behavior oracle", "binary-search buggy source passed its original hidden oracle"] },
  revision2: { manifest, oracle, preregistration, status: "ACCEPTED_PENDING_FULL_ORACLE_PREFLIGHT" },
  outcomesSeen: false,
  tuningFromModelResults: false
});
process.stdout.write(`${JSON.stringify({ status: "PASS_SEALED_BEFORE_MODEL_CALLS", manifest, oracle, preregistration, authoringRecord, corpus: manifestBody.corpus }, null, 2)}\n`);
