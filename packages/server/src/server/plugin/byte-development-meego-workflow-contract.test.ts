import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { WorkflowData, WorkflowJsonSchema } from "@getpaseo/protocol/workflow/data-contract";
import { validateWorkflowNodeData } from "../workflow/workflow-node-contract.js";

const workflowPath = fileURLToPath(
  new URL(
    "../../../../../.agents/plugins/plugins/byte-development/workflows/meego-source.json",
    import.meta.url,
  ),
);

interface MeegoWorkflow {
  steps?: Array<{
    id?: string;
    inputSchema?: WorkflowJsonSchema;
  }>;
}

function readMeegoInputSchema(): WorkflowJsonSchema {
  const workflow = JSON.parse(readFileSync(workflowPath, "utf8")) as MeegoWorkflow;
  const schema = workflow.steps?.find((step) => step.id === "meego_source")?.inputSchema;
  if (!schema) throw new Error("Byte development Meego input schema is missing");
  return schema;
}

describe("byte development Meego workflow input contract", () => {
  it.each<WorkflowData>([
    { action: "list" },
    { action: "resolve", url: "https://meego.example.com/story/detail/123" },
    { action: "login_begin" },
    { action: "login_complete", completeToken: "challenge-token" },
  ])("accepts plugin action $action", (input) => {
    expect(() =>
      validateWorkflowNodeData(readMeegoInputSchema(), input, "Workflow input"),
    ).not.toThrow();
  });
});
