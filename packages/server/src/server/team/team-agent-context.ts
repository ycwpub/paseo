import type { Assistant, Team } from "@getpaseo/protocol/messages";
import { buildAssistantInitialPrompt } from "../assistants/assistant-prompt.js";
import type { AssistantStore } from "../assistants/assistant-store.js";
import { resolveTeamAssistantIds } from "./team-store.js";
import type { TeamStore } from "./team-store.js";

export const TEAM_ID_LABEL = "paseo.team-id";
export const TEAM_ROLE_LABEL = "paseo.team-role";

interface TeamCatalogs {
  assistantStore: Pick<AssistantStore, "get">;
  teamStore: Pick<TeamStore, "get">;
}

export interface ResolvedTeamAgentContext {
  assistantId?: string;
  prompt: string;
  labels: Record<string, string>;
  runtimeSettings?: {
    provider: string;
    model?: string;
    thinkingOptionId?: string;
  };
}

function requireAssistant(
  assistantStore: Pick<AssistantStore, "get">,
  assistantId: string,
): Assistant {
  const assistant = assistantStore.get(assistantId);
  if (!assistant) {
    throw new Error(`Assistant ${assistantId} not found`);
  }
  return assistant;
}

function requireTeam(teamStore: Pick<TeamStore, "get">, teamId: string): Team {
  const team = teamStore.get(teamId);
  if (!team) {
    throw new Error(`Team ${teamId} not found`);
  }
  return team;
}

function assistantLabels(assistant: Assistant): Record<string, string> {
  return {
    assistantId: assistant.id,
    assistantName: assistant.name,
  };
}

function resolveTeamMemberRuntimeSettings(input: {
  team: Team;
  assistantId: string;
  callerProvider: string;
  callerModel?: string;
  callerThinkingOptionId?: string;
}): NonNullable<ResolvedTeamAgentContext["runtimeSettings"]> {
  const member = input.team.assistants.find(
    (candidate) => candidate.assistantId === input.assistantId,
  );
  let configuredProvider = member?.provider?.trim();
  let configuredModel = member?.model?.trim();
  if (configuredModel?.includes("/")) {
    const separatorIndex = configuredModel.indexOf("/");
    configuredProvider = configuredProvider ?? configuredModel.slice(0, separatorIndex).trim();
    configuredModel = configuredModel.slice(separatorIndex + 1).trim();
  }
  return {
    provider: configuredProvider ?? input.callerProvider,
    ...(configuredModel || input.callerModel
      ? { model: configuredModel ?? input.callerModel }
      : {}),
    ...(member?.thinkingOptionId || input.callerThinkingOptionId
      ? { thinkingOptionId: member?.thinkingOptionId ?? input.callerThinkingOptionId }
      : {}),
  };
}

export function clearTeamIdentityLabels(
  labels: Record<string, string> | undefined,
): Record<string, string> {
  const next = { ...labels };
  delete next[TEAM_ID_LABEL];
  delete next[TEAM_ROLE_LABEL];
  return next;
}

function buildLeaderInstructions(team: Team, assistantStore: Pick<AssistantStore, "get">): string {
  const teammates = resolveTeamAssistantIds(team)
    .filter((assistantId) => assistantId !== team.leaderAssistantId)
    .map((assistantId) => requireAssistant(assistantStore, assistantId));
  const memberLines = teammates.map((assistant) => {
    const description = assistant.description.trim();
    return `- ${assistant.name || "Unnamed assistant"} (assistantId: ${assistant.id})${
      description ? ` — ${description}` : ""
    }`;
  });
  return [
    `You are the leader of the "${team.name}" team.`,
    "You are responsible for decomposing work and delegating suitable tasks with the create_agent tool.",
    "When creating a subagent, set assistantId to one of the team assistants below when that assistant is a good fit. If none is suitable, omit assistantId.",
    "Do not assign the leader assistant to a subagent.",
    "",
    "Team assistants available for delegation:",
    ...memberLines,
  ].join("\n");
}

export function resolveTeamLeaderCreateContext(
  catalogs: TeamCatalogs,
  input: {
    teamId: string;
    assistantId?: string;
    userPrompt: string;
    labels: Record<string, string>;
  },
): ResolvedTeamAgentContext {
  const team = requireTeam(catalogs.teamStore, input.teamId);
  const assistantId = input.assistantId ?? team.leaderAssistantId;
  if (assistantId !== team.leaderAssistantId) {
    throw new Error(`Assistant ${assistantId} is not the leader of team ${team.id}`);
  }
  const leader = requireAssistant(catalogs.assistantStore, assistantId);
  const teamPrompt = [buildLeaderInstructions(team, catalogs.assistantStore), input.userPrompt]
    .filter((part) => part.trim().length > 0)
    .join("\n\n---\n\n");
  return {
    assistantId,
    prompt: buildAssistantInitialPrompt(leader, teamPrompt),
    labels: {
      ...input.labels,
      ...assistantLabels(leader),
      [TEAM_ID_LABEL]: team.id,
      [TEAM_ROLE_LABEL]: "leader",
    },
  };
}

export function resolveTeamChildCreateContext(
  catalogs: TeamCatalogs,
  input: {
    callerLabels: Record<string, string>;
    callerProvider?: string;
    callerModel?: string;
    callerThinkingOptionId?: string;
    assistantId?: string;
    initialPrompt: string;
    labels?: Record<string, string>;
  },
): ResolvedTeamAgentContext {
  const labels = clearTeamIdentityLabels(input.labels);
  const teamId = input.callerLabels[TEAM_ID_LABEL];
  if (!teamId) {
    if (!input.assistantId) {
      return { prompt: input.initialPrompt, labels };
    }
    const assistant = requireAssistant(catalogs.assistantStore, input.assistantId);
    return {
      assistantId: assistant.id,
      prompt: buildAssistantInitialPrompt(assistant, input.initialPrompt),
      labels: { ...labels, ...assistantLabels(assistant) },
    };
  }
  if (input.callerLabels[TEAM_ROLE_LABEL] !== "leader") {
    if (input.assistantId) {
      throw new Error("Only a team leader can assign a team assistant to a subagent");
    }
    return { prompt: input.initialPrompt, labels };
  }

  const team = requireTeam(catalogs.teamStore, teamId);
  const teammateAssistantIds = resolveTeamAssistantIds(team).filter(
    (assistantId) => assistantId !== team.leaderAssistantId,
  );
  if (input.assistantId && !teammateAssistantIds.includes(input.assistantId)) {
    throw new Error(`Assistant ${input.assistantId} is not a teammate in team ${team.id}`);
  }
  const assistant = input.assistantId
    ? requireAssistant(catalogs.assistantStore, input.assistantId)
    : null;
  return {
    ...(assistant ? { assistantId: assistant.id } : {}),
    ...(assistant && input.callerProvider
      ? {
          runtimeSettings: resolveTeamMemberRuntimeSettings({
            team,
            assistantId: assistant.id,
            callerProvider: input.callerProvider,
            ...(input.callerModel ? { callerModel: input.callerModel } : {}),
            ...(input.callerThinkingOptionId
              ? { callerThinkingOptionId: input.callerThinkingOptionId }
              : {}),
          }),
        }
      : {}),
    prompt: assistant
      ? buildAssistantInitialPrompt(assistant, input.initialPrompt)
      : input.initialPrompt,
    labels: {
      ...labels,
      ...(assistant ? assistantLabels(assistant) : {}),
      [TEAM_ID_LABEL]: team.id,
      [TEAM_ROLE_LABEL]: "teammate",
    },
  };
}

export function describeTeamAssistantChoices(
  catalogs: TeamCatalogs,
  callerLabels: Record<string, string>,
): string {
  const teamId = callerLabels[TEAM_ID_LABEL];
  if (!teamId) {
    return "Optional assistant preset ID for the new agent.";
  }
  if (callerLabels[TEAM_ROLE_LABEL] !== "leader") {
    return "Do not set assistantId. Only the team leader can assign team assistants to subagents.";
  }
  const team = requireTeam(catalogs.teamStore, teamId);
  const choices = resolveTeamAssistantIds(team)
    .filter((assistantId) => assistantId !== team.leaderAssistantId)
    .map((assistantId) => {
      const assistant = requireAssistant(catalogs.assistantStore, assistantId);
      return `${assistant.name || "Unnamed assistant"}=${assistant.id}`;
    });
  return `Optional team assistant for this subagent. Choose one when suitable; omit it when none fits. Available: ${choices.join(", ") || "none"}.`;
}
