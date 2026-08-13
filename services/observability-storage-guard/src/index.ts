export const GIB = 1024 ** 3;
export const MAX_LIVE_DISPOSABLE_ISOLATIONS = 1 as const;

export type StorageGuardStatus =
  | "PASS"
  | "DISK_CAPACITY_PRECHECK_FAILED"
  | "STALE_ISOLATION_DETECTED"
  | "CLEANUP_FAILED"
  | "STORAGE_NOT_RECLAIMED"
  | "WORKSPACE_PREPARATION_ENOSPC";

export type StorageCapacity = { freeBytes: number; totalBytes: number };
export type StorageThreshold = {
  estimatedMaximumTaskWorkspaceBytes: number;
  runtimeModelReserveBytes: number;
  safetyMarginBytes: number;
  requiredFreeBytes: number;
};

export const V3_STORAGE_FORMULA = Object.freeze({
  workspaceAmplification: 8,
  minimumWorkspaceBytes: 256 * 1024 ** 2,
  runtimeModelReserveBytes: 8 * GIB,
  minimumSafetyMarginBytes: 16 * GIB,
  safetyMarginFractionOfFilesystem: 0.05,
  formula: "max(maxTaskFixtureBytes*8,256MiB)+8GiB+max(16GiB,totalBytes*0.05)",
});

export function computeStorageThreshold(maxTaskFixtureBytes: number, totalBytes: number): StorageThreshold {
  for (const [name, value] of Object.entries({ maxTaskFixtureBytes, totalBytes })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`INVALID_${name.toUpperCase()}`);
  }
  const estimatedMaximumTaskWorkspaceBytes = Math.max(
    V3_STORAGE_FORMULA.minimumWorkspaceBytes,
    maxTaskFixtureBytes * V3_STORAGE_FORMULA.workspaceAmplification,
  );
  const runtimeModelReserveBytes = V3_STORAGE_FORMULA.runtimeModelReserveBytes;
  const safetyMarginBytes = Math.max(
    V3_STORAGE_FORMULA.minimumSafetyMarginBytes,
    Math.ceil(totalBytes * V3_STORAGE_FORMULA.safetyMarginFractionOfFilesystem),
  );
  return {
    estimatedMaximumTaskWorkspaceBytes,
    runtimeModelReserveBytes,
    safetyMarginBytes,
    requiredFreeBytes: estimatedMaximumTaskWorkspaceBytes + runtimeModelReserveBytes + safetyMarginBytes,
  };
}

export type StorageGuardDependencies = {
  capacity: () => Promise<StorageCapacity>;
  liveDisposableIsolations: () => Promise<string[]>;
  removeDisposableIsolation: (isolation: string) => Promise<void>;
  prepareDisposableIsolation: () => Promise<string>;
};

export class ObservabilityStorageGuard {
  readonly #dependencies: StorageGuardDependencies;
  readonly #maxTaskFixtureBytes: number;
  #activeIsolation: string | null = null;
  #previousCleanupPassed = true;

  constructor(maxTaskFixtureBytes: number, dependencies: StorageGuardDependencies) {
    if (!Number.isSafeInteger(maxTaskFixtureBytes) || maxTaskFixtureBytes < 0) throw new Error("INVALID_MAX_TASK_FIXTURE_BYTES");
    this.#maxTaskFixtureBytes = maxTaskFixtureBytes;
    this.#dependencies = dependencies;
  }

  async beforeCallStarted(): Promise<{ status: StorageGuardStatus; capacity: StorageCapacity; threshold: StorageThreshold }> {
    const capacity = await this.#dependencies.capacity();
    const threshold = computeStorageThreshold(this.#maxTaskFixtureBytes, capacity.totalBytes);
    const live = await this.#dependencies.liveDisposableIsolations();
    if (!this.#previousCleanupPassed) return { status: "CLEANUP_FAILED", capacity, threshold };
    if (this.#activeIsolation !== null || live.length >= MAX_LIVE_DISPOSABLE_ISOLATIONS) {
      return { status: "STALE_ISOLATION_DETECTED", capacity, threshold };
    }
    if (capacity.freeBytes < threshold.requiredFreeBytes) return { status: "DISK_CAPACITY_PRECHECK_FAILED", capacity, threshold };
    return { status: "PASS", capacity, threshold };
  }

  async prepareWorkspace(): Promise<{ status: StorageGuardStatus; isolation: string | null }> {
    try {
      this.#activeIsolation = await this.#dependencies.prepareDisposableIsolation();
      return { status: "PASS", isolation: this.#activeIsolation };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOSPC") return { status: "WORKSPACE_PREPARATION_ENOSPC", isolation: null };
      throw error;
    }
  }

  async cleanupAfterTask(): Promise<StorageGuardStatus> {
    if (this.#activeIsolation === null) return "PASS";
    const isolation = this.#activeIsolation;
    try {
      await this.#dependencies.removeDisposableIsolation(isolation);
    } catch {
      this.#previousCleanupPassed = false;
      return "CLEANUP_FAILED";
    }
    const live = await this.#dependencies.liveDisposableIsolations();
    if (live.includes(isolation) || live.length !== 0) {
      this.#previousCleanupPassed = false;
      return "STORAGE_NOT_RECLAIMED";
    }
    this.#activeIsolation = null;
    this.#previousCleanupPassed = true;
    return "PASS";
  }
}
