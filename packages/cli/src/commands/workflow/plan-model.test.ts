import { describe, expect, it } from "vitest";
import { WorkflowScriptFileSchema } from "@getpaseo/protocol/workflow/types";
import { buildWorkflowPlan } from "./plan-model.js";

describe("buildWorkflowPlan", () => {
  it("expands nested control flow and summarizes declared side effects", () => {
    const scriptFile = WorkflowScriptFileSchema.parse({
      path: "/tmp/review.json",
      script: {
        apiVersion: "paseo.sh/workflow/v1",
        kind: "Workflow",
        version: 1,
        name: "Review",
        steps: [
          {
            id: "route",
            type: "switch",
            cases: [
              {
                equals: "write",
                steps: [
                  {
                    id: "update",
                    type: "bash",
                    initialCommand: "output='{\"data\":{}}'",
                    sideEffects: ["lark_doc_update"],
                    requiresWriteBack: true,
                    idempotencyKey: "{{origin_input.requestId}}",
                    rollbackHint: "Restore the previous document version.",
                  },
                ],
              },
            ],
            defaultSteps: [{ id: "skip", type: "python", code: 'output = {"data": {}}' }],
          },
          {
            id: "done",
            type: "agent",
            initialPrompt: "Summarize",
            config: { provider: "codex" },
          },
        ],
      },
    });

    const plan = buildWorkflowPlan(scriptFile);

    expect(plan).toMatchObject({
      nodeCount: 4,
      sideEffects: ["lark_doc_update"],
      requiresWriteBack: true,
    });
    expect(plan.nodes.find((node) => node.id === "route")?.nextNodeIds).toEqual(["update", "skip"]);
    expect(plan.nodes.find((node) => node.id === "update")).toMatchObject({
      path: "route/case:0/update",
      nextNodeIds: ["done"],
      requiresWriteBack: true,
      idempotencyKey: "{{origin_input.requestId}}",
    });
  });
});
