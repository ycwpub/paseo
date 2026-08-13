import { describe, expect, it } from "vitest";
import { validateWorkflowNodeData } from "./workflow-node-contract.js";

describe("validateWorkflowNodeData", () => {
  it("validates mapped node inputs and structured outputs", () => {
    const schema = {
      type: "object",
      required: ["count"],
      properties: {
        count: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    };

    expect(() => validateWorkflowNodeData(schema, { count: 2 }, "Node input")).not.toThrow();
    expect(() => validateWorkflowNodeData(schema, { count: 0 }, "Node input")).toThrow(
      "Node input failed schema validation",
    );
    expect(() =>
      validateWorkflowNodeData(schema, { count: 2, undeclared: true }, "Node input"),
    ).toThrow("must NOT have additional properties");
  });
});
