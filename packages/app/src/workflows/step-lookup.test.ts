import { describe, expect, it } from "vitest";
import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";
import { findWorkflowStep } from "./step-lookup";

const steps: WorkflowStep[] = [
  {
    id: "switch",
    type: "switch",
    cases: [
      {
        equals: "yes",
        steps: [
          {
            id: "loop",
            type: "for",
            steps: [
              {
                id: "nested-bash",
                type: "bash",
                initialCommand: "cat",
              },
            ],
          },
        ],
      },
    ],
  },
];

describe("findWorkflowStep", () => {
  it("finds nested nodes across switch and for containers", () => {
    expect(findWorkflowStep(steps, "nested-bash")?.id).toBe("nested-bash");
  });

  it("returns null when the node does not exist", () => {
    expect(findWorkflowStep(steps, "missing")).toBeNull();
  });
});
