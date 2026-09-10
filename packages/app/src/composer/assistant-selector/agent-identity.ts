const ASSISTANT_ID_LABEL = "assistantId";
const TEAM_ID_LABEL = "paseo.team-id";

export interface AgentComposerIdentity {
  assistantId: string | null;
  teamId: string | null;
}

function readIdentityLabel(
  labels: Record<string, string> | null | undefined,
  key: string,
): string | null {
  const value = labels?.[key]?.trim();
  return value ? value : null;
}

export function resolveAgentComposerIdentity(
  labels: Record<string, string> | null | undefined,
): AgentComposerIdentity {
  return {
    assistantId: readIdentityLabel(labels, ASSISTANT_ID_LABEL),
    teamId: readIdentityLabel(labels, TEAM_ID_LABEL),
  };
}
