import { describe, expect, it } from "vitest";
import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";
import { resolveNextWorkflowStep, validateWorkflowSequenceLinks } from "./workflow-sequence.js";

describe("workflow sequence", () => {
  const steps: WorkflowStep[] = [
    { id: "first", type: "bash", initialCommand: "true", nextStepId: "third" },
    { id: "second", type: "bash", initialCommand: "true", nextStepId: null },
    { id: "third", type: "bash", initialCommand: "true", nextStepId: "second" },
  ];

  it("resolves explicit downstream nodes and terminal nodes", () => {
    expect(resolveNextWorkflowStep(steps, 0)?.step.id).toBe("third");
    expect(resolveNextWorkflowStep(steps, 2)?.step.id).toBe("second");
    expect(resolveNextWorkflowStep(steps, 1)).toBeNull();
  });

  it("validates missing targets and cycles", () => {
    expect(validateWorkflowSequenceLinks(steps)).toBeNull();
    expect(
      validateWorkflowSequenceLinks([
        { id: "first", type: "bash", initialCommand: "true", nextStepId: "missing" },
      ]),
    ).toContain("missing downstream step");
    expect(
      validateWorkflowSequenceLinks([
        { id: "first", type: "bash", initialCommand: "true", nextStepId: "first" },
      ]),
    ).toContain("cannot point to itself");
    expect(
      validateWorkflowSequenceLinks([
        { id: "first", type: "bash", initialCommand: "true", nextStepId: "second" },
        { id: "second", type: "bash", initialCommand: "true", nextStepId: "first" },
      ]),
    ).toContain("cycle");
  });
});
