import type { Command } from "commander";
import type { ListResult } from "../../output/index.js";
import type { WorkflowScriptSummary } from "@getpaseo/protocol/workflow/types";
import { workflowScriptSchema } from "./schema.js";
import {
  connectWorkflowClient,
  toWorkflowCommandError,
  type WorkflowCommandOptions,
} from "./shared.js";

export async function runWorkflowLsCommand(
  options: WorkflowCommandOptions,
  _command: Command,
): Promise<ListResult<WorkflowScriptSummary>> {
  const client = await connectWorkflowClient(options.host);
  try {
    const payload = await client.workflowList();
    if (payload.error) {
      throw new Error(payload.error);
    }
    return { type: "list", data: payload.scripts, schema: workflowScriptSchema };
  } catch (error) {
    throw toWorkflowCommandError("WORKFLOW_LIST_FAILED", "list workflows", error);
  } finally {
    await client.close().catch(() => {});
  }
}
