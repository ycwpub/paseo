import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WorkflowScriptSchema } from "@getpaseo/protocol/workflow/types";

const workflowPath = fileURLToPath(
  new URL(
    "../../../../../.agents/plugins/plugins/workflow-http-service/workflows/process-request.json",
    import.meta.url,
  ),
);

describe("bundled HTTP processor workflow", () => {
  it("uses the plugin project's selected Agent to produce a visible answer", () => {
    const workflow = WorkflowScriptSchema.parse(
      JSON.parse(readFileSync(workflowPath, "utf8")) as unknown,
    );
    const step = workflow.steps[0];

    expect(step).toMatchObject({
      type: "agent",
      outputMode: "normal",
      config: {
        provider: "{{origin_input.defaultAgentProvider}}",
        model: "{{origin_input.defaultAgentModel}}",
      },
    });
    expect(step?.type === "agent" ? step.initialPrompt : "").toContain(
      "{{origin_input.instruction}}",
    );
  });
});
