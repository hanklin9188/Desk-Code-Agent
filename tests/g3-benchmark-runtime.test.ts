import { describe, expect, it } from "vitest";
import { G3_REPOSITORY_SPECS, buildG3Artifacts, type G3RepositoryRecord, type G3RuntimeTask } from "../services/g3-benchmark-runtime/src/index";

describe("G3 benchmark design", () => {
  it("uses 24 repository-disjoint specifications and a repository-level split", () => {
    expect(G3_REPOSITORY_SPECS).toHaveLength(24);
    expect(new Set(G3_REPOSITORY_SPECS.map((repo) => repo.url))).toHaveLength(24);
    expect(G3_REPOSITORY_SPECS.filter((repo) => repo.split === "development")).toHaveLength(6);
    expect(G3_REPOSITORY_SPECS.filter((repo) => repo.split === "validation")).toHaveLength(6);
    expect(G3_REPOSITORY_SPECS.filter((repo) => repo.split === "holdout")).toHaveLength(12);
  });

  it("rejects option cues and exact required-path leakage", () => {
    const repositories = G3_REPOSITORY_SPECS.map((spec): G3RepositoryRecord => ({
      id: spec.id, url: spec.url, local_directory: spec.directory, commit_sha: "a".repeat(40), branch: "main", dirty: false,
      license_path: "LICENSE", license_local: "MIT", readme_path: "README.md", entry_path: "src/index.ts", source_path: "src/core.ts",
      test_path: "tests/core.test.ts", build_path: "package.json", dependency_manifest: "package.json", files: 10, loc: 100,
      languages: { TypeScript: 2 }, build_commands_detected: ["npm run build"], test_commands_detected: ["npm test"], dependency_manifests: ["package.json"],
      split_role: spec.split, ecosystem: spec.ecosystem, selection_provenance: spec.provenance, tree_sha256: "b".repeat(64)
    }));
    const tasks = repositories.flatMap((repo) => Array.from({ length: 8 }, (_, index): G3RuntimeTask => ({
      task_id: `${repo.id}-${index}`, repository_id: repo.id, repository_commit: repo.commit_sha, split: repo.split_role,
      prompt: index === 0 ? "OPTIONS A: leaked" : "Inspect the bounded behavior.", declared_symbols: [], provenance: "fixture",
      category: (["local_coding", "cross_file_coding", "diagnosis", "navigation", "understanding", "review", "safety", "unsupported_escalation"] as const)[index],
      difficulty: (["L2", "L3", "L3", "L2", "L3", "L2", "L4", "L1"] as const)[index], expected_outcome: "ANSWER",
      required_evidence_paths: ["src/core.ts"], target_paths: [], required_answer_terms: [], security_sensitive: false, hidden_oracle_kind: "PINNED_ARTIFACT", candidates: []
    })));
    const artifact = buildG3Artifacts(repositories, tasks, "c".repeat(64));
    expect(artifact.taskManifest.integrity.status).toBe("FAIL");
    expect(artifact.taskManifest.integrity.errors).toContain("G3 model-visible prompts may not contain answer options");
  });
});
