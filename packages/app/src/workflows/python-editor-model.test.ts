import { describe, expect, it } from "vitest";
import {
  createWorkflowStep,
  getAvailableWorkflowStepTypes,
  validateWorkflowDraft,
} from "./editor-model";

describe("Python workflow editor model", () => {
  it("creates an editable Python node with an output variable example", () => {
    const step = createWorkflowStep("python", []);

    expect(step.type).toBe("python");
    if (step.type !== "python") {
      throw new Error("Expected a Python step");
    }
    expect(step.name).toBe("Python code");
    expect(step.code).toContain('input["data"]');
    expect(step.code).toContain('"status": "done"');
    expect(step.code).toContain("output = {");
    expect(step.code).not.toContain("os.fdopen");
  });

  it("accepts Python variables, timeout, and retry settings", () => {
    expect(
      validateWorkflowDraft({
        apiVersion: "paseo.sh/workflow/v1",
        kind: "Workflow",
        version: 1,
        name: "Python",
        steps: [
          {
            id: "transform",
            type: "python",
            code: 'print("{{customer.name}}")',
            templateVariables: { label: "{{customer.name}}-customer" },
            timeoutMs: 10_000,
            retry: { maxAttempts: 2 },
          },
        ],
      }),
    ).toBeNull();
  });

  it("hides Python nodes when the connected daemon does not advertise support", () => {
    expect(getAvailableWorkflowStepTypes(false)).not.toContain("python");
    expect(getAvailableWorkflowStepTypes(true)).toContain("python");
    expect(getAvailableWorkflowStepTypes(true)).not.toContain("workflow");
  });
});
