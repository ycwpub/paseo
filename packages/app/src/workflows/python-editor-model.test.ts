import { describe, expect, it } from "vitest";
import {
  createWorkflowStep,
  getAvailableWorkflowStepTypes,
  validateWorkflowDraft,
} from "./editor-model";

describe("Python workflow editor model", () => {
  it("creates an editable Python node with an fd 3 result example", () => {
    const step = createWorkflowStep("python", []);

    expect(step.type).toBe("python");
    if (step.type !== "python") {
      throw new Error("Expected a Python step");
    }
    expect(step.name).toBe("Python code");
    expect(step.code).toContain("json.load(sys.stdin)");
    expect(step.code).toContain('payload["control"] = "done"');
    expect(step.code).toContain('os.fdopen(3, "w")');
    expect(step.code).toContain("json.dump(payload, result");
  });

  it("accepts Python variables, timeout, and retry settings", () => {
    expect(
      validateWorkflowDraft({
        version: 1,
        name: "Python",
        steps: [
          {
            id: "transform",
            type: "python",
            code: 'print("{{customer.name}}")',
            variables: { label: "{{customer.name}}-customer" },
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
  });
});
