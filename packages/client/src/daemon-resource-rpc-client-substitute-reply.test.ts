import { describe, expect, it, vi } from "vitest";
import { DaemonResourceRpcClient } from "./daemon-resource-rpc-client.js";

describe("DaemonResourceRpcClient substitute reply", () => {
  it("sends an Agent-scoped reply request and waits for its matching response", async () => {
    const sendRequest = vi.fn(async () => ({
      requestId: "request-1",
      reply: null,
      error: null,
    }));
    const client = new DaemonResourceRpcClient(sendRequest);

    await client.replyLarkSubstitute({
      requestId: "request-1",
      agentId: "agent-1",
      text: "优化后的最终答案",
    });

    expect(sendRequest).toHaveBeenCalledWith({
      requestId: "request-1",
      message: {
        type: "channel.lark.substitute.reply.request",
        agentId: "agent-1",
        text: "优化后的最终答案",
      },
      responseType: "channel.lark.substitute.reply.response",
    });
  });
});
