import type { ReactElement } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  AgentControls,
  DraftAgentControls,
  type DraftAgentControlsProps,
} from "@/composer/agent-controls";
import { resolveAgentControlsMode } from "@/composer/agent-controls/mode";
import { AssistantSelector } from "@/composer/assistant-selector/assistant-selector";
import { useAssistantTeamSelection } from "@/composer/assistant-selector/use-assistant-team-selection";
import type { Theme } from "@/styles/theme";

export interface ComposerAgentIdentityControlsProps {
  agentControls: DraftAgentControlsProps | undefined;
  agentId: string;
  serverId: string;
  focusInput: () => void;
  isCompactLayout: boolean;
  assistantId?: string | null;
  onAssistantSelect?: (id: string | null) => void;
  teamId?: string | null;
  onTeamSelect?: (teamId: string | null, leaderAssistantId: string | null) => void;
}

export function ComposerAgentIdentityControls({
  agentControls,
  agentId,
  serverId,
  focusInput,
  isCompactLayout,
  assistantId,
  onAssistantSelect,
  teamId,
  onTeamSelect,
}: ComposerAgentIdentityControlsProps): ReactElement {
  const localSelection = useAssistantTeamSelection({
    selectionKey: `${serverId}:${agentId}`,
    initialAssistantId: assistantId,
    initialTeamId: teamId,
  });
  const effectiveAssistantId = onAssistantSelect
    ? (assistantId ?? null)
    : localSelection.assistantId;
  const effectiveTeamId = onTeamSelect ? (teamId ?? null) : localSelection.teamId;
  const handleAssistantSelect = onAssistantSelect ?? localSelection.setAssistantId;
  const handleTeamSelect = onTeamSelect ?? localSelection.setTeamId;
  const controls =
    resolveAgentControlsMode(agentControls) === "draft" && agentControls ? (
      <DraftAgentControls {...agentControls} isCompactLayout={isCompactLayout} />
    ) : (
      <AgentControls
        agentId={agentId}
        serverId={serverId}
        onDropdownClose={focusInput}
        isCompactLayout={isCompactLayout}
      />
    );

  return (
    <View style={[styles.root, isCompactLayout && styles.compactRoot]}>
      <View style={isCompactLayout ? styles.compactAgentControls : undefined}>{controls}</View>
      <AssistantSelector
        serverId={serverId}
        selectedAssistantId={effectiveAssistantId}
        selectedTeamId={effectiveTeamId}
        onSelect={handleAssistantSelect}
        onSelectTeam={handleTeamSelect}
        fullWidth={isCompactLayout}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 1,
  },
  compactRoot: {
    width: "100%",
    minWidth: 0,
    flexDirection: "column",
    alignItems: "stretch",
    gap: theme.spacing[1],
  },
  compactAgentControls: {
    width: "100%",
    minWidth: 0,
  },
}));
