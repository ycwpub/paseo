import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("feature panel registration", () => {
  it("registers feature replacements after the core panels", () => {
    const applicationRegistry = readFileSync(
      new URL("./register-application-panels.ts", import.meta.url),
      "utf8",
    );
    const featureRegistry = readFileSync(
      new URL("./register-feature-panels.ts", import.meta.url),
      "utf8",
    );

    expect(applicationRegistry.indexOf("ensurePanelsRegistered()")).toBeLessThan(
      applicationRegistry.indexOf("ensureFeaturePanelsRegistered()"),
    );
    expect(featureRegistry).toContain("registerPanel(projectFilesPanelRegistration)");
    expect(featureRegistry).toContain("registerPanel(multiRepositoryPullRequestPanelRegistration)");
    expect(featureRegistry).toContain("registerPanel(taskSummaryPanelRegistration)");
    expect(featureRegistry).toContain("if (featurePanelsRegistered)");
  });
});
