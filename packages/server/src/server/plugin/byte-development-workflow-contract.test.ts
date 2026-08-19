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
  inputSchema?: WorkflowJsonSchema;
}

function prdInputSchema(): WorkflowJsonSchema {
  const workflow = JSON.parse(readFileSync(workflowPath, "utf8")) as {
    steps?: WorkflowStepWithInputSchema[];
  };
  const schema = workflow.steps?.find((step) => step.id === "prd")?.inputSchema;
  if (!schema) throw new Error("Byte development PRD input schema is missing");
  return schema;
}

describe("byte development workflow input contract", () => {
  it("accepts the Project fields submitted by the development console", () => {
    const input: WorkflowData = {
      flow_title: "抖音省开发",
      projectId: "prj_flow",
      sourceProjectId: "prj_source",
      prd: "实现需求",
      prd_source: "manual",
      meego_url: "",
      meego_project_key: "",
      meego_work_item_id: "",
      meego_title: "",
      repository_path: "/workspace/project",
      lark_document_links: [],
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
});
