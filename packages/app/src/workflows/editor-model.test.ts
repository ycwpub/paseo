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
  updateAgentOutputType,
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

  it("uses localized names for newly created workflows and nested nodes", () => {
    const names = {
      workflow: "未命名工作流",
      bash: "Bash 命令",
      python: "Python 代码",
      agent: "Agent",
      workflowNode: "子工作流",
      switch: "条件分支",
      for: "逐项循环",
    };
    const script = createEmptyWorkflowScript(names);
    const loop = createWorkflowStep("for", script.steps, names);

    expect(script.name).toBe("未命名工作流");
    expect(script.steps[0]?.name).toBe("Bash 命令");
    expect(loop.name).toBe("逐项循环");
    expect(loop.type === "for" ? loop.steps[0]?.name : null).toBe("Bash 命令");
    expect(loop.type === "for" ? loop.maxIterations : null).toBe(100);
    expect(loop.type === "for" ? loop.concurrency : null).toBe(1);
  });

  it("creates Workflow nodes that can reference another workflow", () => {
    const step = createWorkflowStep("workflow", []);

    expect(step).toMatchObject({
      id: "workflow",
      name: "Workflow",
      type: "workflow",
      workflowPath: "",
    });
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
    expect(step.type === "agent" ? step.initialPrompt : null).toBe(DEFAULT_AGENT_INITIAL_PROMPT);
    expect(step.type === "agent" ? step.outputType : null).toBe("answer");
    expect(step.type === "agent" ? step.config.systemPrompt : null).toBeUndefined();
  });

  it("updates the default system prompt when changing Agent node types", () => {
    const step = createWorkflowStep("agent", []);
    if (step.type !== "agent") {
      throw new Error("Expected an Agent step");
    }

    const controlStep = updateAgentOutputType(step, "control");
    expect(controlStep.outputType).toBe("control");
    expect(controlStep.config.systemPrompt).toBe("# 角色\n你的回答必须在下面几个选中中：是、否");

    const answerStep = updateAgentOutputType(controlStep, "answer");
    expect(answerStep.outputType).toBe("answer");
    expect(answerStep.config.systemPrompt).toBeUndefined();
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
    step.variables = {
      role: "{{customer.name}}-reviewer",
    };
    expect(validateWorkflowDraft(script)).toBeNull();
  });

  it("reports duplicate ids before save", () => {
    const script = createEmptyWorkflowScript();
    script.steps.push({ id: "bash", type: "bash", initialCommand: "echo duplicate" });
    expect(validateWorkflowDraft(script)).toBe("Duplicate workflow step id: bash");
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

  it("rejects a direct self reference", () => {
    const script = createEmptyWorkflowScript();
    script.steps = [
      {
        id: "self",
        type: "workflow",
        workflowPath: "/tmp/current.json",
      },
    ];

    expect(validateWorkflowDraft(script, "/tmp/current.json")).toBe(
      "Workflow step self cannot reference its own workflow",
    );
  });
});
