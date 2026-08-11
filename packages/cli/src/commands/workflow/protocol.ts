import type { Command } from "commander";
import type { ServerInfoStatusPayload } from "@getpaseo/protocol/messages";
import {
  WORKFLOW_PROTOCOL_REVISION,
  WORKFLOW_PROTOCOL_VERSION,
} from "@getpaseo/protocol/workflow/protocol-version";
import type {
  AnyCommandResult,
  CommandError,
  OutputOptions,
  OutputSchema,
  SingleResult,
} from "../../output/index.js";
import {
  buildWorkflowProtocolManifest,
  daemonSupportsWorkflowProtocol,
  type WorkflowProtocolManifest,
} from "./protocol-manifest.js";
import { connectWorkflowClient, type WorkflowCommandOptions } from "./shared.js";

export { WORKFLOW_PROTOCOL_REVISION, WORKFLOW_PROTOCOL_VERSION };
export type WorkflowCommandProtocolInfo = WorkflowProtocolManifest;

interface WorkflowProtocolCommandOptions extends WorkflowCommandOptions {
  local?: boolean;
}

export function buildWorkflowCommandProtocolInfo(
  serverInfo: ServerInfoStatusPayload | null,
  daemonChecked = true,
): WorkflowCommandProtocolInfo {
  return buildWorkflowProtocolManifest({ serverInfo, daemonChecked });
}

export function assertWorkflowCommandProtocol(serverInfo: ServerInfoStatusPayload | null): void {
  if (daemonSupportsWorkflowProtocol(serverInfo)) {
    return;
  }
  const error: CommandError = {
    code: "WORKFLOW_COMMAND_PROTOCOL_UNSUPPORTED",
    message: `The connected daemon does not support Workflow protocol ${WORKFLOW_PROTOCOL_VERSION}.${WORKFLOW_PROTOCOL_REVISION}`,
    details: `Update the Paseo daemon. It advertises Workflow protocol ${
      serverInfo?.features?.workflowProtocolVersion ?? "unknown"
    }.${serverInfo?.features?.workflowProtocolRevision ?? "unknown"}, but this CLI requires ${WORKFLOW_PROTOCOL_VERSION}.${WORKFLOW_PROTOCOL_REVISION}. Run \`paseo workflow protocol --local --json\` to inspect the CLI's complete Workflow definition, node input, and node result schemas.`,
  };
  throw error;
}

export async function runWorkflowProtocolCommand(
  options: WorkflowProtocolCommandOptions,
  _command: Command,
): Promise<SingleResult<WorkflowCommandProtocolInfo>> {
  if (options.local) {
    return {
      type: "single",
      data: buildWorkflowCommandProtocolInfo(null, false),
      schema: workflowCommandProtocolSchema,
    };
  }

  const client = await connectWorkflowClient(options.host);
  try {
    return {
      type: "single",
      data: buildWorkflowCommandProtocolInfo(client.getLastServerInfoMessage()),
      schema: workflowCommandProtocolSchema,
    };
  } finally {
    await client.close().catch(() => {});
  }
}

const workflowCommandProtocolSchema: OutputSchema<WorkflowCommandProtocolInfo> = {
  idField: "protocol",
  columns: [
    { header: "PROTOCOL", field: "protocol", width: 20 },
    { header: "VERSION", field: (info) => `${info.version}.${info.revision}`, width: 9 },
    { header: "DAEMON CHECKED", field: (info) => info.daemon.checked, width: 14 },
    {
      header: "DAEMON SUPPORT",
      field: (info) => info.daemon.supported ?? "-",
      width: 14,
    },
    { header: "DAEMON VERSION", field: (info) => info.daemon.version ?? "-", width: 16 },
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
  let daemonStatus = "unsupported";
  if (!info.daemon.checked) {
    daemonStatus = "not checked (--local)";
  } else if (info.daemon.supported) {
    daemonStatus = "supported";
  }
  return [
    `Protocol: ${info.protocol}`,
    `API version: ${info.apiVersion}`,
    `Contract: ${info.version}.${info.revision}`,
    `Daemon: ${daemonStatus}`,
    `Daemon version: ${info.daemon.version ?? "unknown"}`,
    `Daemon contract: ${info.daemon.protocolVersion ?? "unknown"}.${info.daemon.protocolRevision ?? "unknown"}`,
    `Workflow nodes: ${info.workflowDefinition.nodeTypes.join(", ")}`,
    `Command input: ${info.commandNode.input.transport}, ${info.commandNode.input.cardinality}`,
    `Command logs: stdout=${info.commandNode.logs.stdout}, stderr=${info.commandNode.logs.stderr}`,
    `Command result: ${info.commandNode.result.transport}, ${info.commandNode.result.cardinality}`,
    `Process failure: ${info.commandNode.processFailure}`,
    `Variable scopes: ${Object.values(info.variables)
      .map((scope) => scope.inputPath)
      .join(", ")}`,
    `Agent prompt paths: ${info.agent.promptPaths.join(", ")}, ${info.agent.completeInputAlias}`,
    `For modes: ${info.forNode.modes.join(", ")}; execution=${info.forNode.executionModes.join(", ")}`,
    "JSON output includes exact Workflow definition, node input, and node result JSON Schemas.",
  ].join("\n");
}
