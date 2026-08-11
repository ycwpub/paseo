import type { Assistant, Team } from "@getpaseo/protocol/messages";

export function resolveTeamAssistantIds(team: Team): string[] {
  if (team.assistantIds) {
    return [...team.assistantIds];
  }
  return team.assistants
    .map((member) => member.assistantId)
    .filter((assistantId): assistantId is string => Boolean(assistantId));
}

export function resolveTeamLeader(team: Team, assistants: readonly Assistant[]): Assistant | null {
  return assistants.find((assistant) => assistant.id === team.leaderAssistantId) ?? null;
}

export function resolveTeamMembers(team: Team, assistants: readonly Assistant[]): Assistant[] {
  const memberIds = new Set(resolveTeamAssistantIds(team));
  return assistants.filter((assistant) => memberIds.has(assistant.id));
}
