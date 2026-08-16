import { z } from "zod";
import type { ServerInfoStatusPayload } from "@getpaseo/protocol/messages";
import {
  WorkflowNodeInputEnvelopeSchema,
  WorkflowNodeResultTransportSchema,
} from "@getpaseo/protocol/workflow/data-contract";
import {
  WORKFLOW_PROTOCOL_API_VERSION,
  WORKFLOW_PROTOCOL_KIND,
  WORKFLOW_PROTOCOL_REVISION,
  WORKFLOW_PROTOCOL_VERSION,
} from "@getpaseo/protocol/workflow/protocol-version";
import { WorkflowScriptSchema } from "@getpaseo/protocol/workflow/types";

type JsonSchemaDocument = Record<string, unknown>;

export interface WorkflowProtocolManifest {
  protocol: "paseo.workflow";
  apiVersion: typeof WORKFLOW_PROTOCOL_API_VERSION;
  kind: typeof WORKFLOW_PROTOCOL_KIND;
  version: typeof WORKFLOW_PROTOCOL_VERSION;
  revision: typeof WORKFLOW_PROTOCOL_REVISION;
  daemon: {
    checked: boolean;
    supported: boolean | null;
    version: string | null;
    protocolVersion: number | null;
    protocolRevision: number | null;
  };
  workflowDefinition: {
    schema: "#/schemas/workflow";
    nodeTypes: ["bash", "python", "agent", "switch", "for"];
    variableTypes: ["string", "int64"];
    int64Transport: "signed 64-bit decimal string";
  };
  commandNode: {
    appliesTo: ["bash", "python"];
    input: {
      transport: "stdin";
      mediaType: "application/json";
      cardinality: "exactly one JSON object";
      schema: "#/schemas/nodeInput";
    };
    logs: {
      stdout: "logs only";
      stderr: "diagnostics only";
    };
    result: {
      transport: "file descriptor 3";
      mediaType: "application/json";
      cardinality: "exactly one JSON object";
      schema: "#/schemas/nodeResult";
    };
    processFailure: "non-zero exit code";
    legacyStdoutResult: false;
  };
  variables: {
    workflow: {
      inputPath: "workflow.var";
      modifyPath: "modify.workflow.var";
      readable: true;
      mutable: true;
    };
    project: {
      inputPath: "project.var";
      modifyPath: null;
      readable: true;
      mutable: false;
      availability: "Agent nodes with a selected Project";
    };
    loop: {
      inputPath: "loop.var";
      modifyPath: "modify.loop.var";
      readable: true;
      mutable: "serial For only";
      builtIns: ["item", "index", "count"];
    };
    node: {
      inputPath: "node.var";
      modifyPath: null;
      readable: true;
      mutable: false;
    };
  };
  resultSemantics: {
    data: "required JSON object passed to the next node";
    modify: "optional declared Workflow or serial-Loop variable assignments";
    baseResponse: {
      path: "base_resp";
      optional: true;
      failure: "status_code != 0";
      message: "status_msg";
      retryForbidden: "forbid_retry != 0";
    };
    artifacts: "framework-owned and must not be returned by node code";
    flowControl: "user-defined fields in data";
  };
  agent: {
    outputModes: ["normal", "custom"];
    lifecycles: ["workflow", "for", "single"];
    subsequentPromptModes: ["reuse_initial", "custom"];
    promptPaths: ["data.*", "workflow.var.*", "project.var.*", "loop.var.*", "node.var.*"];
    completeInputAlias: "{{input}}";
  };
  forNode: {
    modes: ["array", "number", "true"];
    executionModes: ["serial", "parallel"];
    controls: ["break", "continue", ""];
    parallelLoopVariableModification: false;
  };
  singleNodeRun: {
    inputModes: ["upstream_output", "node_input"];
    nodeInputModeBehavior: "passes the complete node input envelope without framework mapping";
  };
  schemas: {
    workflow: JsonSchemaDocument;
    nodeInput: JsonSchemaDocument;
    nodeResult: JsonSchemaDocument;
  };
  examples: {
    nodeInput: Record<string, unknown>;
    nodeResult: Record<string, unknown>;
  };
}

export function buildWorkflowProtocolManifest(input: {
  serverInfo: ServerInfoStatusPayload | null;
  daemonChecked: boolean;
}): WorkflowProtocolManifest {
  const daemonProtocolVersion = input.serverInfo?.features?.workflowProtocolVersion ?? null;
  const daemonProtocolRevision = input.serverInfo?.features?.workflowProtocolRevision ?? null;
  const daemonSupported = input.daemonChecked
    ? input.serverInfo?.features?.workflowCommandResultFd3 === true &&
      daemonProtocolVersion === WORKFLOW_PROTOCOL_VERSION &&
      daemonProtocolRevision === WORKFLOW_PROTOCOL_REVISION
    : null;

  return {
    protocol: "paseo.workflow",
    apiVersion: WORKFLOW_PROTOCOL_API_VERSION,
    kind: WORKFLOW_PROTOCOL_KIND,
    version: WORKFLOW_PROTOCOL_VERSION,
    revision: WORKFLOW_PROTOCOL_REVISION,
    daemon: {
      checked: input.daemonChecked,
      supported: daemonSupported,
      version: input.serverInfo?.version ?? null,
      protocolVersion: daemonProtocolVersion,
      protocolRevision: daemonProtocolRevision,
    },
    workflowDefinition: {
      schema: "#/schemas/workflow",
      nodeTypes: ["bash", "python", "agent", "switch", "for"],
      variableTypes: ["string", "int64"],
      int64Transport: "signed 64-bit decimal string",
    },
    commandNode: {
      appliesTo: ["bash", "python"],
      input: {
        transport: "stdin",
        mediaType: "application/json",
        cardinality: "exactly one JSON object",
        schema: "#/schemas/nodeInput",
      },
      logs: {
        stdout: "logs only",
        stderr: "diagnostics only",
      },
      result: {
        transport: "file descriptor 3",
        mediaType: "application/json",
        cardinality: "exactly one JSON object",
        schema: "#/schemas/nodeResult",
      },
      processFailure: "non-zero exit code",
      legacyStdoutResult: false,
    },
    variables: {
      workflow: {
        inputPath: "workflow.var",
        modifyPath: "modify.workflow.var",
        readable: true,
        mutable: true,
      },
      project: {
        inputPath: "project.var",
        modifyPath: null,
        readable: true,
        mutable: false,
        availability: "Agent nodes with a selected Project",
      },
      loop: {
        inputPath: "loop.var",
        modifyPath: "modify.loop.var",
        readable: true,
        mutable: "serial For only",
        builtIns: ["item", "index", "count"],
      },
      node: {
        inputPath: "node.var",
        modifyPath: null,
        readable: true,
        mutable: false,
      },
    },
    resultSemantics: {
      data: "required JSON object passed to the next node",
      modify: "optional declared Workflow or serial-Loop variable assignments",
      baseResponse: {
        path: "base_resp",
        optional: true,
        failure: "status_code != 0",
        message: "status_msg",
        retryForbidden: "forbid_retry != 0",
      },
      artifacts: "framework-owned and must not be returned by node code",
      flowControl: "user-defined fields in data",
    },
    agent: {
      outputModes: ["normal", "custom"],
      lifecycles: ["workflow", "for", "single"],
      subsequentPromptModes: ["reuse_initial", "custom"],
      promptPaths: ["data.*", "workflow.var.*", "project.var.*", "loop.var.*", "node.var.*"],
      completeInputAlias: "{{input}}",
    },
    forNode: {
      modes: ["array", "number", "true"],
      executionModes: ["serial", "parallel"],
      controls: ["break", "continue", ""],
      parallelLoopVariableModification: false,
    },
    singleNodeRun: {
      inputModes: ["upstream_output", "node_input"],
      nodeInputModeBehavior: "passes the complete node input envelope without framework mapping",
    },
    schemas: {
      workflow: z.toJSONSchema(WorkflowScriptSchema, { target: "draft-2020-12" }),
      nodeInput: z.toJSONSchema(WorkflowNodeInputEnvelopeSchema, {
        target: "draft-2020-12",
      }),
      nodeResult: z.toJSONSchema(WorkflowNodeResultTransportSchema, {
        target: "draft-2020-12",
      }),
    },
    examples: {
      nodeInput: {
        data: { task: "review" },
        workflow: { var: { traceId: "trace-1" } },
        project: { var: { serviceName: "checkout" } },
        loop: { var: { item: { id: 7 }, index: 0, count: 1, cursor: "0" } },
        node: { var: { role: "reviewer" } },
      },
      nodeResult: {
        data: { answer: "done", control: "" },
        modify: {
          workflow: { var: { traceId: "trace-2" } },
          loop: { var: { cursor: "1" } },
        },
      },
    },
  };
}

export function daemonSupportsWorkflowProtocol(
  serverInfo: ServerInfoStatusPayload | null,
): boolean {
  return (
    serverInfo?.features?.workflowCommandResultFd3 === true &&
    serverInfo.features.workflowProtocolVersion === WORKFLOW_PROTOCOL_VERSION &&
    serverInfo.features.workflowProtocolRevision === WORKFLOW_PROTOCOL_REVISION
  );
}
