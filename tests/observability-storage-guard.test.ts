import { describe, expect, it } from "vitest";
import {
  GIB,
  MAX_LIVE_DISPOSABLE_ISOLATIONS,
  ObservabilityStorageGuard,
  computeStorageThreshold,
} from "../services/observability-storage-guard/src/index";

const total = 100 * GIB;
const threshold = computeStorageThreshold(1024, total);

function fixture(options: { free?: number; live?: string[]; cleanupFails?: boolean; reclaimFails?: boolean; prepareEnospc?: boolean } = {}) {
  let live = [...(options.live ?? [])];
  let callsStarted = 0;
  const guard = new ObservabilityStorageGuard(1024, {
    capacity: async () => ({ freeBytes: options.free ?? threshold.requiredFreeBytes, totalBytes: total }),
    liveDisposableIsolations: async () => [...live],
    prepareDisposableIsolation: async () => {
      if (options.prepareEnospc) throw Object.assign(new Error("fixture ENOSPC"), { code: "ENOSPC" });
      live = ["/tmp/dca-obsv3-one"];
      return live[0];
    },
    removeDisposableIsolation: async () => {
      if (options.cleanupFails) throw new Error("cleanup failed");
      if (!options.reclaimFails) live = [];
    },
  });
  return { guard, callStarted: () => callsStarted++, callsStarted: () => callsStarted };
}

describe("V3 deterministic observability storage guard", () => {
  it("freezes one live disposable isolation", () => expect(MAX_LIVE_DISPOSABLE_ISOLATIONS).toBe(1));
  it("passes with enough free disk", async () => expect((await fixture({ free: threshold.requiredFreeBytes + 1 }).guard.beforeCallStarted()).status).toBe("PASS"));
  it("passes exactly at the threshold", async () => expect((await fixture().guard.beforeCallStarted()).status).toBe("PASS"));
  it("fails below the threshold before CALL_STARTED", async () => {
    const f = fixture({ free: threshold.requiredFreeBytes - 1 });
    expect((await f.guard.beforeCallStarted()).status).toBe("DISK_CAPACITY_PRECHECK_FAILED");
    expect(f.callsStarted()).toBe(0);
  });
  it("cleans and reclaims before the next task", async () => {
    const f = fixture();
    expect((await f.guard.prepareWorkspace()).status).toBe("PASS");
    expect(await f.guard.cleanupAfterTask()).toBe("PASS");
    expect((await f.guard.beforeCallStarted()).status).toBe("PASS");
  });
  it("fails closed when cleanup fails", async () => {
    const f = fixture({ cleanupFails: true });
    await f.guard.prepareWorkspace();
    expect(await f.guard.cleanupAfterTask()).toBe("CLEANUP_FAILED");
    expect((await f.guard.beforeCallStarted()).status).toBe("CLEANUP_FAILED");
  });
  it("detects a stale isolation before CALL_STARTED", async () => {
    const f = fixture({ live: ["/tmp/stale"] });
    expect((await f.guard.beforeCallStarted()).status).toBe("STALE_ISOLATION_DETECTED");
    expect(f.callsStarted()).toBe(0);
  });
  it("fails when storage is not reclaimed", async () => {
    const f = fixture({ reclaimFails: true });
    await f.guard.prepareWorkspace();
    expect(await f.guard.cleanupAfterTask()).toBe("STORAGE_NOT_RECLAIMED");
  });
  it("classifies simulated workspace ENOSPC without a model call", async () => {
    const f = fixture({ prepareEnospc: true });
    expect((await f.guard.prepareWorkspace()).status).toBe("WORKSPACE_PREPARATION_ENOSPC");
    expect(f.callsStarted()).toBe(0);
  });
});
