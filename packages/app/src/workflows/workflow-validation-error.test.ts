import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import type { WorkflowScript } from "@getpaseo/protocol/workflow/types";
import { createEmptyWorkflowScript, createWorkflowStep } from "./editor-model";
import { getWorkflowDraftValidationPresentation } from "./workflow-validation-error";

const translations: Record<string, string> = {
  "workflows.messages.saveFailed": "Workflow could not be saved",
  "workflows.messages.fieldRequired": "This field is required",
  "workflows.title": "Workflows",
  "workflows.graph.configuration": "Complete node configuration",
  "workflows.graph.nodeName": "Node name",
  "workflows.graph.nodeId": "Node ID",
  "workflows.nodes.types.bash": "Bash",
  "workflows.nodes.types.python": "Python",
  "workflows.nodes.types.agent": "Agent",
  "workflows.nodes.types.switch": "Switch",
  "workflows.nodes.types.for": "For",
  "workflows.nodes.agent.executionPolicy": "Execution policy",
  "workflows.nodes.common.workingDirectory": "Working directory",
  "workflows.nodes.bash.initialCommand": "Initial command",
  "workflows.editor.name": "Workflow name",
};

const t = ((key: string) => translations[key] ?? key) as TFunction;

describe("workflow validation error presentation", () => {
  it("identifies the Agent node, module, and field for nested config errors", () => {
    const script = createEmptyWorkflowScript();
    const agent = createWorkflowStep("agent", script.steps);
    if (agent.type !== "agent") {
      throw new Error("Expected an Agent step");
    }
    agent.name = "Answer customer";
    agent.config.cwd = "";

    const result = getWorkflowDraftValidationPresentation(
      { ...script, steps: [agent] } as WorkflowScript,
      t,
    );

    expect(result?.stepId).toBe(agent.id);
    expect(result?.message).toContain("Node name “Answer customer”");
    expect(result?.message).toContain(`Node ID ${agent.id}`);
    expect(result?.message).toContain("Execution policy");
    expect(result?.message).toContain("Working directory");
    expect(result?.message).toContain("This field is required");
  });

  it("identifies a nested loop body node and its command module", () => {
    const script = createEmptyWorkflowScript();
    script.steps = [
      {
        id: "loop",
        name: "Process items",
        type: "for",
        items: "{{data.items}}",
        steps: [
          {
            id: "worker",
            name: "Prepare item",
            type: "bash",
            initialCommand: "",
          },
        ],
      },
    ];

    const result = getWorkflowDraftValidationPresentation(script, t);

    expect(result?.stepId).toBe("worker");
    expect(result?.message).toContain("Node name “Prepare item”");
    expect(result?.message).toContain("Node ID worker");
    expect(result?.message).toContain("Bash");
    expect(result?.message).toContain("Initial command");
  });

  it("identifies workflow-level modules and fields", () => {
    const script = { ...createEmptyWorkflowScript(), name: "" };

    const result = getWorkflowDraftValidationPresentation(script, t);

    expect(result?.stepId).toBeNull();
    expect(result?.message).toContain("Workflows");
    expect(result?.message).toContain("Workflow name");
  });
});
