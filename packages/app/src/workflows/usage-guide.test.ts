import { describe, expect, it } from "vitest";
import { buildWorkflowUsageExamples } from "./usage-guide";

describe("buildWorkflowUsageExamples", () => {
  it("uses the selected absolute workflow path in every example", () => {
    const examples = buildWorkflowUsageExamples("/Users/example/.paseo/workflows/review.json");
    expect(examples.cli).toContain("/Users/example/.paseo/workflows/review.json");
    expect(examples.cliNode).toContain("--node worker");
    expect(examples.cliBackground).toContain("--background");
    expect(JSON.parse(examples.agentTool).scriptPath).toBe(
      "/Users/example/.paseo/workflows/review.json",
    );
    expect(JSON.parse(examples.agentToolNode).targetNodeId).toBe("worker");
    expect(examples.server).toContain("/Users/example/.paseo/workflows/review.json");
    expect(examples.serverNode).toContain('targetNodeId: "worker"');
  });

  it("escapes workflow paths for shell examples", () => {
    expect(buildWorkflowUsageExamples("/tmp/team's flow.json").cli).toContain(
      "'/tmp/team'\\''s flow.json'",
    );
  });
});
