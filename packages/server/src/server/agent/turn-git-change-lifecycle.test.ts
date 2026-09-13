import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { AgentManager, type AgentManagerEvent } from "./agent-manager.js";
import type {
  AgentClient,
  AgentRunResult,
  AgentSession,
  AgentSessionConfig,
  AgentStreamEvent,
} from "./agent-sdk-types.js";

const cleanupRoots = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...cleanupRoots].map(async (root) => {
      await rm(root, { force: true, recursive: true });
      cleanupRoots.delete(root);
    }),
  );
});

const capabilities = {
  supportsStreaming: false,
  supportsSessionPersistence: false,
  supportsSessionListing: false,
  supportsDynamicModes: false,
  supportsMcpServers: false,
  supportsReasoningStream: false,
  supportsToolInvocations: false,
} as const;

class CompletingSession implements AgentSession {
  readonly provider = "codex";
  readonly id = "turn-change-session";
  readonly capabilities = capabilities;
  private readonly subscribers = new Set<(event: AgentStreamEvent) => void>();

  async run(): Promise<AgentRunResult> {
    return { sessionId: this.id, finalText: "", timeline: [] };
  }

  async startTurn(): Promise<{ turnId: string }> {
    queueMicrotask(() => {
      this.emit({
        type: "timeline",
        provider: this.provider,
        turnId: "turn-1",
        item: { type: "reasoning", text: "checking" },
      });
      this.emit({
        type: "timeline",
        provider: this.provider,
        turnId: "turn-1",
        item: { type: "assistant_message", text: "done" },
      });
      this.emit({ type: "turn_completed", provider: this.provider, turnId: "turn-1" });
    });
    return { turnId: "turn-1" };
  }

  subscribe(callback: (event: AgentStreamEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  async *streamHistory(): AsyncGenerator<AgentStreamEvent> {}

  async getRuntimeInfo() {
    return { provider: this.provider, sessionId: this.id };
  }

  async getAvailableModes() {
    return [];
  }

  async getCurrentMode() {
    return null;
  }

  async setMode(): Promise<void> {}

  getPendingPermissions() {
    return [];
  }

  async respondToPermission(): Promise<void> {}

  describePersistence() {
    return { provider: this.provider, sessionId: this.id };
  }

  async interrupt(): Promise<void> {}

  async close(): Promise<void> {}

  private emit(event: AgentStreamEvent): void {
    for (const subscriber of this.subscribers) subscriber(event);
  }
}

class CompletingClient implements AgentClient {
  readonly provider = "codex";
  readonly capabilities = capabilities;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async createSession(_config: AgentSessionConfig): Promise<AgentSession> {
    return new CompletingSession();
  }

  async resumeSession(): Promise<AgentSession> {
    return new CompletingSession();
  }

  async importSession(): Promise<never> {
    throw new Error("not used");
  }

  async listSessions() {
    return [];
  }
}

describe("AgentManager turn Git change lifecycle", () => {
  it("persists and broadcasts changes without provider mutation tool calls", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "paseo-turn-change-lifecycle-"));
    cleanupRoots.add(cwd);
    const turnChanges = {
      repositories: [
        {
          cwd: path.join(cwd, "repos", "service"),
          files: [
            {
              path: "src/handler.ts",
              isNew: false,
              isDeleted: false,
              additions: 4,
              deletions: 2,
            },
          ],
        },
      ],
    };
    const manager = new AgentManager({
      clients: { codex: new CompletingClient() },
      logger: createTestLogger(),
      turnGitChangeCapture: {
        captureBaseline: async () => ({ repositories: [{ cwd, tree: "baseline-tree" }] }),
        captureChanges: async () => turnChanges,
      },
    });
    const events: AgentManagerEvent[] = [];
    const unsubscribe = manager.subscribe((event) => events.push(event), {
      replayState: false,
    });
    let agentId: string | null = null;

    try {
      const agent = await manager.createAgent({ provider: "codex", cwd }, undefined, {
        workspaceId: undefined,
      });
      agentId = agent.id;
      for await (const _event of manager.streamAgent(agent.id, "update the repository")) {
      }

      const assistant = manager
        .fetchTimeline(agent.id, { limit: 0 })
        .rows.findLast((row) => row.item.type === "assistant_message");
      const completion = events.findLast(
        (event) =>
          event.type === "agent_stream" &&
          event.agentId === agent.id &&
          event.event.type === "turn_completed",
      );

      expect(assistant?.item).toEqual({
        type: "assistant_message",
        text: "done",
        turnChanges,
      });
      expect(completion).toMatchObject({
        type: "agent_stream",
        agentId: agent.id,
        event: {
          type: "turn_completed",
          turnId: "turn-1",
          turnChanges,
        },
      });
    } finally {
      unsubscribe();
      if (agentId) await manager.closeAgent(agentId);
    }
  });
});
