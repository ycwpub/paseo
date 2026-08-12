import { describe, expect, it } from "vitest";
import { ServerInfoStatusPayloadSchema } from "@getpaseo/protocol/messages";
import {
  assertWorkflowCommandProtocol,
  buildWorkflowCommandProtocolInfo,
  WORKFLOW_COMMAND_PROTOCOL_VERSION,
} from "./protocol.js";

describe("Workflow command protocol CLI", () => {
  it("returns a machine-readable description for a supporting daemon", () => {
    const serverInfo = ServerInfoStatusPayloadSchema.parse({
      status: "server_info",
      serverId: "daemon-current",
      version: "0.3.2",
      features: { workflowCommandResultFd3: true },
    });

    expect(buildWorkflowCommandProtocolInfo(serverInfo)).toEqual({
      protocol: "paseo.workflow.command-result",
      version: WORKFLOW_COMMAND_PROTOCOL_VERSION,
      daemonSupported: true,
      daemonVersion: "0.3.2",
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
    });
  });

  it("reports an older daemon without pretending the legacy protocol is supported", () => {
    const serverInfo = ServerInfoStatusPayloadSchema.parse({
      status: "server_info",
      serverId: "daemon-older",
      version: "0.3.1",
    });

    const info = buildWorkflowCommandProtocolInfo(serverInfo);
    expect(info.daemonSupported).toBe(false);
    expect(info.legacyStdoutResult).toBe(false);

    try {
      assertWorkflowCommandProtocol(serverInfo);
      throw new Error("Expected an unsupported protocol error");
    } catch (error) {
      expect(error).toMatchObject({
        code: "WORKFLOW_COMMAND_PROTOCOL_UNSUPPORTED",
      });
    }
  });
});
