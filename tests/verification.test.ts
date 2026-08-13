import { describe, expect, it } from "vitest";
import { verificationOutcome } from "../services/verification/src/index";
import type { VerificationStage } from "../packages/contracts/src/index";

const stage = (status: VerificationStage["status"]): VerificationStage => ({ id: status, label: status, trustedCommandId: "test.command", status });

describe("verification truth", () => {
  it("never promotes NOT_RUN to PASS", () => {
    expect(verificationOutcome([stage("PASS"), stage("NOT_RUN")])).toBe("NOT_RUN");
    expect(verificationOutcome([])).toBe("NOT_RUN");
  });

  it("only passes when all required stages pass", () => {
    expect(verificationOutcome([stage("PASS"), stage("PASS")])).toBe("PASS");
    expect(verificationOutcome([stage("PASS"), stage("FAIL")])).toBe("FAIL");
  });
});
