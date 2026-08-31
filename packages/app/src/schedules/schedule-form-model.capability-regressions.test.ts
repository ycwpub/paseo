import type {
  AgentMode,
  AgentModelDefinition,
  ProviderSnapshotEntry,
} from "@getpaseo/protocol/agent-types";
import type { ScheduleSummary } from "@getpaseo/protocol/schedule/types";
import { describe, expect, it } from "vitest";
import { buildProjectOptionId, type ScheduleProjectTarget } from "./schedule-project-targets";
import { openScheduleForm, type ScheduleFormSnapshot } from "./schedule-form-model";
type TestSchedule = ScheduleSummary & {
  serverId: string;
  serverName: string;
};
const HOSTS = [
  { serverId: "host-a", label: "Host A", supportsWorkspaceMultiplicity: true },
  { serverId: "host-b", label: "Host B", supportsWorkspaceMultiplicity: true },
] as const;
const MOCK_MODES: AgentMode[] = [{ id: "load-test", label: "Load test" }];
const HOST_B_MODELS: AgentModelDefinition[] = [
  {
    provider: "mock",
    id: "model-b",
    label: "Model B",
    aliases: ["model-b-legacy"],
    isDefault: true,
    defaultThinkingOptionId: "high",
    thinkingOptions: [
      { id: "low", label: "Low" },
      { id: "high", label: "High", isDefault: true },
    ],
  },
];
function target(input: {
  serverId: string;
  projectKey: string;
  projectName: string;
  cwd: string;
  isGit?: boolean;
}): ScheduleProjectTarget {
  return {
    optionId: buildProjectOptionId(input.serverId, input.projectKey),
    serverId: input.serverId,
    serverName: input.serverId === "host-a" ? "Host A" : "Host B",
    projectViewKey: input.projectKey,
    projectName: input.projectName,
    cwd: input.cwd,
    isGit: input.isGit ?? true,
  };
}
const PROJECT_TARGETS = [
  target({
    serverId: "host-a",
    projectKey: "project-a",
    projectName: "Project A",
    cwd: "/repo/a",
  }),
  target({
    serverId: "host-b",
    projectKey: "project-b",
    projectName: "Project B",
    cwd: "/repo/b",
  }),
];
function scheduleOnHost(input: {
  serverId: string;
  serverName: string;
  cwd: string;
  model: string;
  thinkingOptionId?: string | null;
  cadence?: ScheduleSummary["cadence"];
}): TestSchedule {
  return {
    id: `schedule-${input.serverId}`,
    serverId: input.serverId,
    serverName: input.serverName,
    name: "Nightly",
    prompt: "Run the schedule",
    cadence: input.cadence ?? { type: "cron", expression: "0 9 * * *" },
    target: {
      type: "new-agent",
      config: {
        provider: "mock",
        cwd: input.cwd,
        model: input.model,
        modeId: "load-test",
        thinkingOptionId:
          input.thinkingOptionId === undefined ? "high" : (input.thinkingOptionId ?? undefined),
        archiveOnFinish: false,
        isolation: "worktree",
      },
    },
    status: "active",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    nextRunAt: "2026-07-02T00:00:00.000Z",
    lastRunAt: null,
    pausedAt: null,
    expiresAt: null,
    maxRuns: 3,
  };
}
function providerSnapshot(
  models: AgentModelDefinition[],
  status: ProviderSnapshotEntry["status"] = "ready",
): {
  entries: ProviderSnapshotEntry[];
} {
  return {
    entries: [
      {
        provider: "mock",
        label: "Mock",
        status,
        enabled: true,
        fetchedAt: "2026-07-01T00:00:00.000Z",
        models,
        modes: MOCK_MODES,
        defaultModeId: "load-test",
      },
    ],
  };
}
function open(snapshot: Omit<ScheduleFormSnapshot, "hosts">) {
  return openScheduleForm({
    ...snapshot,
    hosts: HOSTS,
  });
}
describe("schedule form model", () => {
  it("derives the host to project to model disclosure chain from model state", () => {
    const form = open({
      mode: "create",
      defaults: { serverId: "host-a", projectTargets: PROJECT_TARGETS, preferences: {} },
    });
    expect(form.getState().disclosure).toEqual({
      showProjectField: true,
      showModelField: false,
      showThinkingField: false,
      showModeField: false,
      showIsolationField: false,
      showArchiveOnFinishField: false,
    });
    form.setProject(buildProjectOptionId("host-a", "project-a"), { label: "Project A" });
    expect(form.getState().disclosure).toEqual({
      showProjectField: true,
      showModelField: true,
      showThinkingField: false,
      showModeField: false,
      showIsolationField: true,
      showArchiveOnFinishField: true,
    });
    form.applyProviderSnapshot("host-a", providerSnapshot(HOST_B_MODELS));
    form.setModel("mock", "model-b");
    expect(form.getState().disclosure).toEqual({
      showProjectField: true,
      showModelField: true,
      showThinkingField: true,
      showModeField: true,
      showIsolationField: true,
      showArchiveOnFinishField: true,
    });
  });
  it("supports bash schedules without provider resolution", () => {
    const form = open({
      mode: "create",
      defaults: { serverId: "host-a", projectTargets: PROJECT_TARGETS, preferences: {} },
    });
    form.setTargetKind("bash");
    form.setPrompt("npm test");
    form.setProject(buildProjectOptionId("host-a", "project-a"), { label: "Project A" });
    expect(form.getState()).toMatchObject({
      targetKind: "bash",
      selectedServerId: "host-a",
      workingDir: "/repo/a",
      selectedProvider: null,
      providerSnapshotRequest: null,
      disclosure: {
        showProjectField: true,
        showModelField: false,
        showThinkingField: false,
        showModeField: false,
      },
      canSubmit: true,
    });
  });
  it("stores assistant selection for new-agent schedules and clears it when host changes", () => {
    const form = open({
      mode: "create",
      defaults: { serverId: "host-a", projectTargets: PROJECT_TARGETS, preferences: {} },
    });
    form.setAssistant("assistant-1");
    expect(form.getState().selectedAssistantId).toBe("assistant-1");
    form.setProject(buildProjectOptionId("host-b", "project-b"), { label: "Project B" });
    expect(form.getState().selectedAssistantId).toBeNull();
  });
  it("opens existing bash schedules for editing", () => {
    const form = open({
      mode: "edit",
      schedule: {
        ...scheduleOnHost({
          serverId: "host-a",
          serverName: "Host A",
          cwd: "/repo/a",
          model: "model-a",
        }),
        target: { type: "bash", config: { cwd: "/repo/a" } },
        prompt: "npm test",
      },
      defaults: { serverId: null, projectTargets: PROJECT_TARGETS, preferences: {} },
    });
    expect(form.getState()).toMatchObject({
      mode: "edit",
      targetKind: "bash",
      prompt: "npm test",
      workingDir: "/repo/a",
      projectDisplay: { label: "Project A" },
      providerSnapshotRequest: null,
      canSubmit: true,
    });
  });
});
