import type { OutputSchema } from "../../output/index.js";
import type {
  WorkflowNodeRun,
  WorkflowRun,
  WorkflowScriptFile,
  WorkflowScriptSummary,
} from "@getpaseo/protocol/workflow/types";
import type { WorkflowPlan } from "./plan-model.js";

export const workflowScriptSchema: OutputSchema<WorkflowScriptSummary> = {
  idField: "path",
  columns: [
    { header: "NAME", field: "name", width: 24 },
    { header: "STEPS", field: "stepCount", width: 8 },
    { header: "MODIFIED", field: "modifiedAt", width: 24 },
    { header: "PATH", field: "path", width: 60 },
  ],
};

export const workflowRunSchema: OutputSchema<WorkflowRun> = {
  idField: "id",
  columns: [
    { header: "RUN ID", field: "id", width: 36 },
    { header: "STATUS", field: "status", width: 10 },
    { header: "OUTPUT FILE", field: (run) => run.outputFilePath ?? "-", width: 60 },
    { header: "CONTROL", field: "control", width: 24 },
    { header: "ERROR", field: (run) => run.error ?? "-", width: 40 },
  ],
};

export const workflowNodeRunSchema: OutputSchema<WorkflowNodeRun> = {
  idField: "id",
  columns: [
    { header: "NODE", field: "stepId", width: 24 },
    { header: "STATUS", field: "status", width: 10 },
    { header: "ATTEMPT", field: (run) => `${run.attempt}/${run.maxAttempts}`, width: 8 },
    { header: "STARTED", field: "startedAt", width: 24 },
    { header: "ENDED", field: (run) => run.endedAt ?? "-", width: 24 },
    { header: "ERROR", field: (run) => run.error ?? "-", width: 40 },
  ],
  renderHuman: (result) => {
    const runs = result.type === "list" ? result.data : [result.data];
    return runs.map(formatWorkflowNodeRun).join("\n\n");
  },
};

export const workflowPlanSchema: OutputSchema<WorkflowPlan> = {
  idField: "path",
  columns: [
    { header: "NAME", field: "name", width: 24 },
    { header: "NODES", field: "nodeCount", width: 7 },
    {
      header: "WRITE BACK",
      field: (plan) => (plan.requiresWriteBack ? "required" : "no"),
      width: 10,
    },
    {
      header: "SIDE EFFECTS",
      field: (plan) => plan.sideEffects.join(", ") || "-",
      width: 40,
    },
    { header: "PATH", field: "path", width: 60 },
  ],
};

export interface WorkflowInspectRow {
  key: string;
  value: string;
}

export function workflowInspectSchema(
  scriptFile: WorkflowScriptFile,
): OutputSchema<WorkflowInspectRow> {
  return {
    idField: "key",
    columns: [
      { header: "FIELD", field: "key", width: 18 },
      { header: "VALUE", field: "value", width: 100 },
    ],
    serialize: () => scriptFile,
  };
}

function formatWorkflowNodeRun(run: WorkflowNodeRun): string {
  const lines = [
    `${run.stepId} · ${run.status} · attempt ${run.attempt}/${run.maxAttempts}`,
    `Started: ${run.startedAt}`,
    `Ended: ${run.endedAt ?? "-"}`,
    `Input: ${run.inputPayload ?? "-"}`,
    `Output: ${run.outputPayload ?? "-"}`,
  ];
  if (run.cwd) lines.push(`CWD: ${run.cwd}`);
  if (run.exitCode !== undefined && run.exitCode !== null) {
    lines.push(`Exit code: ${run.exitCode}`);
  }
  if (run.stdout) lines.push(`stdout:\n${run.stdout}`);
  if (run.stderr) lines.push(`stderr:\n${run.stderr}`);
  if (run.agentId) lines.push(`Agent: ${run.agentId}`);
  if (run.error) lines.push(`Error: ${run.error}`);
  if (run.artifacts?.length) {
    lines.push(`Artifacts:\n${run.artifacts.map((artifact) => `- ${artifact.name}`).join("\n")}`);
  }
  return lines.join("\n");
}
