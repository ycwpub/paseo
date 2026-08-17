import type { Command } from "commander";
import type { SingleResult } from "../../output/index.js";
import { buildWorkflowPlan, type WorkflowPlan } from "./plan-model.js";
import { workflowPlanSchema } from "./schema.js";
import {
  connectWorkflowClient,
  resolveWorkflowCliPath,
  toWorkflowCommandError,
  type WorkflowCommandOptions,
} from "./shared.js";

export async function runWorkflowPlanCommand(
  scriptPath: string,
  options: WorkflowCommandOptions,
  _command: Command,
): Promise<SingleResult<WorkflowPlan>> {
  const client = await connectWorkflowClient(options.host);
  try {
    const payload = await client.workflowInspect({
      scriptPath: resolveWorkflowCliPath(scriptPath),
    });
    if (payload.error || !payload.script) {
      throw new Error(payload.error ?? `Workflow script not found: ${scriptPath}`);
    }
    return {
      type: "single",
      data: buildWorkflowPlan(payload.script),
      schema: workflowPlanSchema,
    };
  } catch (error) {
    throw toWorkflowCommandError("WORKFLOW_PLAN_FAILED", "plan workflow", error);
  } finally {
    await client.close().catch(() => {});
  }
}
