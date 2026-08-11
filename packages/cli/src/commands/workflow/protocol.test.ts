import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { ServerInfoStatusPayloadSchema } from "@getpaseo/protocol/messages";
import {
  assertWorkflowCommandProtocol,
  buildWorkflowCommandProtocolInfo,
  runWorkflowProtocolCommand,
  WORKFLOW_PROTOCOL_REVISION,
  WORKFLOW_PROTOCOL_VERSION,
} from "./protocol.js";

describe("Workflow protocol CLI", () => {
  it("returns exact schemas and semantics for a supporting daemon", () => {
    const serverInfo = ServerInfoStatusPayloadSchema.parse({
      status: "server_info",
      serverId: "daemon-current",
      version: "0.3.2",
      features: {
        workflowCommandResultFd3: true,
        workflowProtocolVersion: WORKFLOW_PROTOCOL_VERSION,
        workflowProtocolRevision: WORKFLOW_PROTOCOL_REVISION,
      },
    });

    const info = buildWorkflowCommandProtocolInfo(serverInfo);

    expect(info).toMatchObject({
      protocol: "paseo.workflow",
      apiVersion: "paseo.sh/workflow/v1",
      kind: "Workflow",
      version: WORKFLOW_PROTOCOL_VERSION,
      revision: WORKFLOW_PROTOCOL_REVISION,
      daemon: {
        checked: true,
        supported: true,
        version: "0.3.2",
        protocolVersion: WORKFLOW_PROTOCOL_VERSION,
        protocolRevision: WORKFLOW_PROTOCOL_REVISION,
      },
      commandNode: {
        input: { transport: "stdin", schema: "#/schemas/nodeInput" },
        logs: { stdout: "logs only", stderr: "diagnostics only" },
        result: { transport: "file descriptor 3", schema: "#/schemas/nodeResult" },
        legacyStdoutResult: false,
      },
      pythonNode: {
        executionModes: ["inline", "module-function"],
        nodeEnvironmentOverrides: true,
      },
      runtime: {
        defaultCwd: "isolated run directory",
        templateVariables: expect.arrayContaining([
          "run.dir",
          "run.artifacts_dir",
          "attempt.index",
        ]),
      },
      variables: {
        originInput: { inputPath: "origin_input", mutable: false },
        workflow: { inputPath: "workflow.var", modifyPath: "modify.workflow.var" },
        project: { inputPath: "project.var", modifyPath: null },
        loop: { inputPath: "loop.var", modifyPath: "modify.loop.var" },
        node: { inputPath: "node.var", modifyPath: null },
      },
      agent: {
        promptPaths: [
          "data.*",
          "origin_input.*",
          "workflow.var.*",
          "project.var.*",
          "loop.var.*",
          "node.var.*",
        ],
        completeInputAlias: "{{input}}",
        outputValidationRepair: "retry prompt includes the JSON Schema validator error",
      },
      forNode: {
        conditionFields: ["breakWhen", "continueWhen"],
      },
      safety: {
        fields: ["sideEffects", "requiresWriteBack", "idempotencyKey", "rollbackHint"],
      },
    });
    expect(info.schemas.workflow).toMatchObject({
      type: "object",
      properties: {
        apiVersion: { const: "paseo.sh/workflow/v1" },
        version: { const: 1 },
        steps: { type: "array" },
      },
    });
    expect(info.schemas.nodeInput).toMatchObject({
      type: "object",
      properties: {
        data: { type: "object" },
        origin_input: { type: "object" },
        project: { type: "object" },
        loop: { type: "object" },
      },
      required: ["data", "origin_input", "workflow", "node"],
      additionalProperties: false,
    });
    expect(info.schemas.nodeResult).toMatchObject({
      type: "object",
      properties: {
        data: { type: "object" },
        modify: { type: "object" },
        base_resp: { type: "object" },
      },
      required: ["data"],
      additionalProperties: false,
    });
  });

  it("supports local discovery without daemon state", async () => {
    const result = await runWorkflowProtocolCommand({ local: true }, new Command("protocol"));

    expect(result.data.daemon).toEqual({
      checked: false,
      supported: null,
      version: null,
      protocolVersion: null,
      protocolRevision: null,
    });
    expect(result.data.schemas.workflow).toBeDefined();
    expect(result.data.schemas.nodeInput).toBeDefined();
    expect(result.data.schemas.nodeResult).toBeDefined();
  });

  it("rejects a daemon missing the current protocol revision", () => {
    const serverInfo = ServerInfoStatusPayloadSchema.parse({
      status: "server_info",
      serverId: "daemon-older",
      version: "0.3.1",
      features: {
        workflowCommandResultFd3: true,
        workflowProtocolVersion: WORKFLOW_PROTOCOL_VERSION,
      },
    });

    expect(buildWorkflowCommandProtocolInfo(serverInfo).daemon.supported).toBe(false);
    expect(() => assertWorkflowCommandProtocol(serverInfo)).toThrow(
      expect.objectContaining({
        code: "WORKFLOW_COMMAND_PROTOCOL_UNSUPPORTED",
      }),
    );
  });

  it("rejects a daemon that advertises a different major contract", () => {
    const serverInfo = ServerInfoStatusPayloadSchema.parse({
      status: "server_info",
      serverId: "daemon-mismatched",
      version: "0.3.2",
      features: {
        workflowCommandResultFd3: true,
        workflowProtocolVersion: 2,
        workflowProtocolRevision: WORKFLOW_PROTOCOL_REVISION,
      },
    });

    expect(buildWorkflowCommandProtocolInfo(serverInfo).daemon.supported).toBe(false);
    expect(() => assertWorkflowCommandProtocol(serverInfo)).toThrow(
      expect.objectContaining({
        code: "WORKFLOW_COMMAND_PROTOCOL_UNSUPPORTED",
      }),
    );
  });
});
