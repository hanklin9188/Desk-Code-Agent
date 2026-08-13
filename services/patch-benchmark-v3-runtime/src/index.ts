import { createHash } from "node:crypto";
import { buildPatchCorpusTasks, type PatchCorpusTask } from "../../patch-benchmark-runtime/src/index";

export function buildExpandedPatchCorpusTasks(): PatchCorpusTask[] {
  const source = buildPatchCorpusTasks();
  return Array.from({ length: 60 }, (_, index) => {
    const base = source[index % source.length];
    const fixtureGeneration = Math.floor(index / source.length) + 1;
    const id = `patch-v3-${String(index + 1).padStart(3, "0")}-${base.faultPattern}-g${fixtureGeneration}`;
    return {
      ...base,
      id,
      repositoryId: `${base.repositoryId}-fixture-g${fixtureGeneration}`,
      task: `Fix ${base.faultPattern} in the named function using the associated visible and hidden-test contract. ${base.requirement}`
    };
  });
}

export function buildExpandedPatchCorpusManifest() {
  const tasks = buildExpandedPatchCorpusTasks();
  const rows = tasks.map((task) => ({ id: task.id, repositoryId: task.repositoryId, language: task.language, buildSystem: task.buildSystem, testFramework: task.testFramework, faultPattern: task.faultPattern, sourcePath: task.sourcePath, visibleTestPath: task.visibleTestPath, hiddenTestPath: task.hiddenTestPath, regressionTestPath: task.regressionTestPath, allowedFiles: task.allowedFiles, maxChangedLines: task.maxChangedLines }));
  const payloadSha256 = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  return { schemaVersion: 1, corpusId: "dca-expanded-patch-v3-development-g1", classification: "EXECUTABLE_DEVELOPMENT_CORPUS_NOT_HOLDOUT", tasks: rows, taskCount: tasks.length, repositoryFixtures: new Set(tasks.map((task) => task.repositoryId)).size, semanticArchetypes: new Set(tasks.map((task) => task.faultPattern)).size, languages: [...new Set(tasks.map((task) => task.language))], payloadSha256 };
}
