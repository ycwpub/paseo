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

  it("adds only the innermost loop scope to node input", () => {
    const state = new WorkflowVariableState({}, [
      { id: "worker", type: "bash", initialCommand: "output='{}'" },
    ]);
    const outerScope = state.createLoopScope({
      outer: { type: "string", default: "outer" },
    });
    const innerScope = state.createLoopScope({
      inner: { type: "string", default: "inner" },
    });

    expect(
      state.createNodeInput(
        "worker",
        {},
        {
          scope: outerScope,
          item: "outer-item",
          index: 0,
          count: 1,
          modificationAllowed: true,
        },
      ).loop,
    ).toEqual({
      var: {
        item: "outer-item",
        index: 0,
        count: 1,
        outer: "outer",
      },
    });
    expect(
      state.createNodeInput(
        "worker",
        {},
        {
          scope: innerScope,
          item: "inner-item",
          index: 1,
          count: 2,
          modificationAllowed: true,
        },
      ).loop,
    ).toEqual({
      var: {
        item: "inner-item",
        index: 1,
        count: 2,
        inner: "inner",
      },
    });
  });

  it("serializes concurrent workflow and loop variable modifications", async () => {
    const state = new WorkflowVariableState(
      {
        counter: { type: "int64", default: "0" },
      },
      [{ id: "worker", type: "bash", initialCommand: "output='{}'" }],
    );
    const scope = state.createLoopScope({
      cursor: { type: "int64", default: "0" },
    });

    await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        state.apply(
          {
            workflow: { var: { counter: String(index + 1) } },
            loop: { var: { cursor: String(index + 1) } },
          },
          {
            scope,
            item: index,
            index,
            count: 100,
            modificationAllowed: true,
          },
        ),
      ),
    );

    expect(state.snapshotWorkflow()).toEqual({ counter: "100" });
    expect(scope.snapshot()).toEqual({ cursor: "100" });
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
        loop: { var: {} },
      }),
    ).rejects.toThrow('Cannot modify undeclared workflow variable "missing"');
    await expect(
      state.apply({
        workflow: { var: { counter: "9223372036854775808" } },
        loop: { var: {} },
      }),
    ).rejects.toThrow('workflow variable "counter" must be a decimal string');
  });

  it("rejects loop updates outside a loop and undeclared loop variables", async () => {
    const state = new WorkflowVariableState({}, [
      { id: "worker", type: "bash", initialCommand: "output='{}'" },
    ]);
    const modification = {
      workflow: { var: {} },
      loop: { var: { cursor: "next" } },
    };

    await expect(state.apply(modification)).rejects.toThrow(
      "Cannot modify loop variables outside a For loop",
    );

    const scope = state.createLoopScope({});
    await expect(
      state.apply(modification, {
        scope,
        item: null,
        index: 0,
        count: 1,
        modificationAllowed: true,
      }),
    ).rejects.toThrow('Cannot modify undeclared loop variable "cursor"');
  });

  it("rejects Loop variable modifications inside parallel For execution", async () => {
    const state = new WorkflowVariableState({}, [
      { id: "worker", type: "bash", initialCommand: "output='{}'" },
    ]);
    const scope = state.createLoopScope({
      cursor: { type: "string", default: "start" },
    });

    await expect(
      state.apply(
        {
          workflow: { var: {} },
          loop: { var: { cursor: "next" } },
        },
        {
          scope,
          item: "item",
          index: 0,
          count: 2,
          modificationAllowed: false,
        },
      ),
    ).rejects.toThrow("Cannot modify loop variables in parallel For execution");
    expect(scope.snapshot()).toEqual({ cursor: "start" });
  });
});
