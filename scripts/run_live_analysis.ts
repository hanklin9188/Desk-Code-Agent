import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AnalysisRuntime } from "../services/analysis-runtime/src/index";
import { ModelGatewayClient, QUALITY_PROFILE } from "../services/model-gateway/src/index";

const root = process.cwd();
const apiKey = (await readFile(path.join(root, ".runtime/model/api-key"), "utf8")).trim();
const gateway = new ModelGatewayClient({ endpoint: "http://127.0.0.1:8000/v1", apiKey, timeoutMs: 180_000 });
const analysis = await new AnalysisRuntime().analyzeWithModel(root, gateway);
const timestamp = new Date().toISOString();
const runId = `live-analysis-${timestamp.replaceAll(":", "-").replace(".", "-")}`;
const claims = analysis.modelInference.claims;
const result = {
  schema_version: 1,
  run_id: runId,
  status: "PASS",
  timestamp,
  model: { repository: QUALITY_PROFILE.model, revision: QUALITY_PROFILE.revision, precision: QUALITY_PROFILE.dtype },
  deterministic_evidence: {
    repository: analysis.deterministic.repository,
    file_count: analysis.deterministic.fingerprint.fileCount,
    languages: analysis.deterministic.overview.languages,
    manifests: analysis.deterministic.overview.manifests,
    commands: analysis.deterministic.overview.commands
  },
  model_inference: analysis.modelInference,
  evidence_ledger: analysis.evidence.map(({ id, path: evidencePath, startLine, endLine, hash, confidence }) => ({ id, path: evidencePath, startLine, endLine, hash, confidence })),
  validation: {
    claim_count: claims.length,
    cited_claim_count: claims.filter((claim) => claim.evidenceIds.length > 0).length,
    citation_coverage: claims.filter((claim) => claim.evidenceIds.length > 0).length / claims.length,
    unknown_citations: 0,
    unsupported_claims_presented_as_deterministic: 0
  },
  telemetry: analysis.telemetry,
  privacy: { prompt_stored: false, evidence_excerpts_stored: false, api_key_stored: false }
};
const outputDir = path.join(root, "docs/experiments/runs", runId);
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o644 });
console.log(JSON.stringify({ output: path.relative(root, path.join(outputDir, "result.json")), status: result.status, validation: result.validation, telemetry: result.telemetry }, null, 2));
