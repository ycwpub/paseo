import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { createTestAgentClients } from "../test-utils/fake-agent-client.js";
import { AgentManager, type AgentManagerEvent } from "./agent-manager.js";

describe("AgentManager framework permissions", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("shows and resolves a framework-owned permission without calling the provider", async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "paseo-framework-permission-"));
    roots.push(cwd);
    const manager = new AgentManager({
      clients: createTestAgentClients(),
      logger: createTestLogger(),
    });
    const agent = await manager.createAgent({ provider: "codex", cwd }, undefined, {
      workspaceId: "ws-test",
    });
    const events: AgentManagerEvent[] = [];
    const unsubscribe = manager.subscribe((event) => events.push(event), {
      agentId: agent.id,
      replayState: false,
    });
    const onResponse = vi.fn(async () => undefined);

    const requestId = await manager.requestFrameworkPermission(agent.id, {
      request: {
        name: "cloud-knowledge-auth",
        kind: "other",
        title: "云文档需要登录授权",
      },
      onResponse,
    });

    expect(manager.getAgent(agent.id)?.pendingPermissions.has(requestId)).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === "agent_stream" &&
          event.event.type === "permission_requested" &&
          event.event.request.id === requestId,
      ),
    ).toBe(true);

    await manager.respondToPermission(agent.id, requestId, {
      behavior: "allow",
      selectedActionId: "retry-after-auth",
    });
    await manager.flushForShutdown();

    expect(onResponse).toHaveBeenCalledWith({
      behavior: "allow",
      selectedActionId: "retry-after-auth",
    });
    expect(manager.getAgent(agent.id)?.pendingPermissions.has(requestId)).toBe(false);
    unsubscribe();
    await manager.closeAgent(agent.id);
  });
});
