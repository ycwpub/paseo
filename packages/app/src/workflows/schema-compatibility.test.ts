import { describe, expect, it } from "vitest";
import type { WorkflowScript } from "@getpaseo/protocol/workflow/types";
import { findWorkflowSchemaCompatibilityWarnings } from "./schema-compatibility";

describe("workflow schema compatibility", () => {
  it("accepts compatible output and downstream input schemas", () => {
    const script = createScript();
    script.steps = [
      {
        id: "produce",
        type: "bash",
        initialCommand: "true",
        outputSchema: objectSchema(
          {
            answer: { type: "string" },
            count: { type: "integer" },
          },
          ["answer", "count"],
        ),
      },
      {
        id: "consume",
        type: "bash",
        initialCommand: "true",
        inputSchema: objectSchema(
          {
            answer: { type: "string" },
            count: { type: "number" },
          },
          ["answer"],
        ),
      },
    ];

    expect(findWorkflowSchemaCompatibilityWarnings(script)).toEqual([]);
  });

  it("reports missing required fields, rejected fields, and conflicting types", () => {
    const script = createScript();
    script.steps = [
      {
        id: "produce",
        type: "bash",
        initialCommand: "true",
        outputSchema: objectSchema({
          answer: { type: "number" },
          debug: { type: "string" },
        }),
      },
      {
        id: "consume",
        type: "bash",
        initialCommand: "true",
        inputSchema: objectSchema({ answer: { type: "string" } }, ["answer"]),
      },
    ];

    expect(findWorkflowSchemaCompatibilityWarnings(script)).toEqual([
      {
        sourceStepId: "produce",
        targetStepId: "consume",
        issue: { kind: "required_not_guaranteed", path: "answer" },
      },
      {
        sourceStepId: "produce",
        targetStepId: "consume",
        issue: { kind: "field_not_accepted", path: "debug" },
      },
      {
        sourceStepId: "produce",
        targetStepId: "consume",
        issue: {
          kind: "type_mismatch",
          path: "answer",
          outputTypes: "number",
          inputTypes: "string",
        },
      },
    ]);
  });

  it("checks the mapped data shape instead of the raw upstream output", () => {
    const script = createScript();
    script.steps = [
      {
        id: "produce",
        type: "bash",
        initialCommand: "true",
        outputSchema: objectSchema({ raw: { type: "string" } }, ["raw"]),
      },
      {
        id: "consume",
        type: "python",
        code: "output = {'data': {}}",
        inputs: {
          answer: "{{data.raw}}",
          attempts: 1,
        },
        inputSchema: objectSchema(
          {
            answer: { type: "string" },
            attempts: { type: "integer" },
          },
          ["answer", "attempts"],
        ),
      },
    ];

    expect(findWorkflowSchemaCompatibilityWarnings(script)).toEqual([]);

    const consume = script.steps[1];
    if (!consume || consume.type !== "python") {
      throw new Error("Expected Python consumer");
    }
    consume.inputSchema = objectSchema(
      {
        answer: { type: "number" },
        missing: { type: "string" },
      },
      ["answer", "missing"],
    );

    expect(findWorkflowSchemaCompatibilityWarnings(script)).toEqual([
      {
        sourceStepId: "produce",
        targetStepId: "consume",
        issue: { kind: "required_not_guaranteed", path: "missing" },
      },
      {
        sourceStepId: "produce",
        targetStepId: "consume",
        issue: { kind: "field_not_accepted", path: "attempts" },
      },
      {
        sourceStepId: "produce",
        targetStepId: "consume",
        issue: {
          kind: "type_mismatch",
          path: "answer",
          outputTypes: "string",
          inputTypes: "number",
        },
      },
    ]);
  });

  it("checks terminal node output against the Workflow output schema", () => {
    const script = createScript();
    script.outputSchema = objectSchema({ answer: { type: "string" } }, ["answer"]);
    script.steps = [
      {
        id: "finish",
        type: "agent",
        initialPrompt: "Answer",
        config: { provider: "codex" },
        outputSchema: objectSchema({ result: { type: "string" } }, ["result"]),
      },
    ];

    expect(findWorkflowSchemaCompatibilityWarnings(script)).toEqual([
      {
        sourceStepId: "finish",
        targetStepId: null,
        issue: { kind: "required_not_guaranteed", path: "answer" },
      },
      {
        sourceStepId: "finish",
        targetStepId: null,
        issue: { kind: "field_not_accepted", path: "result" },
      },
    ]);
  });

  it("checks array item types", () => {
    const script = createScript();
    script.steps = [
      {
        id: "produce",
        type: "bash",
        initialCommand: "true",
        outputSchema: objectSchema(
          {
            items: {
              type: "array",
              items: { type: "string" },
            },
          },
          ["items"],
        ),
      },
      {
        id: "consume",
        type: "bash",
        initialCommand: "true",
        inputSchema: objectSchema(
          {
            items: {
              type: "array",
              items: { type: "number" },
            },
          },
          ["items"],
        ),
      },
    ];

    expect(findWorkflowSchemaCompatibilityWarnings(script)).toEqual([
      {
        sourceStepId: "produce",
        targetStepId: "consume",
        issue: {
          kind: "type_mismatch",
          path: "items[]",
          outputTypes: "string",
          inputTypes: "number",
        },
      },
    ]);
  });

  it("uses explicit downstream links when checking schemas", () => {
    const script = createScript();
    script.steps = [
      {
        id: "produce",
        type: "bash",
        initialCommand: "true",
        nextStepId: "selected",
        outputSchema: objectSchema({ value: { type: "string" } }, ["value"]),
      },
      {
        id: "skipped",
        type: "bash",
        initialCommand: "true",
        nextStepId: null,
        inputSchema: objectSchema({ skipped: { type: "string" } }, ["skipped"]),
      },
      {
        id: "selected",
        type: "bash",
        initialCommand: "true",
        nextStepId: null,
        inputSchema: objectSchema({ value: { type: "string" } }, ["value"]),
      },
    ];

    expect(findWorkflowSchemaCompatibilityWarnings(script)).toEqual([]);
  });
});

function createScript(): WorkflowScript {
  return {
    apiVersion: "paseo.sh/workflow/v1",
    kind: "Workflow",
    version: 1,
    name: "Schema test",
    steps: [],
  };
}

function objectSchema(
  properties: Record<string, Record<string, unknown>>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required,
  };
}
