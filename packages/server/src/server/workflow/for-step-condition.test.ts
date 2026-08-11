import { describe, expect, it } from "vitest";
import type { WorkflowForStep } from "@getpaseo/protocol/workflow/types";
import { resolveWorkflowForControl } from "./for-step-condition.js";

const baseStep: WorkflowForStep = {
  id: "review-loop",
  type: "for",
  steps: [{ id: "body", type: "bash", initialCommand: "true" }],
};

describe("resolveWorkflowForControl", () => {
  it("prefers explicit control and otherwise evaluates boolean conditions", () => {
    expect(
      resolveWorkflowForControl({
        step: {
          ...baseStep,
          forControl: "{{data.control}}",
          breakWhen: "{{data.review_passed}}",
        },
        resolveOptional: (expression) => (expression === "{{data.control}}" ? "continue" : true),
      }),
    ).toBe("continue");
    expect(
      resolveWorkflowForControl({
        step: { ...baseStep, breakWhen: "{{data.review_passed}}" },
        resolveOptional: () => true,
      }),
    ).toBe("break");
    expect(
      resolveWorkflowForControl({
        step: { ...baseStep, continueWhen: "{{data.skip_remaining}}" },
        resolveOptional: () => true,
      }),
    ).toBe("continue");
  });

  it("treats missing conditions as false and rejects non-boolean values", () => {
    expect(
      resolveWorkflowForControl({
        step: { ...baseStep, breakWhen: "{{data.review_passed}}" },
        resolveOptional: () => undefined,
      }),
    ).toBe("");
    expect(() =>
      resolveWorkflowForControl({
        step: { ...baseStep, breakWhen: "{{data.review_passed}}" },
        resolveOptional: () => "yes",
      }),
    ).toThrow("must resolve to a boolean");
  });
});
