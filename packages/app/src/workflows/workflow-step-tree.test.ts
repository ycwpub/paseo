import { describe, expect, it } from "vitest";
import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";
import { findWorkflowStepEditContext, updateWorkflowStepById } from "./workflow-step-tree";

const steps: WorkflowStep[] = [
  {
    id: "root",
    type: "bash",
    initialCommand: "true",
    nextStepId: "loop",
  },
  {
    id: "loop",
    type: "for",
    mode: "array",
    items: "{{data.items}}",
    steps: [
      {
        id: "loop-first",
        type: "bash",
        initialCommand: "echo first",
        nextStepId: "loop-second",
      },
      {
        id: "loop-second",
        type: "bash",
        initialCommand: "echo second",
      },
    ],
  },
  {
    id: "branch",
    type: "switch",
    switchVar: "{{data.control}}",
    cases: [
      {
        equals: "yes",
        steps: [{ id: "case-step", type: "bash", initialCommand: "echo case" }],
      },
    ],
    defaultSteps: [{ id: "default-step", type: "bash", initialCommand: "echo default" }],
  },
];

describe("workflow step tree editing", () => {
  it("finds the selected step together with its sibling sequence and depth", () => {
    const context = findWorkflowStepEditContext(steps, "loop-second");

    expect(context?.step.id).toBe("loop-second");
    expect(context?.siblingSteps.map((step) => step.id)).toEqual(["loop-first", "loop-second"]);
    expect(context?.depth).toBe(1);
  });

  it("updates a root step and keeps its sequence links valid after a rename", () => {
    const updated = updateWorkflowStepById(steps, "loop", {
      ...steps[1]!,
      id: "renamed-loop",
    });

    expect(updated[0]?.nextStepId).toBe("renamed-loop");
    expect(updated[1]?.id).toBe("renamed-loop");
  });

  it("keeps an edited node addressable while its required ID is temporarily empty", () => {
    const updated = updateWorkflowStepById(steps, "root", {
      ...steps[0]!,
      id: "",
    });

    expect(findWorkflowStepEditContext(updated, "")?.step.id).toBe("");
  });

  it("updates nested For, Switch case, and Switch default steps", () => {
    const withForUpdate = updateWorkflowStepById(steps, "loop-second", {
      id: "renamed-loop-second",
      type: "bash",
      initialCommand: "echo updated",
    });
    const loop = withForUpdate[1];
    expect(loop?.type).toBe("for");
    if (loop?.type === "for") {
      expect(loop.steps[0]?.nextStepId).toBe("renamed-loop-second");
      expect(loop.steps[1]?.id).toBe("renamed-loop-second");
    }

    const withCaseUpdate = updateWorkflowStepById(withForUpdate, "case-step", {
      id: "case-step",
      type: "bash",
      initialCommand: "echo updated case",
    });
    const branch = withCaseUpdate[2];
    expect(branch?.type).toBe("switch");
    if (branch?.type === "switch") {
      expect(branch.cases[0]?.steps[0]).toMatchObject({
        id: "case-step",
        initialCommand: "echo updated case",
      });
    }

    const withDefaultUpdate = updateWorkflowStepById(withCaseUpdate, "default-step", {
      id: "default-step",
      type: "bash",
      initialCommand: "echo updated default",
    });
    const updatedBranch = withDefaultUpdate[2];
    expect(updatedBranch?.type).toBe("switch");
    if (updatedBranch?.type === "switch") {
      expect(updatedBranch.defaultSteps?.[0]).toMatchObject({
        id: "default-step",
        initialCommand: "echo updated default",
      });
    }
  });

  it("returns the original tree when the selected step does not exist", () => {
    const updated = updateWorkflowStepById(steps, "missing", {
      id: "missing",
      type: "bash",
      initialCommand: "true",
    });

    expect(updated).toBe(steps);
  });
});
