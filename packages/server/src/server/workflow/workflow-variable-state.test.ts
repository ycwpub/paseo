import { describe, expect, it } from "vitest";
import { WorkflowVariableState } from "./workflow-variable-state.js";

describe("WorkflowVariableState", () => {
  it("initializes typed workflow and node variables", () => {
    const state = new WorkflowVariableState(
      {
        counter: { type: "int64" },
        traceId: { type: "string" },
      },
      [
        {
          id: "worker",
          type: "bash",
          initialCommand: "output='{}'",
          variables: {
            cursor: { type: "string", default: "start" },
          },
        },
      ],
    );

    expect(state.createNodeInput("worker", { task: "scan" })).toEqual({
      data: { task: "scan" },
      workflow: {
        var: {
          counter: "0",
          traceId: "",
        },
      },
      node: {
        var: {
          cursor: "start",
        },
      },
    });
  });

  it("serializes concurrent workflow variable modifications", async () => {
    const state = new WorkflowVariableState(
      {
        counter: { type: "int64", default: "0" },
      },
      [{ id: "worker", type: "bash", initialCommand: "output='{}'" }],
    );

    await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        state.apply({
          workflow: { var: { counter: String(index + 1) } },
        }),
      ),
    );

    expect(state.snapshotWorkflow()).toEqual({ counter: "100" });
  });

  it("rejects undeclared and invalid int64 modifications", async () => {
    const state = new WorkflowVariableState(
      {
        counter: { type: "int64", default: "0" },
      },
      [{ id: "worker", type: "bash", initialCommand: "output='{}'" }],
    );

    await expect(
      state.apply({
        workflow: { var: { missing: "1" } },
      }),
    ).rejects.toThrow('Cannot modify undeclared workflow variable "missing"');
    await expect(
      state.apply({
        workflow: { var: { counter: "9223372036854775808" } },
      }),
    ).rejects.toThrow('workflow variable "counter" must be a decimal string');
  });
});
