import { describe, expect, it } from "vitest";
import { resolveWorkflowExpression, resolveWorkflowNodeInput } from "./workflow-data-mapping.js";

const context = {
  workflowInputs: { project: "paseo", threshold: 3 },
  currentInput: { approved: true, alerts: [{ id: 7 }] },
  nodeOutputs: {
    scan: {
      alerts: [{ id: 7 }],
      summary: "one alert",
    },
  },
};

describe("workflow data mapping", () => {
  it("preserves native values for whole expressions", () => {
    expect(
      resolveWorkflowNodeInput(
        {
          project: "{{workflow.inputs.project}}",
          alerts: "{{nodes.scan.outputs.alerts}}",
          approved: "{{approved}}",
          label: "{{workflow.inputs.project}}: {{nodes.scan.outputs.summary}}",
        },
        context,
      ),
    ).toEqual({
      project: "paseo",
      alerts: [{ id: 7 }],
      approved: true,
      label: "paseo: one alert",
    });
  });

  it("uses the current input when no mapping is configured", () => {
    expect(resolveWorkflowNodeInput(undefined, context)).toEqual(context.currentInput);
  });

  it("resolves collection expressions for control nodes", () => {
    expect(resolveWorkflowExpression("{{nodes.scan.outputs.alerts}}", context)).toEqual([
      { id: 7 },
    ]);
  });

  it("fails missing references before running the node", () => {
    expect(() =>
      resolveWorkflowNodeInput({ value: "{{nodes.missing.outputs.value}}" }, context),
    ).toThrow("Workflow expression path not found");
  });
});
