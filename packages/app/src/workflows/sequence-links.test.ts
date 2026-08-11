import { describe, expect, it } from "vitest";
import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";
import {
  removeWorkflowSequenceStep,
  replaceWorkflowSequenceStep,
  resolveWorkflowSequenceTarget,
  validateWorkflowSequenceLinks,
} from "./sequence-links";

describe("workflow sequence links", () => {
  const steps: WorkflowStep[] = [
    { id: "first", type: "bash", initialCommand: "true", nextStepId: "third" },
    { id: "second", type: "bash", initialCommand: "true", nextStepId: null },
    { id: "third", type: "bash", initialCommand: "true", nextStepId: "second" },
  ];

  it("resolves explicit, sequential, and terminal downstream behavior", () => {
    expect(resolveWorkflowSequenceTarget(steps, 0)?.step.id).toBe("third");
    expect(resolveWorkflowSequenceTarget(steps, 2)?.step.id).toBe("second");
    expect(resolveWorkflowSequenceTarget(steps, 1)).toBeNull();
    expect(
      resolveWorkflowSequenceTarget(
        [
          { id: "a", type: "bash", initialCommand: "true" },
          { id: "b", type: "bash", initialCommand: "true" },
        ],
        0,
      )?.step.id,
    ).toBe("b");
  });

  it("rejects missing, self-referencing, and cyclic downstream links", () => {
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

  it("keeps downstream references valid when nodes are renamed or removed", () => {
    const renamed = replaceWorkflowSequenceStep(steps, 2, {
      ...steps[2]!,
      id: "renamed",
    });
    expect(renamed[0]?.nextStepId).toBe("renamed");

    const removed = removeWorkflowSequenceStep(renamed, 2);
    expect(removed.map((step) => [step.id, step.nextStepId])).toEqual([
      ["first", "second"],
      ["second", null],
    ]);

    expect(
      removeWorkflowSequenceStep(
        [
          { id: "source", type: "bash", initialCommand: "true", nextStepId: "terminal" },
          { id: "terminal", type: "bash", initialCommand: "true" },
        ],
        1,
      )[0]?.nextStepId,
    ).toBeNull();
  });
});
