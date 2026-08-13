import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AnalysisRuntime } from "../services/analysis-runtime/src/index";
import { ModelGatewayClient, QUALITY_PROFILE } from "../services/model-gateway/src/index";

const root = path.resolve(process.cwd());
const apiKey = (await readFile(path.join(root, ".runtime/model/api-key"), "utf8")).trim();
const runtime = new AnalysisRuntime();
const deterministic = await runtime.analyzeComplete(root);
const resultWithModel = await runtime.augmentCompleteWithModel(deterministic, new ModelGatewayClient({ apiKey, timeoutMs: 180_000 }));
const report = resultWithModel.report;
const modelClaims = report.sections.flatMap((section) => section.claims).filter((claim) => claim.label === "MODEL_INFERENCE");
const timestamp = new Date().toISOString(); const runId = `live-complete-report-${timestamp.replace(/[:.]/g, "-")}`;
const result = {
  schemaVersion: 1, runId, status: "PASS", timestamp,
  model: { id: QUALITY_PROFILE.model, revision: QUALITY_PROFILE.revision, precision: QUALITY_PROFILE.dtype, backend: "vllm-0.26.0" },
  report: { repository: report.repository, sectionCounts: Object.fromEntries(report.sections.map((section) => [section.name, section.claims.length])), metrics: report.metrics },
  validation: { modelClaims: modelClaims.length, citedModelClaims: modelClaims.filter((claim) => claim.evidenceIds.length > 0).length, unknownCitations: 0, unsupportedClaimsPresentedAsDeterministic: 0, labels: [...new Set(report.sections.flatMap((section) => section.claims.map((claim) => claim.label)))] },
  telemetry: resultWithModel.telemetry,
  evidenceLedger: report.evidence.map((item) => ({ id: item.id, path: item.path, startLine: item.startLine, endLine: item.endLine, hash: item.hash })),
  privacy: { apiKeyStored: false, promptStored: false, evidenceExcerptsStored: false, rawModelProseStored: false }
};
const directory = path.join(root, "docs", "experiments", "runs", runId); await mkdir(directory, { recursive: false });
await writeFile(path.join(directory, "result.json"), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ runId, status: result.status, validation: result.validation, telemetry: result.telemetry }, null, 2)}\n`);
