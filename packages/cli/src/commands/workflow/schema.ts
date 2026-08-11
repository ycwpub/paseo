import type { OutputSchema } from "../../output/index.js";
import type {
  WorkflowRun,
  WorkflowScriptFile,
  WorkflowScriptSummary,
} from "@getpaseo/protocol/workflow/types";

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
