import { describe, expect, it, vi } from "vitest";
import type { DaemonClient, FetchAgentsEntry } from "@getpaseo/client/internal/daemon-client";
import type { AgentSnapshotPayload } from "@getpaseo/protocol/messages";
import { useSessionStore } from "@/stores/session-store";
import { AgentDirectoryReplica } from "./agent-replica";
function payload(
  title: string,
  status: AgentSnapshotPayload["status"] = "idle",
): AgentSnapshotPayload {
  return {
    id: "agent",
    provider: "codex",
    cwd: "/repo",
    model: null,
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:01:00.000Z",
    lastUserMessageAt: null,
    status,
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
    title,
    labels: {},
  };
}
function entry(agent: AgentSnapshotPayload): FetchAgentsEntry {
  return {
    agent,
    project: {
      projectKey: "/repo",
      projectName: "repo",
      checkout: {
        cwd: "/repo",
        isGit: false,
        currentBranch: null,
        remoteUrl: null,
        worktreeRoot: null,
        isPaseoOwnedWorktree: false,
        mainRepoRoot: null,
      },
    },
  };
}
describe("AgentDirectoryReplica", () => {
  it("settles stale live output and catches up the timeline when an agent stops", () => {
    const serverId = "agent-replica-stop";
    const store = useSessionStore.getState();
    store.initializeSession(serverId, null as unknown as DaemonClient);
    const requestAgentCatchUp = vi.fn();
    store.setViewedTimelineSync(serverId, {
      replaceVisibleAgentIds: vi.fn(),
      subscribe: () => () => undefined,
      getAgentTimelineStatus: () => "ready",
      getAgentTimelineError: () => null,
      retryVisibleAgentTimeline: vi.fn(),
      reprojectVisibleTimelines: vi.fn(),
      setActive: vi.fn(),
      setConnected: vi.fn(),
      setDeliveryMode: vi.fn(),
      requestAgentCatchUp,
      recoverGap: vi.fn(),
      dispose: vi.fn(),
    });
    const stopped = vi.fn();
    const replica = new AgentDirectoryReplica(serverId, stopped);
    replica.commitSnapshot([entry(payload("running", "running"))], []);
    store.setAgentStreamState(serverId, "agent", {
      head: [
        {
          kind: "thought",
          id: "thought",
          text: "still thinking",
          timestamp: new Date("2026-07-17T00:01:00.000Z"),
          status: "loading",
        },
      ],
    });
    replica.commitSnapshot([entry(payload("idle", "idle"))], []);
    const session = useSessionStore.getState().sessions[serverId];
    expect(session?.agentStreamHead.has("agent")).toBe(false);
    expect(session?.agentStreamTail.get("agent")).toEqual([
      expect.objectContaining({ kind: "thought", status: "ready" }),
    ]);
    expect(requestAgentCatchUp).toHaveBeenCalledWith("agent");
    expect(stopped).toHaveBeenCalledWith("agent");
    store.clearSession(serverId);
  });
});
