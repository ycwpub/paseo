import { describe, expect, it } from "vitest";
import { WorkflowPayloadSchema, WorkflowScriptSchema } from "./types.js";

describe("WorkflowScriptSchema", () => {
  it("accepts nested bash, agent, switch, and for steps", () => {
    const parsed = WorkflowScriptSchema.parse({
      version: 1,
      name: "triage",
      timeoutMs: 86_400_000,
      taskDefaults: {
        timeoutMs: 1_800_000,
        retry: {
          maxAttempts: 3,
          initialDelayMs: 1_000,
          maxDelayMs: 30_000,
          backoffMultiplier: 2,
          jitter: true,
        },
      },
      steps: [
        {
          id: "prepare",
          type: "bash",
          initialCommand: "echo prepare",
          variables: { customerName: "{{customer.name}}" },
          retry: { maxAttempts: 2 },
        },
        {
          id: "route",
          type: "switch",
          cases: [
            {
              equals: "agent",
              steps: [
                {
                  id: "analyze",
                  type: "agent",
                  initialPrompt: "Analyze {{inputFilePath}} in {{language}}",
                  promptVariables: { language: "Chinese" },
                  timeoutMs: 900_000,
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
              maxIterations: 10,
              breakControl: "done",
              steps: [
                {
                  id: "iterate",
                  type: "bash",
                  initialCommand: "echo iterate",
                },
              ],
            },
          ],
        },
      ],
    });

    expect(parsed.version).toBe(1);
    expect(parsed.steps).toHaveLength(2);
    expect(parsed.taskDefaults?.retry?.maxAttempts).toBe(3);
    expect(
      parsed.steps[1]?.type === "switch" &&
        parsed.steps[1].cases[0]?.steps[0]?.type === "agent" &&
        parsed.steps[1].cases[0].steps[0].config.teamId,
    ).toBe("team-reviewers");
    expect(
      parsed.steps[1]?.type === "switch" &&
        parsed.steps[1].defaultSteps?.[0]?.type === "for" &&
        parsed.steps[1].defaultSteps[0].breakControl,
    ).toBe("done");
  });

  it("requires explicit initial instructions for executable steps", () => {
    expect(() =>
      WorkflowScriptSchema.parse({
        version: 1,
        name: "invalid",
        steps: [{ id: "first", type: "bash", initialCommand: "" }],
      }),
    ).toThrow();
  });

  it("rejects invalid prompt variable names", () => {
    expect(() =>
      WorkflowScriptSchema.parse({
        version: 1,
        name: "invalid variable",
        steps: [
          {
            id: "agent",
            type: "agent",
            initialPrompt: "Analyze",
            promptVariables: { "not valid": "value" },
            config: { provider: "codex" },
          },
        ],
      }),
    ).toThrow();
  });
});

describe("WorkflowPayloadSchema", () => {
  it("defaults missing control and error strings while preserving arbitrary business data", () => {
    const payload = WorkflowPayloadSchema.parse({
      control: "review",
      error: "",
      customer: { name: "Alice" },
      items: [1, 2],
    });

    expect(payload.customer).toEqual({ name: "Alice" });
    expect(WorkflowPayloadSchema.parse({ customer: "Alice" })).toEqual({
      control: "",
      error: "",
      customer: "Alice",
    });
    expect(WorkflowPayloadSchema.parse({ control: "next" })).toEqual({
      control: "next",
      error: "",
    });
    expect(WorkflowPayloadSchema.parse({ error: "failed" })).toEqual({
      control: "",
      error: "failed",
    });
    expect(() => WorkflowPayloadSchema.parse({ control: [], error: "" })).toThrow();
  });
});

describe("Workflow For defaults", () => {
  it("defaults maximum iterations to 100", () => {
    const script = WorkflowScriptSchema.parse({
      version: 1,
      name: "loop",
      steps: [
        {
          id: "loop",
          type: "for",
          steps: [{ id: "body", type: "bash", initialCommand: "echo body" }],
        },
      ],
    });

    expect(script.steps[0]?.type === "for" ? script.steps[0].maxIterations : null).toBe(100);
  });
});
