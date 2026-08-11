import type { Team, TeamMemberSettings } from "@getpaseo/protocol/messages";
import { resolveTeamAssistantIds } from "./team-members";

export interface TeamFormState {
  mode: "create" | "edit";
  teamId: string | null;
  name: string;
  assistantIds: string[];
  leaderAssistantId: string | null;
  memberSettings: Record<string, TeamMemberSettings>;
}

export function openCreateTeamForm(): TeamFormState {
  return {
    mode: "create",
    teamId: null,
    name: "",
    assistantIds: [],
    leaderAssistantId: null,
    memberSettings: {},
  };
}

export function openEditTeamForm(team: Team): TeamFormState {
  return {
    mode: "edit",
    teamId: team.id,
    name: team.name,
    assistantIds: resolveTeamAssistantIds(team),
    leaderAssistantId: team.leaderAssistantId,
    memberSettings: Object.fromEntries(
      team.assistants.flatMap((member) => {
        if (
          !member.assistantId ||
          (!member.provider && !member.model && !member.thinkingOptionId)
        ) {
          return [];
        }
        let provider = member.provider;
        let model = member.model;
        if (!provider && model?.includes("/")) {
          const separatorIndex = model.indexOf("/");
          provider = model.slice(0, separatorIndex);
          model = model.slice(separatorIndex + 1);
        }
        return [
          [
            member.assistantId,
            {
              ...(provider ? { provider } : {}),
              ...(model ? { model } : {}),
              ...(member.thinkingOptionId ? { thinkingOptionId: member.thinkingOptionId } : {}),
            },
          ],
        ];
      }),
    ),
  };
}

export function toggleTeamAssistant(state: TeamFormState, assistantId: string): TeamFormState {
  if (state.assistantIds.includes(assistantId)) {
    const assistantIds = state.assistantIds.filter((id) => id !== assistantId);
    return {
      ...state,
      assistantIds,
      memberSettings: Object.fromEntries(
        Object.entries(state.memberSettings).filter(([id]) => id !== assistantId),
      ),
      leaderAssistantId:
        state.leaderAssistantId === assistantId
          ? (assistantIds[0] ?? null)
          : state.leaderAssistantId,
    };
  }
  const assistantIds = [...state.assistantIds, assistantId];
  return {
    ...state,
    assistantIds,
    leaderAssistantId: state.leaderAssistantId ?? assistantId,
  };
}

export function setTeamLeader(state: TeamFormState, assistantId: string): TeamFormState {
  if (!state.assistantIds.includes(assistantId)) {
    return state;
  }
  return { ...state, leaderAssistantId: assistantId };
}

export function setTeamMemberSettings(
  state: TeamFormState,
  assistantId: string,
  settings: {
    provider?: string | null;
    model?: string | null;
    thinkingOptionId?: string | null;
  },
): TeamFormState {
  if (!state.assistantIds.includes(assistantId)) {
    return state;
  }
  const current = state.memberSettings[assistantId] ?? {};
  const next: TeamMemberSettings = { ...current };
  if (settings.provider !== undefined) {
    const provider = settings.provider?.trim();
    if (provider) {
      next.provider = provider;
    } else {
      delete next.provider;
    }
  }
  if (settings.model !== undefined) {
    const model = settings.model?.trim();
    if (model) {
      next.model = model;
    } else {
      delete next.model;
    }
  }
  if (settings.thinkingOptionId !== undefined) {
    const thinkingOptionId = settings.thinkingOptionId?.trim();
    if (thinkingOptionId) {
      next.thinkingOptionId = thinkingOptionId;
    } else {
      delete next.thinkingOptionId;
    }
  }
  const memberSettings = { ...state.memberSettings };
  if (next.provider || next.model || next.thinkingOptionId) {
    memberSettings[assistantId] = {
      ...(next.provider ? { provider: next.provider } : {}),
      ...(next.model ? { model: next.model } : {}),
      ...(next.thinkingOptionId ? { thinkingOptionId: next.thinkingOptionId } : {}),
    };
  } else {
    delete memberSettings[assistantId];
  }
  return { ...state, memberSettings };
}

export function buildTeamMemberSettingsInput(
  state: TeamFormState,
): Record<string, TeamMemberSettings> {
  return Object.fromEntries(
    state.assistantIds.flatMap((assistantId) => {
      if (assistantId === state.leaderAssistantId) {
        return [];
      }
      const settings = state.memberSettings[assistantId];
      return settings ? [[assistantId, settings]] : [];
    }),
  );
}

export function canSubmitTeamForm(state: TeamFormState): boolean {
  return (
    state.name.trim().length > 0 &&
    state.assistantIds.length >= 2 &&
    state.leaderAssistantId !== null &&
    state.assistantIds.includes(state.leaderAssistantId)
  );
}
