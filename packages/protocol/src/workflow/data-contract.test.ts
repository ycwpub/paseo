import { describe, expect, it } from "vitest";
import {
  isWorkflowInt64,
  WorkflowNodeInputEnvelopeSchema,
  WorkflowNodeResultEnvelopeSchema,
  WorkflowVariableDefinitionSchema,
} from "./data-contract.js";

describe("WorkflowNodeInputEnvelopeSchema", () => {
  it("accepts data plus workflow, project, loop, and node variables", () => {
    expect(
      WorkflowNodeInputEnvelopeSchema.parse({
        data: { approved: true },
        origin_input: { project: "paseo", requestId: "request-1" },
        workflow: { var: { traceId: "trace-1", counter: "7" } },
        project: { var: { serviceName: "checkout" } },
        loop: { var: { item: "alpha", index: 0, count: 2, cursor: "next" } },
        node: { var: { cursor: "next" } },
      }),
    ).toEqual({
      data: { approved: true },
      origin_input: { project: "paseo", requestId: "request-1" },
      workflow: { var: { traceId: "trace-1", counter: "7" } },
      project: { var: { serviceName: "checkout" } },
      loop: { var: { item: "alpha", index: 0, count: 2, cursor: "next" } },
      node: { var: { cursor: "next" } },
    });
  });

  it("rejects fields outside the version 1 envelope", () => {
    expect(
      WorkflowNodeInputEnvelopeSchema.safeParse({
        data: {},
        origin_input: {},
        workflow: { var: {} },
        node: { var: {} },
        flow: { action: "next" },
      }).success,
    ).toBe(false);
  });

  it("requires all For loop variables under loop.var", () => {
    expect(
      WorkflowNodeInputEnvelopeSchema.safeParse({
        data: {},
        origin_input: {},
        workflow: { var: {} },
        loop: { item: "alpha", index: 0, count: 1 },
        node: { var: {} },
      }).success,
    ).toBe(false);
    expect(
      WorkflowNodeInputEnvelopeSchema.safeParse({
        data: {},
        origin_input: {},
        workflow: { var: {} },
        loop: { var: { item: "alpha", index: 0, count: 1 } },
        node: { var: {} },
      }).success,
    ).toBe(true);
  });

  it("requires the immutable original Workflow input", () => {
    expect(
      WorkflowNodeInputEnvelopeSchema.safeParse({
        data: {},
        workflow: { var: {} },
        node: { var: {} },
      }).success,
    ).toBe(false);
  });
});

describe("WorkflowNodeResultEnvelopeSchema", () => {
  it("requires data, supports Workflow variable updates, and fills framework fields", () => {
    expect(
      WorkflowNodeResultEnvelopeSchema.parse({
        data: { approved: true },
        modify: {
          workflow: { var: { counter: "8" } },
          loop: { var: { cursor: "next" } },
        },
        base_resp: {
          status_code: 0,
          status_msg: "",
          forbid_retry: 0,
        },
      }),
    ).toEqual({
      data: { approved: true },
      modify: {
        workflow: { var: { counter: "8" } },
        loop: { var: { cursor: "next" } },
      },
      base_resp: {
        status_code: 0,
        status_msg: "",
        forbid_retry: 0,
      },
      artifacts: [],
    });
  });

  it("defaults optional fields and rejects framework-owned or unsupported fields", () => {
    expect(WorkflowNodeResultEnvelopeSchema.parse({ data: { answer: "ok" } })).toEqual({
      data: { answer: "ok" },
      modify: {
        workflow: { var: {} },
        loop: { var: {} },
      },
      base_resp: {
        status_code: 0,
        status_msg: "",
        forbid_retry: 0,
      },
      artifacts: [],
    });
    expect(
      WorkflowNodeResultEnvelopeSchema.safeParse({
        data: {},
        flow: { action: "next" },
      }).success,
    ).toBe(false);
    expect(
      WorkflowNodeResultEnvelopeSchema.safeParse({
        data: {},
        modify: {
          workflow: { var: {} },
          loop: { var: {} },
          node: { var: { cursor: "next" } },
        },
      }).success,
    ).toBe(false);
    expect(
      WorkflowNodeResultEnvelopeSchema.safeParse({
        data: {},
        artifacts: [],
      }).success,
    ).toBe(false);
    expect(WorkflowNodeResultEnvelopeSchema.safeParse({}).success).toBe(false);
  });
});

describe("Workflow int64 variables", () => {
  it("accepts signed 64-bit decimal strings and rejects invalid values", () => {
    expect(isWorkflowInt64("-9223372036854775808")).toBe(true);
    expect(isWorkflowInt64("9223372036854775807")).toBe(true);
    expect(isWorkflowInt64("9223372036854775808")).toBe(false);
    expect(isWorkflowInt64("01")).toBe(false);
    expect(isWorkflowInt64("1.5")).toBe(false);
  });

  it("validates int64 defaults", () => {
    expect(
      WorkflowVariableDefinitionSchema.parse({
        type: "int64",
        default: "42",
      }),
    ).toEqual({
      type: "int64",
      default: "42",
    });
    expect(
      WorkflowVariableDefinitionSchema.safeParse({
        type: "int64",
        default: "9223372036854775808",
      }).success,
    ).toBe(false);
  });
});
