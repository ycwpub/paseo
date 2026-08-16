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
      features: { workflowCommandResultFd3: true, workflowProtocolVersion: 1 },
    });

    expect(buildWorkflowCommandProtocolInfo(serverInfo)).toEqual({
      protocol: "paseo.workflow.command-result",
      version: WORKFLOW_COMMAND_PROTOCOL_VERSION,
      daemonSupported: true,
      daemonVersion: "0.3.2",
      daemonProtocolVersion: 1,
      inputTransport: "stdin",
      inputFormat: "one JSON object",
      stdout: "logs",
      stderr: "diagnostics",
      resultTransport: "file descriptor 3",
      resultFormat: "one JSON object",
      failureSignal: "non-zero exit code",
      inputEnvelope: "{data,workflow.var,loop?,node.var}",
      resultEnvelope: "{data,modify.workflow.var?,modify.loop.var?,base_resp?}",
      flowControl: "user-defined fields in data",
      variableTypes: ["string", "int64 decimal string"],
      forExecutionModes: ["serial", "parallel"],
      parallelLoopVariableModification: false,
      agentLifecycles: ["workflow", "for", "single"],
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
    expect(info.daemonProtocolVersion).toBeNull();
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

  it("rejects a daemon that supports fd 3 but advertises a different contract", () => {
    const serverInfo = ServerInfoStatusPayloadSchema.parse({
      status: "server_info",
      serverId: "daemon-mismatched",
      version: "0.3.2",
      features: { workflowCommandResultFd3: true, workflowProtocolVersion: 2 },
    });

    expect(buildWorkflowCommandProtocolInfo(serverInfo).daemonSupported).toBe(false);
    try {
      assertWorkflowCommandProtocol(serverInfo);
      throw new Error("Expected a protocol version mismatch");
    } catch (error) {
      expect(error).toMatchObject({
        code: "WORKFLOW_COMMAND_PROTOCOL_UNSUPPORTED",
      });
    }
  });
});
