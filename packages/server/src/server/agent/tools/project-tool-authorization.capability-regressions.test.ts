import { describe, expect, it, vi } from "vitest";

import { executeProjectAuthorizedTool } from "./project-tool-authorization.js";

describe("Project MCP tool authorization", () => {
  it("does not invoke a denied Paseo tool handler", async () => {
    const handler = vi.fn(async () => "unreachable");
    const authorize = vi.fn(async () => {
      throw new Error("PROJECT_PERMISSION_DENIED");
    });

    await expect(
      executeProjectAuthorizedTool({
        toolName: "delete_agent",
        workspaceId: "workspace-a",
        agentId: "agent-a",
        authorize,
        execute: handler,
      }),
    ).rejects.toThrow("PROJECT_PERMISSION_DENIED");
    expect(handler).not.toHaveBeenCalled();
    expect(authorize).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      agentId: "agent-a",
      source: "agent_mcp",
      request: { kind: "rpc", target: "mcp:paseo/delete_agent" },
    });
  });

  it("invokes the handler after an allowed decision", async () => {
    const handler = vi.fn(async () => "allowed");

    await expect(
      executeProjectAuthorizedTool({
        toolName: "read_agent",
        workspaceId: "workspace-a",
        agentId: "agent-a",
        authorize: async () => ({
          allowed: true,
          reason: "matched_allow",
          matchedRuleId: "allow-read",
          enforcement: "managed",
        }),
        execute: handler,
      }),
    ).resolves.toBe("allowed");
    expect(handler).toHaveBeenCalledOnce();
  });
});
