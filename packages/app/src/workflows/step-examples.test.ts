import { describe, expect, it } from "vitest";
import { createWorkflowStep, updateAgentOutputType } from "./editor-model";
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
    expect(getWorkflowStepExamples(bash).composition).toContain("delete output.error");
    expect(getWorkflowStepExamples(python).initialValue).toBe(DEFAULT_PYTHON_CODE);
    expect(getWorkflowStepExamples(agent).initialValue).toBe(DEFAULT_AGENT_INITIAL_PROMPT);
  });

  it("keeps Agent output examples aligned with the selected node type", () => {
    const answer = createWorkflowStep("agent", []);
    if (answer.type !== "agent") {
      throw new Error("Expected an Agent step");
    }
    const control = updateAgentOutputType(answer, "control");

    expect(JSON.parse(getWorkflowStepExamples(answer).output)).toEqual({
      answer: "Agent reply",
    });
    expect(JSON.parse(getWorkflowStepExamples(control).output)).toEqual({
      control: "Agent reply",
    });
  });

  it("uses the documented Switch example as the initial branch", () => {
    const step = createWorkflowStep("switch", []);
    if (step.type !== "switch") {
      throw new Error("Expected a Switch step");
    }

    expect(step.cases).toEqual([{ equals: DEFAULT_SWITCH_CONTROL, steps: [] }]);
    expect(JSON.parse(getWorkflowStepExamples(step).input)).toMatchObject({
      control: DEFAULT_SWITCH_CONTROL,
    });
  });

  it("provides valid JSON input and output examples for every node type", () => {
    for (const type of ["bash", "python", "agent", "switch", "for"] as const) {
      const examples = getWorkflowStepExamples(createWorkflowStep(type, []));
      expect(() => JSON.parse(examples.input)).not.toThrow();
      expect(() => JSON.parse(examples.output)).not.toThrow();
    }
  });
});
