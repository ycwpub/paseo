import type { Command } from "commander";
import type { SingleResult } from "../../output/index.js";
import type { WorkflowRun } from "@getpaseo/protocol/workflow/types";
import { workflowRunSchema } from "./schema.js";
import {
  connectWorkflowClient,
  resolveWorkflowCliPath,
  toWorkflowCommandError,
  type WorkflowCommandOptions,
} from "./shared.js";

export async function runWorkflowCommand(
  scriptPath: string,
  inputPayload: string,
  options: WorkflowCommandOptions,
  _command: Command,
): Promise<SingleResult<WorkflowRun>> {
  const client = await connectWorkflowClient(options.host);
  try {
    const payload = await client.workflowRun({
      scriptPath: resolveWorkflowCliPath(scriptPath),
      inputPayload,
      ...(options.node ? { targetNodeId: options.node } : {}),
    });
    if (payload.error || !payload.run) {
      throw new Error(payload.error ?? "Workflow run did not start");
    }
    let run = payload.run;
    while (!options.background && run.status === "running") {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
      const next = await client.workflowGetRun({ runId: run.id });
      if (next.error || !next.run) {
        throw new Error(next.error ?? `Workflow run not found: ${run.id}`);
      }
      run = next.run;
    }
    return { type: "single", data: run, schema: workflowRunSchema };
  } catch (error) {
    throw toWorkflowCommandError("WORKFLOW_RUN_FAILED", "run workflow", error);
  } finally {
    await client.close().catch(() => {});
  }
}
