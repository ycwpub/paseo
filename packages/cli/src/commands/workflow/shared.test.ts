import { describe, expect, it } from "vitest";
import { resolveWorkflowTargetInputMode } from "./shared.js";

describe("resolveWorkflowTargetInputMode", () => {
  it("maps CLI values to the workflow protocol", () => {
    expect(resolveWorkflowTargetInputMode("upstream-output", "worker")).toBe("upstream_output");
    expect(resolveWorkflowTargetInputMode("node-input", "worker")).toBe("node_input");
    expect(resolveWorkflowTargetInputMode(undefined, "worker")).toBeUndefined();
  });

  it("requires a target node and rejects unknown values", () => {
    expect(() => resolveWorkflowTargetInputMode("node-input", undefined)).toThrow(
      "--input-type requires --node",
    );
    expect(() => resolveWorkflowTargetInputMode("direct", "worker")).toThrow(
      "--input-type must be upstream-output or node-input",
    );
  });
});
