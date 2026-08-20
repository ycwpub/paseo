import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { WorkflowData, WorkflowJsonSchema } from "@getpaseo/protocol/workflow/data-contract";
import { validateWorkflowNodeData } from "../workflow/workflow-node-contract.js";

const workflowPath = fileURLToPath(
  new URL(
    "../../../../../.agents/plugins/plugins/byte-development/workflows/byte-development.json",
    import.meta.url,
  ),
);

interface WorkflowStepWithInputSchema {
  id?: string;
  type?: string;
  inputSchema?: WorkflowJsonSchema;
  config?: {
    provider?: string;
    model?: string;
  };
  steps?: WorkflowStepWithInputSchema[];
  defaultSteps?: WorkflowStepWithInputSchema[];
  cases?: Array<{ steps?: WorkflowStepWithInputSchema[] }>;
}

function readWorkflow(): { steps?: WorkflowStepWithInputSchema[] } {
  return JSON.parse(readFileSync(workflowPath, "utf8")) as {
    steps?: WorkflowStepWithInputSchema[];
  };
}

function prdInputSchema(): WorkflowJsonSchema {
  const workflow = readWorkflow();
  const schema = workflow.steps?.find((step) => step.id === "prd")?.inputSchema;
  if (!schema) throw new Error("Byte development PRD input schema is missing");
  return schema;
}

function collectAgentSteps(
  steps: readonly WorkflowStepWithInputSchema[],
): WorkflowStepWithInputSchema[] {
  return steps.flatMap((step) => [
    ...(step.type === "agent" ? [step] : []),
    ...collectAgentSteps(step.steps ?? []),
    ...collectAgentSteps(step.defaultSteps ?? []),
    ...(step.cases ?? []).flatMap((entry) => collectAgentSteps(entry.steps ?? [])),
  ]);
}

describe("byte development workflow input contract", () => {
  it("accepts the Project fields submitted by the development console", () => {
    const input: WorkflowData = {
      flow_title: "抖音省开发",
      projectId: "prj_flow",
      prd: "实现需求",
      prd_source: "manual",
      meego_url: "",
      meego_project_key: "",
      meego_work_item_id: "",
      meego_title: "",
      repository_path: "/workspace/project",
      agent_provider: "codex",
      agent_model: "gpt-5.6",
      approve_development: false,
      bits_dev_task_id: "",
      bits_psm: "",
      bits_project_type: "tce",
      bits_phase: "dev",
      target_branch: "master",
      control_plane: "cn",
      release_ticket_id: "",
      approve_deploy: false,
      approve_test: false,
      approve_release: false,
      memory_global: false,
      memory_project: true,
      memory_assistant: false,
      assistant_id: "",
      memory_instructions: "只保存稳定、可复用的信息。",
    };

    expect(() => validateWorkflowNodeData(prdInputSchema(), input, "Workflow input")).not.toThrow();
  });

  it("uses the plugin project's default Provider and model for every Agent node", () => {
    const agentSteps = collectAgentSteps(readWorkflow().steps ?? []);
    expect(agentSteps.length).toBeGreaterThan(0);
    for (const step of agentSteps) {
      expect(step.config).toMatchObject({
        provider: "{{origin_input.agent_provider}}",
        model: "{{origin_input.agent_model}}",
      });
    }
  });
});
