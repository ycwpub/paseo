import { createHash } from "node:crypto";
import path from "node:path";
import {
  WorkflowScriptSchema,
  type WorkflowScript,
  type WorkflowStep,
} from "@getpaseo/protocol/workflow/types";
import { writePrivateFileAtomicSync } from "../private-files.js";

export function buildPluginHttpCustomWorkflow(input: {
  name: string;
  step: WorkflowStep;
}): WorkflowScript {
  if (input.step.nextStepId !== undefined && input.step.nextStepId !== null) {
    throw new Error("HTTP 自定义处理节点不能指定外部下游节点");
  }
  return WorkflowScriptSchema.parse({
    apiVersion: "paseo.sh/workflow/v1",
    kind: "Workflow",
    version: 1,
    name: input.name,
    description: "由 HTTP 服务插件托管的自定义处理节点。",
    steps: [{ ...input.step, nextStepId: undefined }],
  });
}

export function materializePluginHttpCustomWorkflow(input: {
  directory: string;
  pluginId: string;
  projectId: string;
  listenerId: string;
  routeId: string;
  name: string;
  step: WorkflowStep;
}): string {
  const identity = [input.pluginId, input.projectId, input.listenerId, input.routeId].join(
    "\u0000",
  );
  const fileName = `${createHash("sha256").update(identity).digest("hex")}.json`;
  const filePath = path.join(input.directory, fileName);
  const script = buildPluginHttpCustomWorkflow({ name: input.name, step: input.step });
  writePrivateFileAtomicSync(filePath, `${JSON.stringify(script, null, 2)}\n`);
  return filePath;
}
