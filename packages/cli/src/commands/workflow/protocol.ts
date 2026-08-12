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

export const WORKFLOW_COMMAND_PROTOCOL_VERSION = 2;

export interface WorkflowCommandProtocolInfo {
  protocol: "paseo.workflow.command-result";
  version: number;
  daemonSupported: boolean;
  daemonVersion: string | null;
  inputTransport: "stdin";
  inputFormat: "one JSON object";
  stdout: "logs";
  stderr: "diagnostics";
  resultTransport: "file descriptor 3";
  resultFormat: "one JSON object";
  failureSignal: "non-zero exit code";
  reservedResultFields: ["error"];
  defaultResultFields: { control: "" };
  legacyStdoutResult: false;
}

export function buildWorkflowCommandProtocolInfo(
  serverInfo: ServerInfoStatusPayload | null,
): WorkflowCommandProtocolInfo {
  return {
    protocol: "paseo.workflow.command-result",
    version: WORKFLOW_COMMAND_PROTOCOL_VERSION,
    daemonSupported: serverInfo?.features?.workflowCommandResultFd3 === true,
    daemonVersion: serverInfo?.version ?? null,
    inputTransport: "stdin",
    inputFormat: "one JSON object",
    stdout: "logs",
    stderr: "diagnostics",
    resultTransport: "file descriptor 3",
    resultFormat: "one JSON object",
    failureSignal: "non-zero exit code",
    reservedResultFields: ["error"],
    defaultResultFields: { control: "" },
    legacyStdoutResult: false,
  };
}

export function assertWorkflowCommandProtocol(serverInfo: ServerInfoStatusPayload | null): void {
  if (serverInfo?.features?.workflowCommandResultFd3 === true) {
    return;
  }
  const error: CommandError = {
    code: "WORKFLOW_COMMAND_PROTOCOL_UNSUPPORTED",
    message: "The connected daemon does not support Workflow command protocol version 2",
    details:
      "Update the Paseo daemon. Bash and Python nodes now read JSON from stdin and write their only result JSON to file descriptor 3. stdout/stderr are logs and are never parsed as results.",
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
    `Input: ${info.inputTransport}, ${info.inputFormat}`,
    `Logs: stdout=${info.stdout}, stderr=${info.stderr}`,
    `Result: ${info.resultTransport}, ${info.resultFormat}`,
    `Failure: ${info.failureSignal}`,
    `Reserved result fields: ${info.reservedResultFields.join(", ")}`,
    `Default result fields: control=""`,
    `Legacy stdout result: ${info.legacyStdoutResult ? "enabled" : "disabled"}`,
  ].join("\n");
}
