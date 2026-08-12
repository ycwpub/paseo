import { afterEach, describe, expect, it } from "vitest";
import { DaemonClient, type DaemonTransport } from "./daemon-client.js";

function createTransport() {
  const sent: string[] = [];
  let onMessage: (data: unknown) => void = () => {};
  let onOpen: () => void = () => {};
  const transport: DaemonTransport = {
    send: (data) => {
      if (typeof data === "string") {
        sent.push(data);
      }
    },
    close: () => {},
    onMessage: (handler) => {
      onMessage = handler;
      return () => {};
    },
    onOpen: (handler) => {
      onOpen = handler;
      return () => {};
    },
    onClose: () => () => {},
    onError: () => () => {},
  };
  return {
    transport,
    sent,
    open(features?: Record<string, boolean>) {
      onOpen();
      sent.length = 0;
      onMessage(
        JSON.stringify({
          type: "session",
          message: {
            type: "status",
            payload: {
              status: "server_info",
              serverId: "srv_workflow_node_run",
              hostname: null,
              version: null,
              ...(features ? { features } : {}),
            },
          },
        }),
      );
    },
    respond(message: unknown) {
      onMessage(JSON.stringify({ type: "session", message }));
    },
  };
}

const clients: DaemonClient[] = [];

afterEach(async () => {
  await Promise.all(clients.map((client) => client.close()));
  clients.length = 0;
});

describe("DaemonClient workflow node runs", () => {
  it("sends targetNodeId when the daemon advertises support", async () => {
    const mock = createTransport();
    const client = new DaemonClient({
      url: "ws://test",
      clientId: "workflow_node_run_supported",
      transportFactory: () => mock.transport,
      reconnect: { enabled: false },
    });
    clients.push(client);
    const connecting = client.connect();
    mock.open({ workflowNodeRun: true });
    await connecting;

    const result = client.workflowRun({
      requestId: "request-node-run",
      scriptPath: "/tmp/workflow.json",
      inputPayload: "{}",
      targetNodeId: "worker",
    });
    await Promise.resolve();
    const request = JSON.parse(mock.sent[0] ?? "{}").message;
    mock.respond({
      type: "workflow/run/response",
      payload: {
        requestId: "request-node-run",
        run: null,
        error: null,
      },
    });

    await expect(result).resolves.toEqual({
      requestId: "request-node-run",
      run: null,
      error: null,
    });
    expect(request).toEqual({
      type: "workflow/run",
      requestId: "request-node-run",
      scriptPath: "/tmp/workflow.json",
      inputPayload: "{}",
      targetNodeId: "worker",
    });
  });

  it("rejects node runs before dispatch when the daemon is too old", async () => {
    const mock = createTransport();
    const client = new DaemonClient({
      url: "ws://test",
      clientId: "workflow_node_run_legacy",
      transportFactory: () => mock.transport,
      reconnect: { enabled: false },
    });
    clients.push(client);
    const connecting = client.connect();
    mock.open();
    await connecting;

    await expect(
      client.workflowRun({
        scriptPath: "/tmp/workflow.json",
        inputPayload: "{}",
        targetNodeId: "worker",
      }),
    ).rejects.toThrow("Update the host to run an individual workflow node.");
    expect(mock.sent).toEqual([]);
  });
});
