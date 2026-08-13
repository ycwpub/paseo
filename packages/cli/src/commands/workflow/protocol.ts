import type { Command } from "commander";
import type { ServerInfoStatusPayload } from "@getpaseo/protocol/messages";
import type {
  AnyCommandResult,
  CommandError,
  OutputOptions,
  OutputSchema,
  SingleResult,
} from "../../output/index.js";
import { connectWorkflowClient, type WorkflowCommandOptions } from "./shared.js";

export const WORKFLOW_COMMAND_PROTOCOL_VERSION = 1;

export interface WorkflowCommandProtocolInfo {
  protocol: "paseo.workflow.command-result";
  version: number;
  daemonSupported: boolean;
  daemonVersion: string | null;
  daemonProtocolVersion: number | null;
  inputTransport: "stdin";
  inputFormat: "one JSON object";
  stdout: "logs";
  stderr: "diagnostics";
  resultTransport: "file descriptor 3";
  resultFormat: "one JSON object";
  failureSignal: "non-zero exit code";
  inputEnvelope: "{data,workflow.var,node.var}";
  resultEnvelope: "{data,modify,base_resp,artifacts}";
  flowControl: "user-defined fields in data";
  variableTypes: ["string", "int64 decimal string"];
  legacyStdoutResult: false;
}

export function buildWorkflowCommandProtocolInfo(
  serverInfo: ServerInfoStatusPayload | null,
): WorkflowCommandProtocolInfo {
  return {
    protocol: "paseo.workflow.command-result",
    version: WORKFLOW_COMMAND_PROTOCOL_VERSION,
    daemonSupported:
      serverInfo?.features?.workflowCommandResultFd3 === true &&
      serverInfo.features.workflowProtocolVersion === WORKFLOW_COMMAND_PROTOCOL_VERSION,
    daemonVersion: serverInfo?.version ?? null,
    daemonProtocolVersion: serverInfo?.features?.workflowProtocolVersion ?? null,
    inputTransport: "stdin",
    inputFormat: "one JSON object",
    stdout: "logs",
    stderr: "diagnostics",
    resultTransport: "file descriptor 3",
    resultFormat: "one JSON object",
    failureSignal: "non-zero exit code",
    inputEnvelope: "{data,workflow.var,node.var}",
    resultEnvelope: "{data,modify,base_resp,artifacts}",
    flowControl: "user-defined fields in data",
    variableTypes: ["string", "int64 decimal string"],
    legacyStdoutResult: false,
  };
}

export function assertWorkflowCommandProtocol(serverInfo: ServerInfoStatusPayload | null): void {
  if (
    serverInfo?.features?.workflowCommandResultFd3 === true &&
    serverInfo.features.workflowProtocolVersion === WORKFLOW_COMMAND_PROTOCOL_VERSION
  ) {
    return;
  }
  const error: CommandError = {
    code: "WORKFLOW_COMMAND_PROTOCOL_UNSUPPORTED",
    message: "The connected daemon does not support Workflow command protocol version 1",
    details: `Update the Paseo daemon. The daemon advertises Workflow protocol version ${
      serverInfo?.features?.workflowProtocolVersion ?? "unknown"
    }, but this CLI requires version ${WORKFLOW_COMMAND_PROTOCOL_VERSION}. Bash and Python nodes read {data,workflow.var,node.var} from stdin and write {data,modify,base_resp,artifacts} to file descriptor 3. stdout/stderr are logs and are never parsed as results.`,
  };
  throw error;
}

export async function runWorkflowProtocolCommand(
  options: WorkflowCommandOptions,
  _command: Command,
): Promise<SingleResult<WorkflowCommandProtocolInfo>> {
  const client = await connectWorkflowClient(options.host);
  try {
    const info = buildWorkflowCommandProtocolInfo(client.getLastServerInfoMessage());
    return { type: "single", data: info, schema: workflowCommandProtocolSchema };
  } finally {
    await client.close().catch(() => {});
  }
}

const workflowCommandProtocolSchema: OutputSchema<WorkflowCommandProtocolInfo> = {
  idField: "protocol",
  columns: [
    { header: "PROTOCOL", field: "protocol", width: 31 },
    { header: "VERSION", field: "version", width: 7 },
    { header: "DAEMON SUPPORT", field: "daemonSupported", width: 14 },
    { header: "DAEMON VERSION", field: (info) => info.daemonVersion ?? "-", width: 16 },
    {
      header: "DAEMON PROTOCOL",
      field: (info) => info.daemonProtocolVersion ?? "-",
      width: 15,
    },
  ],
  renderHuman: renderWorkflowCommandProtocol,
};

function renderWorkflowCommandProtocol(
  result: AnyCommandResult<WorkflowCommandProtocolInfo>,
  _options: OutputOptions,
): string {
  const info = result.type === "single" ? result.data : result.data[0];
  if (!info) {
    return "";
  }
  return [
    `Protocol: ${info.protocol}`,
    `Version: ${info.version}`,
    `Daemon support: ${info.daemonSupported ? "yes" : "no"}`,
    `Daemon version: ${info.daemonVersion ?? "unknown"}`,
    `Daemon protocol version: ${info.daemonProtocolVersion ?? "unknown"}`,
    `Input: ${info.inputTransport}, ${info.inputFormat}`,
    `Logs: stdout=${info.stdout}, stderr=${info.stderr}`,
    `Result: ${info.resultTransport}, ${info.resultFormat}`,
    `Failure: ${info.failureSignal}`,
    `Input envelope: ${info.inputEnvelope}`,
    `Result envelope: ${info.resultEnvelope}`,
    `Flow control: ${info.flowControl}`,
    `Variable types: ${info.variableTypes.join(", ")}`,
    `Legacy stdout result: ${info.legacyStdoutResult ? "enabled" : "disabled"}`,
  ].join("\n");
}
