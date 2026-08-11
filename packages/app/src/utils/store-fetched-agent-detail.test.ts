import { describe, expect, it } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { AgentSnapshotPayload } from "@getpaseo/protocol/messages";
import { useSessionStore } from "@/stores/session-store";
import { storeFetchedAgentDetail } from "./store-fetched-agent-detail";

function createAgentSnapshot(input: {
  id: string;
  workspaceId: string;
  archivedAt: string | null;
}): AgentSnapshotPayload {
  return {
    id: input.id,
    provider: "codex",
    cwd: "/repo",
    workspaceId: input.workspaceId,
    model: null,
    createdAt: "2026-08-11T08:00:00.000Z",
    updatedAt: "2026-08-11T08:05:00.000Z",
    lastUserMessageAt: "2026-08-11T08:01:00.000Z",
    status: "idle",
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    title: "Archived workflow agent",
    labels: { "paseo.workflow-run": "run-1" },
    archivedAt: input.archivedAt,
  };
}

describe("storeFetchedAgentDetail", () => {
  it("keeps an explicitly fetched archived Agent available for a pinned history tab", () => {
    const serverId = "workflow-host";
    const agentId = "7079c8c1-d789-4b26-acf5-412bf6d30667";
    const store = useSessionStore.getState();
    store.initializeSession(serverId, null as unknown as DaemonClient);

    const agent = storeFetchedAgentDetail({
      serverId,
      result: {
        agent: createAgentSnapshot({
          id: agentId,
          workspaceId: "workspace-1",
          archivedAt: "2026-08-11T08:06:00.000Z",
        }),
        project: null,
      },
    });

    const session = useSessionStore.getState().sessions[serverId];
    expect(agent.workspaceId).toBe("workspace-1");
    expect(agent.archivedAt?.toISOString()).toBe("2026-08-11T08:06:00.000Z");
    expect(session?.agents.has(agentId)).toBe(false);
    expect(session?.agentDetails.get(agentId)).toBe(agent);

    store.clearSession(serverId);
  });
});
