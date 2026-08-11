import type { Command } from "commander";
import type { ListResult } from "../../output/index.js";
import { workflowInspectSchema, type WorkflowInspectRow } from "./schema.js";
import {
  connectWorkflowClient,
  resolveWorkflowCliPath,
  toWorkflowCommandError,
  type WorkflowCommandOptions,
} from "./shared.js";

export async function runWorkflowInspectCommand(
  scriptPath: string,
  options: WorkflowCommandOptions,
  _command: Command,
): Promise<ListResult<WorkflowInspectRow>> {
  const client = await connectWorkflowClient(options.host);
  try {
    const payload = await client.workflowInspect({
      scriptPath: resolveWorkflowCliPath(scriptPath),
    });
    if (payload.error || !payload.script) {
      throw new Error(payload.error ?? `Workflow script not found: ${scriptPath}`);
    }
    return {
      type: "list",
      data: [
        { key: "Path", value: payload.script.path },
        { key: "Name", value: payload.script.script.name },
        { key: "Description", value: payload.script.script.description ?? "" },
        { key: "Steps", value: String(payload.script.script.steps.length) },
      ],
      schema: workflowInspectSchema(payload.script),
    };
  } catch (error) {
    throw toWorkflowCommandError("WORKFLOW_INSPECT_FAILED", "inspect workflow", error);
  } finally {
    await client.close().catch(() => {});
  }
}
