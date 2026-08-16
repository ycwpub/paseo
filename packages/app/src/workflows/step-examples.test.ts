import { describe, expect, it } from "vitest";
import { createWorkflowStep, updateAgentOutputMode } from "./editor-model";
import {
  DEFAULT_AGENT_INITIAL_PROMPT,
  DEFAULT_BASH_INITIAL_COMMAND,
  DEFAULT_PYTHON_CODE,
  DEFAULT_SWITCH_CONTROL,
  getWorkflowStepExamples,
} from "./step-examples";

describe("workflow step examples", () => {
  it("prefills command and Agent nodes with the examples shown in help", () => {
    const bash = createWorkflowStep("bash", []);
    const python = createWorkflowStep("python", []);
    const agent = createWorkflowStep("agent", []);

    expect(bash.type === "bash" ? bash.initialCommand : null).toBe(DEFAULT_BASH_INITIAL_COMMAND);
    expect(python.type === "python" ? python.code : null).toBe(DEFAULT_PYTHON_CODE);
    expect(agent.type === "agent" ? agent.initialPrompt : null).toBe(DEFAULT_AGENT_INITIAL_PROMPT);
    expect(getWorkflowStepExamples(bash).initialValue).toBe(DEFAULT_BASH_INITIAL_COMMAND);
    expect(getWorkflowStepExamples(bash).composition).toContain("paseo workflow run");
    expect(DEFAULT_BASH_INITIAL_COMMAND).toContain('output="$(jq');
    expect(DEFAULT_BASH_INITIAL_COMMAND).not.toContain("node ");
    expect(DEFAULT_BASH_INITIAL_COMMAND).not.toContain(">&3");
    expect(getWorkflowStepExamples(bash).composition).toContain('output="$(jq');
    expect(getWorkflowStepExamples(bash).composition).not.toContain("node ");
    expect(getWorkflowStepExamples(bash).composition).not.toContain(">&3");
    expect(getWorkflowStepExamples(python).initialValue).toBe(DEFAULT_PYTHON_CODE);
    expect(getWorkflowStepExamples(agent).initialValue).toBe(DEFAULT_AGENT_INITIAL_PROMPT);
    expect(JSON.parse(getWorkflowStepExamples(agent).input)).toMatchObject({
      project: { var: { serviceName: "checkout" } },
    });
    expect(DEFAULT_AGENT_INITIAL_PROMPT).toContain("{{input}}");
    expect(DEFAULT_AGENT_INITIAL_PROMPT).not.toContain("{{payload}}");
  });

  it("keeps Agent output examples aligned with the selected output mode", () => {
    const normal = createWorkflowStep("agent", []);
    if (normal.type !== "agent") {
      throw new Error("Expected an Agent step");
    }
    const custom = updateAgentOutputMode(normal, "custom");

    expect(JSON.parse(getWorkflowStepExamples(normal).output)).toEqual({
      data: { answer: "Agent reply" },
    });
    expect(JSON.parse(getWorkflowStepExamples(custom).output)).toEqual({
      data: {
        customer: { name: "Alice" },
        items: [{ id: 7 }],
      },
    });
  });

  it("uses the documented Switch example as the initial branch", () => {
    const step = createWorkflowStep("switch", []);
    if (step.type !== "switch") {
      throw new Error("Expected a Switch step");
    }

    expect(step.cases).toEqual([{ equals: DEFAULT_SWITCH_CONTROL, steps: [] }]);
    expect(JSON.parse(getWorkflowStepExamples(step).input)).toMatchObject({
      data: {
        customer: { name: "Alice" },
      },
      loop: {
        var: {
          item: { id: 7 },
          index: 0,
          count: 1,
          i: "0",
        },
      },
    });
    expect(step.switchVar).toBe("{{data.control}}");
  });

  it("provides valid JSON input and output examples for every node type", () => {
    for (const type of ["bash", "python", "agent", "switch", "for"] as const) {
      const examples = getWorkflowStepExamples(createWorkflowStep(type, []));
      expect(() => JSON.parse(examples.input)).not.toThrow();
      expect(() => JSON.parse(examples.output)).not.toThrow();
    }
  });
});
