import { describe, expect, it } from "vitest";
import { WorkflowNodeRunSchema, WorkflowPayloadSchema, WorkflowScriptSchema } from "./types.js";

const workflowIdentity = {
  apiVersion: "paseo.sh/workflow/v1",
  kind: "Workflow",
} as const;

describe("WorkflowScriptSchema", () => {
  it("accepts the version 1 workflow contract", () => {
    const parsed = WorkflowScriptSchema.parse({
      ...workflowIdentity,
      version: 1,
      name: "structured workflow",
      variables: {
        traceId: { type: "string", default: "" },
        counter: { type: "int64", default: "0" },
      },
      outputSchema: {
        type: "object",
        required: ["status"],
        properties: {
          status: { type: "string" },
        },
      },
      steps: [
        {
          id: "prepare",
          type: "bash",
          initialCommand: 'output="{\\"data\\":{}}"',
          inputVariable: "request",
          outputVariable: "response",
          templateVariables: {
            project: "{{data.project}}",
          },
          variables: {
            cursor: { type: "string", default: "" },
          },
          inputs: {
            project: "{{workflow.inputs.project}}",
          },
          inputSchema: {
            type: "object",
            required: ["project"],
            properties: {
              project: { type: "string" },
            },
          },
          outputSchema: {
            type: "object",
            required: ["items"],
            properties: {
              items: { type: "array" },
            },
          },
        },
        {
          id: "route",
          type: "switch",
          switchVar: "{{data.route}}",
          cases: [{ equals: "process", steps: [] }],
        },
        {
          id: "loop",
          type: "for",
          mode: "array",
          items: "{{data.items}}",
          forControl: "{{data.control}}",
          loopVariables: {
            cursor: { type: "string", default: "" },
          },
          steps: [{ id: "body", type: "bash", initialCommand: "output='{}'" }],
        },
      ],
    });

    expect(parsed.version).toBe(1);
    expect(parsed.variables?.counter).toEqual({ type: "int64", default: "0" });
    expect(parsed.steps[0]?.type === "bash" ? parsed.steps[0].inputVariable : null).toBe("request");
    expect(parsed.steps[1]?.type === "switch" ? parsed.steps[1].switchVar : null).toBe(
      "{{data.route}}",
    );
    expect(parsed.steps[2]?.type === "for" ? parsed.steps[2].mode : null).toBe("array");
  });

  it("accepts nested Agent, Switch, and For steps with defaults", () => {
    const parsed = WorkflowScriptSchema.parse({
      ...workflowIdentity,
      version: 1,
      name: "triage",
      steps: [
        {
          id: "route",
          type: "switch",
          cases: [
            {
              equals: true,
              steps: [
                {
                  id: "analyze",
                  type: "agent",
                  initialPrompt: "Analyze {{data.input}}",
                  templateVariables: { language: "Chinese" },
                  config: {
                    provider: "codex",
                    assistantId: "assistant-leader",
                    teamId: "team-reviewers",
                  },
                },
              ],
            },
          ],
          defaultSteps: [
            {
              id: "loop",
              type: "for",
              mode: "true",
              maxIterations: 10,
              forControl: "{{data.control}}",
              steps: [
                {
                  id: "iterate",
                  type: "bash",
                  initialCommand: "output='{}'",
                },
              ],
            },
          ],
        },
      ],
    });

    expect(
      parsed.steps[0]?.type === "switch" &&
        parsed.steps[0].cases[0]?.steps[0]?.type === "agent" &&
        parsed.steps[0].cases[0].steps[0].outputMode,
    ).toBe("normal");
    expect(
      parsed.steps[0]?.type === "switch" &&
        parsed.steps[0].cases[0]?.steps[0]?.type === "agent" &&
        parsed.steps[0].cases[0].steps[0].lifecycle,
    ).toBe("single");
    expect(
      parsed.steps[0]?.type === "switch" &&
        parsed.steps[0].defaultSteps?.[0]?.type === "for" &&
        parsed.steps[0].defaultSteps[0].concurrency,
    ).toBe(1);
  });

  it("rejects removed protocol shapes and versions", () => {
    expect(
      WorkflowScriptSchema.safeParse({
        ...workflowIdentity,
        version: 2,
        name: "removed version",
        steps: [],
      }).success,
    ).toBe(false);
    expect(
      WorkflowScriptSchema.safeParse({
        ...workflowIdentity,
        version: 1,
        name: "legacy contract",
        inputContract: { required: ["project"] },
        steps: [],
      }).success,
    ).toBe(false);
    expect(
      WorkflowScriptSchema.safeParse({
        ...workflowIdentity,
        version: 1,
        name: "legacy output",
        steps: [
          {
            id: "agent",
            type: "agent",
            outputType: "answer",
            initialPrompt: "Analyze",
            config: { provider: "codex" },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects invalid template variable names", () => {
    expect(
      WorkflowScriptSchema.safeParse({
        ...workflowIdentity,
        version: 1,
        name: "invalid variable",
        steps: [
          {
            id: "agent",
            type: "agent",
            initialPrompt: "Analyze",
            templateVariables: { "not valid": "value" },
            config: { provider: "codex" },
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("WorkflowPayloadSchema", () => {
  it("preserves arbitrary workflow data without framework-owned fields", () => {
    expect(
      WorkflowPayloadSchema.parse({
        customer: { name: "Alice" },
        items: [1, 2],
      }),
    ).toEqual({
      customer: { name: "Alice" },
      items: [1, 2],
    });
  });
});

describe("WorkflowNodeRunSchema", () => {
  it("keeps persisted run records readable while defaulting Agent conversation fields", () => {
    const nodeRun = WorkflowNodeRunSchema.parse({
      id: "node-run",
      stepId: "agent",
      stepName: "Agent",
      stepType: "agent",
      iterationPath: [],
      startedAt: "2026-08-11T00:00:00.000Z",
      endedAt: "2026-08-11T00:00:01.000Z",
      status: "succeeded",
      inputFilePath: "",
      outputFilePath: null,
      inputControl: "",
      outputControl: "",
      error: null,
      agentId: null,
      output: null,
    });

    expect(nodeRun.agentPrompt).toBeNull();
    expect(nodeRun.agentResponse).toBeNull();
    expect(nodeRun.workflowPath).toBeNull();
    expect(nodeRun.workflowRunId).toBeNull();
  });
});

describe("Workflow For defaults", () => {
  it("defaults to serial execution with 100 maximum iterations and concurrency one", () => {
    const script = WorkflowScriptSchema.parse({
      ...workflowIdentity,
      version: 1,
      name: "loop",
      steps: [
        {
          id: "loop",
          type: "for",
          items: "{{data.items}}",
          steps: [{ id: "body", type: "bash", initialCommand: "output='{}'" }],
        },
      ],
    });

    expect(script.steps[0]?.type === "for" ? script.steps[0].maxIterations : null).toBe(100);
    expect(script.steps[0]?.type === "for" ? script.steps[0].executionMode : null).toBe("serial");
    expect(script.steps[0]?.type === "for" ? script.steps[0].concurrency : null).toBe(1);
  });

  it("accepts explicit parallel For execution", () => {
    const script = WorkflowScriptSchema.parse({
      ...workflowIdentity,
      version: 1,
      name: "parallel loop",
      steps: [
        {
          id: "loop",
          type: "for",
          executionMode: "parallel",
          items: "{{data.items}}",
          concurrency: 4,
          steps: [{ id: "body", type: "bash", initialCommand: "output='{}'" }],
        },
      ],
    });

    expect(script.steps[0]).toMatchObject({
      type: "for",
      executionMode: "parallel",
      concurrency: 4,
    });
  });

  it("accepts zero as an unlimited loop cap and reserves built-in loop variable names", () => {
    const parsed = WorkflowScriptSchema.parse({
      ...workflowIdentity,
      version: 1,
      name: "unlimited loop",
      steps: [
        {
          id: "loop",
          type: "for",
          mode: "true",
          maxIterations: 0,
          steps: [{ id: "body", type: "bash", initialCommand: "output='{}'" }],
        },
      ],
    });
    expect(parsed.steps[0]?.type === "for" ? parsed.steps[0].maxIterations : null).toBe(0);

    expect(
      WorkflowScriptSchema.safeParse({
        ...workflowIdentity,
        version: 1,
        name: "reserved loop variable",
        steps: [
          {
            id: "loop",
            type: "for",
            loopVariables: {
              item: { type: "string" },
            },
            steps: [{ id: "body", type: "bash", initialCommand: "output='{}'" }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
