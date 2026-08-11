import { describe, expect, test } from "vitest";
import {
  buildTeamMemberSettingsInput,
  canSubmitTeamForm,
  openCreateTeamForm,
  openEditTeamForm,
  setTeamLeader,
  setTeamMemberSettings,
  toggleTeamAssistant,
} from "./team-form-model";
import type { Team } from "@getpaseo/protocol/messages";

describe("team form model", () => {
  test("requires multiple assistants and keeps the leader inside membership", () => {
    let state = openCreateTeamForm();
    state = { ...state, name: "Delivery" };
    state = toggleTeamAssistant(state, "lead");
    expect(state.leaderAssistantId).toBe("lead");
    expect(canSubmitTeamForm(state)).toBe(false);

    state = toggleTeamAssistant(state, "worker");
    expect(canSubmitTeamForm(state)).toBe(true);
    state = setTeamLeader(state, "worker");
    expect(state.leaderAssistantId).toBe("worker");

    state = toggleTeamAssistant(state, "worker");
    expect(state.leaderAssistantId).toBe("lead");
    expect(canSubmitTeamForm(state)).toBe(false);
  });

  test("hydrates, edits, and serializes per-member model settings", () => {
    const team: Team = {
      id: "team-1",
      userId: "local",
      name: "Delivery",
      workspace: "",
      workspaceMode: "shared",
      leaderAssistantId: "lead",
      assistantIds: ["lead", "worker"],
      assistants: [
        {
          slotId: "worker",
          conversationId: "",
          role: "teammate",
          assistantBackend: "preset",
          assistantName: "Worker",
          status: "idle",
          assistantId: "worker",
          model: "codex/gpt-5.4",
          thinkingOptionId: "high",
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    let state = openEditTeamForm(team);
    expect(state.memberSettings.worker).toEqual({
      provider: "codex",
      model: "gpt-5.4",
      thinkingOptionId: "high",
    });

    state = setTeamMemberSettings(state, "worker", {
      provider: "claude",
      model: null,
      thinkingOptionId: "xhigh",
    });
    expect(buildTeamMemberSettingsInput(state)).toEqual({
      worker: { provider: "claude", thinkingOptionId: "xhigh" },
    });

    state = setTeamLeader(state, "worker");
    expect(buildTeamMemberSettingsInput(state)).toEqual({});
  });
});
