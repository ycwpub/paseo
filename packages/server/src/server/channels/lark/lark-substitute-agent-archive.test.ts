import pino from "pino";
import { describe, expect, test, vi } from "vitest";
import type { AgentManager } from "../../agent/agent-manager.js";
import type { AgentStorage } from "../../agent/agent-storage.js";
import { archiveLarkSubstituteAgentForTask } from "./lark-substitute-agent-archive.js";
import type { LarkSubstituteModeStore } from "./lark-substitute-mode-store.js";
import type { LarkSubstituteTaskStore } from "./lark-substitute-task-store.js";

function createHarness(autoArchiveAgent: boolean) {
  const archivedAt = "2026-09-09T00:00:00.000Z";
  const agentManager = {
    getAgent: vi.fn(() => ({ id: "agent-1", cwd: "/repo", lifecycle: "idle" })),
    hasInFlightRun: vi.fn(() => false),
    clearAgentAttention: vi.fn(async () => undefined),
    archiveAgent: vi.fn(async () => ({ archivedAt })),
  } as unknown as AgentManager;
  const agentStorage = {
    get: vi.fn(async () => ({
      id: "agent-1",
      provider: "claude",
      cwd: "/repo",
      createdAt: archivedAt,
      updatedAt: archivedAt,
      archivedAt,
      labels: {},
      lastStatus: "idle",
      config: null,
    })),
  } as unknown as AgentStorage;
  const modeStore = {
    get: vi.fn(() => ({ id: "mode-1", autoArchiveAgent })),
  } as unknown as LarkSubstituteModeStore;
  const taskStore = {
    get: vi.fn(() => ({ id: "task-1", modeId: "mode-1" })),
  } as unknown as LarkSubstituteTaskStore;
  return {
    agentManager,
    agentStorage,
    modeStore,
    taskStore,
    logger: pino({ level: "silent" }),
  };
}

describe("archiveLarkSubstituteAgentForTask", () => {
  test("does not archive when the mode option is disabled", async () => {
    const harness = createHarness(false);

    await archiveLarkSubstituteAgentForTask({
      taskId: "task-1",
      agentId: "agent-1",
      ...harness,
    });

    expect(harness.agentManager.archiveAgent).not.toHaveBeenCalled();
  });

  test("archives the completed substitute agent when enabled", async () => {
    const harness = createHarness(true);

    await archiveLarkSubstituteAgentForTask({
      taskId: "task-1",
      agentId: "agent-1",
      ...harness,
    });

    expect(harness.agentManager.archiveAgent).toHaveBeenCalledWith("agent-1");
  });

  test("does not fail the completed task when archiving fails", async () => {
    const harness = createHarness(true);
    vi.mocked(harness.agentManager.archiveAgent).mockRejectedValue(new Error("archive failed"));
    const warn = vi.spyOn(harness.logger, "warn");

    await expect(
      archiveLarkSubstituteAgentForTask({
        taskId: "task-1",
        agentId: "agent-1",
        ...harness,
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
  });
});
