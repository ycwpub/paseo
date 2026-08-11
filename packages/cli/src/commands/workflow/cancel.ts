import type { Command } from "commander";
import type { SingleResult } from "../../output/index.js";
import type { WorkflowRun } from "@getpaseo/protocol/workflow/types";
import { workflowRunSchema } from "./schema.js";
import {
  connectWorkflowClient,
  toWorkflowCommandError,
  type WorkflowCommandOptions,
} from "./shared.js";

export async function runWorkflowCancelCommand(
  runId: string,
  options: WorkflowCommandOptions,
  _command: Command,
): Promise<SingleResult<WorkflowRun>> {
  const client = await connectWorkflowClient(options.host);
  try {
    const payload = await client.workflowCancelRun({ runId });
    if (payload.error || !payload.run) {
      throw new Error(payload.error ?? `Workflow run not found: ${runId}`);
    }
    return { type: "single", data: payload.run, schema: workflowRunSchema };
  } catch (error) {
    throw toWorkflowCommandError("WORKFLOW_CANCEL_FAILED", "cancel workflow run", error);
  } finally {
    await client.close().catch(() => {});
  }
}
