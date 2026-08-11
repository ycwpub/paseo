import { describe, expect, test } from "vitest";
import type { Assistant, Team } from "@getpaseo/protocol/messages";
import {
  resolveTeamChildCreateContext,
  resolveTeamLeaderCreateContext,
  TEAM_ID_LABEL,
  TEAM_ROLE_LABEL,
} from "./team-agent-context.js";

function assistant(id: string, name: string, prompt: string): Assistant {
  return {
    id,
    name,
    description: `${name} description`,
    prompt,
    memoryEnabled: false,
    memory: "",
    memorySummary: "",
    memoryFiles: { summaryPath: "", detailFiles: [] },
    resourceSelection: { mode: "all-enabled", selectedMcpServerIds: [], selectedSkillIds: [] },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const leader = assistant("assistant-lead", "Lead", "Lead prompt.");
const worker = assistant("assistant-worker", "Worker", "Worker prompt.");
const team: Team = {
  id: "team-1",
  userId: "local",
  name: "Delivery",
  workspace: "",
  workspaceMode: "shared",
  leaderAssistantId: leader.id,
  assistantIds: [leader.id, worker.id],
  assistants: [],
  createdAt: 1,
  updatedAt: 1,
};
const assistants = new Map([
  [leader.id, leader],
  [worker.id, worker],
]);
const catalogs = {
  assistantStore: { get: (id: string) => assistants.get(id) ?? null },
  teamStore: { get: (id: string) => (id === team.id ? team : null) },
};

describe("team agent context", () => {
  test("starts a team conversation with the leader and delegation instructions", () => {
    const context = resolveTeamLeaderCreateContext(catalogs, {
      teamId: team.id,
      userPrompt: "Ship the feature.",
      labels: {},
    });

    expect(context.assistantId).toBe(leader.id);
    expect(context.labels).toMatchObject({
      assistantId: leader.id,
      [TEAM_ID_LABEL]: team.id,
      [TEAM_ROLE_LABEL]: "leader",
    });
    expect(context.prompt).toContain("Lead prompt.");
    expect(context.prompt).toContain(`assistantId: ${worker.id}`);
    expect(context.prompt).toContain("If none is suitable, omit assistantId");
    expect(context.prompt).toContain("Ship the feature.");
  });

  test("applies a selected teammate assistant to a child", () => {
    const context = resolveTeamChildCreateContext(catalogs, {
      callerLabels: {
        [TEAM_ID_LABEL]: team.id,
        [TEAM_ROLE_LABEL]: "leader",
      },
      assistantId: worker.id,
      initialPrompt: "Implement the API.",
    });

    expect(context.prompt).toContain("Worker prompt.");
    expect(context.prompt).toContain("Implement the API.");
    expect(context.labels).toMatchObject({
      assistantId: worker.id,
      [TEAM_ID_LABEL]: team.id,
      [TEAM_ROLE_LABEL]: "teammate",
    });
  });

  test("uses a teammate override and otherwise inherits leader runtime settings", () => {
    const configuredTeam: Team = {
      ...team,
      assistants: [
        {
          slotId: worker.id,
          conversationId: "",
          role: "teammate",
          assistantBackend: "preset",
          assistantName: worker.name,
          status: "idle",
          assistantId: worker.id,
          provider: "codex",
          model: "gpt-5.4",
          thinkingOptionId: "xhigh",
        },
      ],
    };
    const configuredCatalogs = {
      ...catalogs,
      teamStore: { get: (id: string) => (id === team.id ? configuredTeam : null) },
    };
    const configured = resolveTeamChildCreateContext(configuredCatalogs, {
      callerLabels: {
        [TEAM_ID_LABEL]: team.id,
        [TEAM_ROLE_LABEL]: "leader",
      },
      callerProvider: "claude",
      callerModel: "claude-sonnet-4-5",
      callerThinkingOptionId: "medium",
      assistantId: worker.id,
      initialPrompt: "Implement the API.",
    });
    expect(configured.runtimeSettings).toEqual({
      provider: "codex",
      model: "gpt-5.4",
      thinkingOptionId: "xhigh",
    });

    const inherited = resolveTeamChildCreateContext(catalogs, {
      callerLabels: {
        [TEAM_ID_LABEL]: team.id,
        [TEAM_ROLE_LABEL]: "leader",
      },
      callerProvider: "claude",
      callerModel: "claude-sonnet-4-5",
      callerThinkingOptionId: "medium",
      assistantId: worker.id,
      initialPrompt: "Implement the API.",
    });
    expect(inherited.runtimeSettings).toEqual({
      provider: "claude",
      model: "claude-sonnet-4-5",
      thinkingOptionId: "medium",
    });

    const providerOnlyTeam: Team = {
      ...team,
      assistants: [
        {
          slotId: worker.id,
          conversationId: "",
          role: "teammate",
          assistantBackend: "preset",
          assistantName: worker.name,
          status: "idle",
          assistantId: worker.id,
          provider: "codex",
        },
      ],
    };
    const providerOnly = resolveTeamChildCreateContext(
      {
        ...catalogs,
        teamStore: { get: (id: string) => (id === team.id ? providerOnlyTeam : null) },
      },
      {
        callerLabels: {
          [TEAM_ID_LABEL]: team.id,
          [TEAM_ROLE_LABEL]: "leader",
        },
        callerProvider: "claude",
        callerModel: "claude-sonnet-4-5",
        callerThinkingOptionId: "medium",
        assistantId: worker.id,
        initialPrompt: "Implement the API.",
      },
    );
    expect(providerOnly.runtimeSettings).toEqual({
      provider: "codex",
      model: "claude-sonnet-4-5",
      thinkingOptionId: "medium",
    });
  });

  test("allows a child without an assistant and rejects non-team assistants", () => {
    const withoutAssistant = resolveTeamChildCreateContext(catalogs, {
      callerLabels: {
        [TEAM_ID_LABEL]: team.id,
        [TEAM_ROLE_LABEL]: "leader",
      },
      initialPrompt: "Handle an unmatched task.",
    });
    expect(withoutAssistant.prompt).toBe("Handle an unmatched task.");
    expect(withoutAssistant.labels.assistantId).toBeUndefined();

    expect(() =>
      resolveTeamChildCreateContext(catalogs, {
        callerLabels: {
          [TEAM_ID_LABEL]: team.id,
          [TEAM_ROLE_LABEL]: "leader",
        },
        assistantId: "assistant-outsider",
        initialPrompt: "Do work.",
      }),
    ).toThrow("is not a teammate");
  });

  test("prevents teammates from assigning team assistants", () => {
    expect(() =>
      resolveTeamChildCreateContext(catalogs, {
        callerLabels: {
          [TEAM_ID_LABEL]: team.id,
          [TEAM_ROLE_LABEL]: "teammate",
        },
        assistantId: worker.id,
        initialPrompt: "Delegate again.",
      }),
    ).toThrow("Only a team leader");

    expect(
      resolveTeamChildCreateContext(catalogs, {
        callerLabels: {
          [TEAM_ID_LABEL]: team.id,
          [TEAM_ROLE_LABEL]: "teammate",
        },
        initialPrompt: "Create an unassigned helper.",
        labels: {
          [TEAM_ID_LABEL]: team.id,
          [TEAM_ROLE_LABEL]: "leader",
        },
      }),
    ).toEqual({
      prompt: "Create an unassigned helper.",
      labels: {},
    });
  });
});
