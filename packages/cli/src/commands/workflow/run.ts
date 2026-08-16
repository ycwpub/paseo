import type { Command } from "commander";
import type { SingleResult } from "../../output/index.js";
import type { WorkflowRun } from "@getpaseo/protocol/workflow/types";
import { workflowRunSchema } from "./schema.js";
import { assertWorkflowCommandProtocol } from "./protocol.js";
import {
  connectWorkflowClient,
  resolveWorkflowCliPath,
  resolveWorkflowTargetInputMode,
  toWorkflowCommandError,
  type WorkflowCommandOptions,
} from "./shared.js";

export async function runWorkflowCommand(
  scriptPath: string,
  inputPayload: string | undefined,
  options: WorkflowCommandOptions,
  _command: Command,
): Promise<SingleResult<WorkflowRun>> {
  const client = await connectWorkflowClient(options.host);
  try {
    assertWorkflowCommandProtocol(client.getLastServerInfoMessage());
    const resolvedScriptPath = resolveWorkflowCliPath(scriptPath);
    const targetInputMode = resolveWorkflowTargetInputMode(options.inputType, options.node);
    if (targetInputMode === "node_input" && options.preset) {
      throw new Error("--preset cannot be used with --input-type node-input");
    }
    const resolvedInputPayload = await resolveWorkflowInputPayload({
      client,
      scriptPath: resolvedScriptPath,
      inputPayload,
      presetId: options.preset,
    });
    const payload = await client.workflowRun({
      scriptPath: resolvedScriptPath,
      inputPayload: resolvedInputPayload,
      ...(options.node ? { targetNodeId: options.node } : {}),
      ...(targetInputMode ? { targetInputMode } : {}),
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

async function resolveWorkflowInputPayload(input: {
  client: Awaited<ReturnType<typeof connectWorkflowClient>>;
  scriptPath: string;
  inputPayload: string | undefined;
  presetId: string | undefined;
}): Promise<string> {
  if (!input.presetId) {
    if (!input.inputPayload) {
      throw new Error("Provide input JSON or select a workflow input preset with --preset");
    }
    return input.inputPayload;
  }
  const inspected = await input.client.workflowInspect({ scriptPath: input.scriptPath });
  if (inspected.error || !inspected.script) {
    throw new Error(inspected.error ?? `Workflow not found: ${input.scriptPath}`);
  }
  const preset = inspected.script.script.inputPresets?.find(
    (candidate) => candidate.id === input.presetId,
  );
  if (!preset) {
    throw new Error(`Workflow input preset not found: ${input.presetId}`);
  }
  const override = input.inputPayload ? parseInputObject(input.inputPayload) : {};
  return JSON.stringify({
    ...preset.payload,
    ...override,
  });
}

function parseInputObject(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error("Workflow input must be valid JSON", { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Workflow input must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}
