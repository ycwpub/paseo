import { describe, expect, it } from "vitest";
import { collectWorkflowRunTargets } from "./run-targets";

describe("collectWorkflowRunTargets", () => {
  it("includes top-level and nested nodes in execution order", () => {
    expect(
      collectWorkflowRunTargets([
        { id: "prepare", name: "Prepare", type: "bash", initialCommand: "echo prepare" },
        {
          id: "route",
          type: "switch",
          cases: [
            {
              equals: "yes",
              steps: [
                {
                  id: "loop",
                  type: "for",
                  steps: [{ id: "worker", type: "python", code: "print('{}')" }],
                },
              ],
            },
          ],
          defaultSteps: [{ id: "fallback", type: "bash", initialCommand: "echo fallback" }],
        },
      ]),
    ).toEqual([
      { id: "prepare", name: "Prepare", type: "bash" },
      { id: "route", name: null, type: "switch" },
      { id: "loop", name: null, type: "for" },
      { id: "worker", name: null, type: "python" },
      { id: "fallback", name: null, type: "bash" },
    ]);
  });
});
