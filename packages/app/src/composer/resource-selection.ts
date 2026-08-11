import type { Assistant, AssistantResourceSelection } from "@getpaseo/protocol/messages";

export interface ResolvedSessionResourceSelection {
  selectedMcpServerIds: string[];
  selectedSkillIds: string[];
}

export function resolveSessionResourceSelectionFromAssistant(input: {
  assistant: Pick<Assistant, "resourceSelection"> | null;
  selectableMcpServerIds: readonly string[];
  selectableSkillIds: readonly string[];
}): ResolvedSessionResourceSelection {
  const selection = input.assistant?.resourceSelection;
  if (!selection || selection.mode === "all-enabled") {
    return {
      selectedMcpServerIds: [...input.selectableMcpServerIds],
      selectedSkillIds: [...input.selectableSkillIds],
    };
  }

  const availableMcpIds = new Set(input.selectableMcpServerIds);
  const availableSkillIds = new Set(input.selectableSkillIds);
  return {
    selectedMcpServerIds: selection.selectedMcpServerIds.filter((id) => availableMcpIds.has(id)),
    selectedSkillIds: selection.selectedSkillIds.filter((id) => availableSkillIds.has(id)),
  };
}

export function buildAssistantResourceApplyKey(input: {
  serverId: string;
  agentId: string;
  assistantId: string | null | undefined;
}): string {
  return `${input.serverId}:${input.agentId}:${input.assistantId ?? "no-assistant"}`;
}

export function normalizeAssistantResourceSelection(
  selection: AssistantResourceSelection | undefined,
): AssistantResourceSelection {
  return (
    selection ?? {
      mode: "all-enabled",
      selectedMcpServerIds: [],
      selectedSkillIds: [],
    }
  );
}
