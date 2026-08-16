import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGENT_INITIAL_PROMPT,
  applyInstructionTemplateToAgentSystemPrompt,
  applyInstructionTemplateToAgentStep,
  collectWorkflowStepIds,
  countWorkflowSteps,
  createEmptyWorkflowScript,
  createWorkflowStep,
  moveWorkflowStep,
  updateAgentOutputMode,
  validateWorkflowDraft,
} from "./editor-model";

describe("workflow editor model", () => {
  it("creates production-safe workflow execution defaults", () => {
    const script = createEmptyWorkflowScript();
    expect(script.timeoutMs).toBe(86_400_000);
    expect(script.taskDefaults).toEqual({
      timeoutMs: 1_800_000,
      retry: {
        maxAttempts: 3,
        initialDelayMs: 1_000,
        maxDelayMs: 30_000,
        backoffMultiplier: 2,
        jitter: true,
      },
    });
  });

  it("uses localized names for newly created workflows and nested control nodes", () => {
    const names = {
      workflow: "未命名工作流",
      bash: "Bash 命令",
      python: "Python 代码",
      agent: "Agent",
      switch: "条件分支",
      for: "逐项循环",
    };
    const script = createEmptyWorkflowScript(names);
    const loop = createWorkflowStep("for", script.steps, names);

    expect(script.name).toBe("未命名工作流");
    expect(script.steps[0]?.name).toBe("Bash 命令");
    expect(loop.name).toBe("逐项循环");
    expect(loop.type === "for" ? loop.steps[0]?.name : null).toBe("Bash 命令");
    expect(loop.type === "for" ? loop.mode : null).toBe("array");
    expect(loop.type === "for" ? loop.executionMode : null).toBe("serial");
    expect(loop.type === "for" ? loop.items : null).toBe("{{data.items}}");
    expect(loop.type === "for" ? loop.maxIterations : null).toBe(100);
    expect(loop.type === "for" ? loop.concurrency : null).toBe(1);
  });

  it("validates serial and unlimited parallel For execution settings", () => {
    const script = createEmptyWorkflowScript();
    const loop = createWorkflowStep("for", script.steps);
    if (loop.type !== "for") {
      throw new Error("Expected a For step");
    }

    expect(
      validateWorkflowDraft({
        ...script,
        steps: [{ ...loop, executionMode: "serial", concurrency: 2 }],
      }),
    ).toContain("serial mode requires concurrency 1");
    expect(
      validateWorkflowDraft({
        ...script,
        steps: [
          {
            ...loop,
            mode: "true",
            items: undefined,
            executionMode: "parallel",
            concurrency: 1,
            maxIterations: 0,
          },
        ],
      }),
    ).toContain("cannot run an unlimited True loop in parallel");
  });

  it("creates unique ids across nested workflow steps", () => {
    const existing = [
      {
        id: "switch",
        type: "switch" as const,
        cases: [
          {
            equals: "go",
            steps: [
              {
                id: "agent",
                type: "agent" as const,
                initialPrompt: "go",
                config: { provider: "codex" },
              },
            ],
          },
        ],
      },
    ];
    expect(createWorkflowStep("agent", existing).id).toBe("agent-2");
  });

  it("creates Agent nodes with an editable user-defined prompt default", () => {
    const step = createWorkflowStep("agent", []);
    expect(step.type).toBe("agent");
    expect(step.type === "agent" ? step.lifecycle : null).toBe("single");
    expect(step.type === "agent" ? step.subsequentPromptMode : null).toBe("reuse_initial");
    expect(step.type === "agent" ? step.initialPrompt : null).toBe(DEFAULT_AGENT_INITIAL_PROMPT);
    expect(step.type === "agent" ? step.outputMode : null).toBe("normal");
    expect(step.type === "agent" ? step.config.systemPrompt : null).toBeUndefined();
  });

  it("requires For-lifecycle Agent nodes to be nested inside a For loop", () => {
    const script = createEmptyWorkflowScript();
    const agent = createWorkflowStep("agent", script.steps);
    if (agent.type !== "agent") {
      throw new Error("Expected an Agent step");
    }

    expect(
      validateWorkflowDraft({
        ...script,
        steps: [{ ...agent, lifecycle: "for" }],
      }),
    ).toContain("must be inside a For loop");
    expect(
      validateWorkflowDraft({
        ...script,
        steps: [
          {
            id: "loop",
            type: "for",
            items: "{{data.items}}",
            steps: [{ ...agent, lifecycle: "for" }],
          },
        ],
      }),
    ).toBeNull();
  });

  it("updates Agent output mode without changing the system prompt", () => {
    const step = createWorkflowStep("agent", []);
    if (step.type !== "agent") {
      throw new Error("Expected an Agent step");
    }

    const customStep = updateAgentOutputMode(step, "custom");
    expect(customStep.outputMode).toBe("custom");
    expect(customStep.config.systemPrompt).toBeUndefined();

    const normalStep = updateAgentOutputMode(customStep, "normal");
    expect(normalStep.outputMode).toBe("normal");
    expect(normalStep.config.systemPrompt).toBeUndefined();
  });

  it("counts and collects nested steps", () => {
    const script = createEmptyWorkflowScript();
    script.steps.push({
      id: "route",
      type: "switch",
      cases: [
        {
          equals: "go",
          steps: [{ id: "worker", type: "bash", initialCommand: "echo go" }],
        },
      ],
      defaultSteps: [{ id: "fallback", type: "bash", initialCommand: "echo no" }],
    });
    expect(countWorkflowSteps(script.steps)).toBe(4);
    expect(collectWorkflowStepIds(script.steps)).toEqual(["bash", "route", "worker", "fallback"]);
  });

  it("moves steps without mutating the input", () => {
    const script = createEmptyWorkflowScript();
    script.steps.push({ id: "second", type: "bash", initialCommand: "echo second" });
    const moved = moveWorkflowStep(script.steps, 1, -1);
    expect(moved.map((step) => step.id)).toEqual(["second", "bash"]);
    expect(script.steps.map((step) => step.id)).toEqual(["bash", "second"]);
  });

  it("copies a prompt template into an Agent node without linking later edits", () => {
    const step = createWorkflowStep("agent", []);
    if (step.type !== "agent") {
      throw new Error("Expected an Agent step");
    }
    const template = {
      id: "math",
      name: "Math expert",
      content: "# Role\nYou are a mathematician.",
    };

    const copied = applyInstructionTemplateToAgentStep(step, template);
    const edited = { ...copied, initialPrompt: `${copied.initialPrompt}\nBe concise.` };

    expect(copied.initialPrompt).toBe(template.content);
    expect(edited.initialPrompt).toContain("Be concise.");
    expect(template.content).toBe("# Role\nYou are a mathematician.");
    expect(step.initialPrompt).not.toBe(template.content);
  });

  it("copies a prompt template into an Agent system prompt without linking later edits", () => {
    const step = createWorkflowStep("agent", []);
    if (step.type !== "agent") {
      throw new Error("Expected an Agent step");
    }
    const template = {
      id: "controller",
      name: "Controller",
      content: "# Role\nChoose a route for {{customer.name}}.",
    };

    const copied = applyInstructionTemplateToAgentSystemPrompt(step, template);
    const edited = {
      ...copied,
      config: {
        ...copied.config,
        systemPrompt: `${copied.config.systemPrompt}\nOnly answer yes or no.`,
      },
    };

    expect(copied.config.systemPrompt).toBe(template.content);
    expect(edited.config.systemPrompt).toContain("Only answer yes or no.");
    expect(template.content).toBe("# Role\nChoose a route for {{customer.name}}.");
    expect(step.config.systemPrompt).toBeUndefined();
  });

  it("creates a valid loop with an editable body node", () => {
    const script = createEmptyWorkflowScript();
    const loop = createWorkflowStep("for", script.steps);
    expect(loop.type).toBe("for");
    if (loop.type !== "for") {
      throw new Error("Expected a for step");
    }
    expect(loop.steps).toHaveLength(1);
    expect(loop.steps[0]?.type).toBe("bash");
    expect(validateWorkflowDraft({ ...script, steps: [...script.steps, loop] })).toBeNull();
  });

  it("accepts Bash template variables in workflow drafts", () => {
    const script = createEmptyWorkflowScript();
    const step = script.steps[0];
    if (!step || step.type !== "bash") {
      throw new Error("Expected a Bash step");
    }
    step.initialCommand = "echo '{{customer.name}}' '{{role}}'";
    step.templateVariables = {
      role: "{{customer.name}}-reviewer",
    };
    expect(validateWorkflowDraft(script)).toBeNull();
  });

  it("reports duplicate ids before save", () => {
    const script = createEmptyWorkflowScript();
    script.steps.push({ id: "bash", type: "bash", initialCommand: "echo duplicate" });
    expect(validateWorkflowDraft(script)).toBe("Duplicate workflow step id: bash");
  });

  it("validates downstream links within each workflow sequence", () => {
    const script = createEmptyWorkflowScript();
    script.steps = [
      {
        id: "first",
        type: "bash",
        initialCommand: "true",
        nextStepId: "third",
      },
      {
        id: "second",
        type: "bash",
        initialCommand: "true",
        nextStepId: null,
      },
      {
        id: "third",
        type: "bash",
        initialCommand: "true",
        nextStepId: "second",
      },
    ];
    expect(validateWorkflowDraft(script)).toBeNull();

    script.steps[2] = { ...script.steps[2]!, nextStepId: "first" };
    expect(validateWorkflowDraft(script)).toContain("cycle");
  });

  it("rejects downstream links that cross nested sequence boundaries", () => {
    const script = createEmptyWorkflowScript();
    script.steps = [
      {
        id: "route",
        type: "switch",
        cases: [
          {
            equals: "yes",
            steps: [
              {
                id: "nested",
                type: "bash",
                initialCommand: "true",
                nextStepId: "finish",
              },
            ],
          },
        ],
      },
      { id: "finish", type: "bash", initialCommand: "true" },
    ];

    expect(validateWorkflowDraft(script)).toContain("missing downstream step: finish");
  });

  it("reports invalid retry backoff ranges before save", () => {
    const script = createEmptyWorkflowScript();
    script.taskDefaults = {
      retry: {
        maxAttempts: 3,
        initialDelayMs: 5_000,
        maxDelayMs: 1_000,
      },
    };
    expect(validateWorkflowDraft(script)).toBe(
      "Workflow default retry maxDelayMs cannot be less than initialDelayMs",
    );
  });
});
