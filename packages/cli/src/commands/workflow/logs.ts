import type { Command } from "commander";
import type { ListResult } from "../../output/index.js";
import type { WorkflowNodeRun } from "@getpaseo/protocol/workflow/types";
import { workflowNodeRunSchema } from "./schema.js";
import {
  connectWorkflowClient,
  toWorkflowCommandError,
  type WorkflowCommandOptions,
} from "./shared.js";

export async function runWorkflowLogsCommand(
  runId: string,
  options: WorkflowCommandOptions,
  _command: Command,
): Promise<ListResult<WorkflowNodeRun>> {
  const client = await connectWorkflowClient(options.host);
  try {
    const payload = await client.workflowGetRun({ runId });
    if (payload.error || !payload.run) {
      throw new Error(payload.error ?? `Workflow run not found: ${runId}`);
    }
    const nodeRuns = options.node
      ? payload.run.nodeRuns.filter((nodeRun) => nodeRun.stepId === options.node)
      : payload.run.nodeRuns;
    if (options.node && nodeRuns.length === 0) {
      throw new Error(`Workflow node run not found: ${options.node}`);
    }
    return { type: "list", data: nodeRuns, schema: workflowNodeRunSchema };
  } catch (error) {
    throw toWorkflowCommandError("WORKFLOW_LOGS_FAILED", "read workflow run logs", error);
  } finally {
    await client.close().catch(() => {});
  }
}
