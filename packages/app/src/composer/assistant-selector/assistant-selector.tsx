import { useCallback, useMemo, useRef, useState, type ReactElement } from "react";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Bot, Users } from "lucide-react-native";
import { useAssistants } from "@/hooks/use-assistants";
import { useTeams } from "@/hooks/use-teams";
import { useHostFeature } from "@/runtime/host-features";
import { resolveTeamAssistantIds, resolveTeamLeader } from "@/teams/team-members";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { ComboboxTrigger } from "@/components/ui/combobox-trigger";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

const ThemedBot = withUnistyles(Bot);
const ThemedUsers = withUnistyles(Users);

const botColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

interface AssistantSelectorProps {
  serverId: string;
  selectedAssistantId: string | null;
  selectedTeamId?: string | null;
  onSelect: (assistantId: string | null) => void;
  onSelectTeam?: (teamId: string | null, leaderAssistantId: string | null) => void;
  disabled?: boolean;
}

const NO_ASSISTANT_ID = "__none__";
const ASSISTANT_PREFIX = "assistant:";
const TEAM_PREFIX = "team:";

export function AssistantSelector({
  serverId,
  selectedAssistantId,
  selectedTeamId = null,
  onSelect,
  onSelectTeam,
  disabled,
}: AssistantSelectorProps): ReactElement | null {
  const assistants = useAssistants(serverId, { enabled: true });
  const supportsTeams = useHostFeature(serverId, "teams");
  const teams = useTeams(serverId, {
    enabled: supportsTeams && Boolean(onSelectTeam || selectedTeamId),
  });
  const effectiveDisabled = disabled || Boolean(selectedTeamId && !onSelectTeam);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<View>(null);

  // Keep latest onSelect in a ref so handleSelect always calls the current one,
  // avoiding stale closures when the Combobox Modal re-renders.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onSelectTeamRef = useRef(onSelectTeam);
  onSelectTeamRef.current = onSelectTeam;

  const options = useMemo<ComboboxOption[]>(() => {
    const list: ComboboxOption[] = [{ id: NO_ASSISTANT_ID, label: "No assistant" }];
    for (const a of assistants.assistants) {
      list.push({
        id: `${ASSISTANT_PREFIX}${a.id}`,
        label: a.name || "Unnamed assistant",
        description: a.description || undefined,
      });
    }
    if (supportsTeams && onSelectTeam) {
      for (const team of teams.teams) {
        const leader = resolveTeamLeader(team, assistants.assistants);
        if (!leader) continue;
        list.push({
          id: `${TEAM_PREFIX}${team.id}`,
          label: team.name,
          description: `Team · Leader: ${leader.name || "Unnamed assistant"} · ${resolveTeamAssistantIds(team).length} assistants`,
        });
      }
    }
    return list;
  }, [assistants.assistants, onSelectTeam, supportsTeams, teams.teams]);

  const selectedDisplay = useMemo(() => {
    if (selectedTeamId) {
      const team = teams.teams.find((entry) => entry.id === selectedTeamId);
      return team ? { label: team.name, team: true } : null;
    }
    if (!selectedAssistantId) return null;
    const a = assistants.assistants.find((x) => x.id === selectedAssistantId);
    return a ? { label: a.name || "Unnamed assistant", team: false } : null;
  }, [assistants.assistants, selectedAssistantId, selectedTeamId, teams.teams]);

  const handleSelect = useCallback(
    (id: string) => {
      if (id === NO_ASSISTANT_ID) {
        onSelectTeamRef.current?.(null, null);
        onSelectRef.current(null);
      } else if (id.startsWith(TEAM_PREFIX)) {
        const teamId = id.slice(TEAM_PREFIX.length);
        const team = teams.teams.find((entry) => entry.id === teamId);
        if (team) {
          onSelectTeamRef.current?.(team.id, team.leaderAssistantId);
          onSelectRef.current(team.leaderAssistantId);
        }
      } else {
        onSelectTeamRef.current?.(null, null);
        onSelectRef.current(id.slice(ASSISTANT_PREFIX.length));
      }
      setOpen(false);
    },
    [teams.teams],
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
  }, []);

  const handlePress = useCallback(() => setOpen((prev) => !prev), []);

  const pressableStyle = useCallback(
    ({ pressed, hovered }: PressableStateCallbackType) => [
      styles.trigger,
      hovered && styles.triggerHovered,
      (pressed || open) && styles.triggerPressed,
      effectiveDisabled && styles.triggerDisabled,
    ],
    [effectiveDisabled, open],
  );

  if (!assistants.isLoading && !assistants.isConnected && assistants.assistants.length === 0) {
    return null;
  }

  const label = selectedDisplay?.label ?? "Assistant or team";
  let comboboxValue = NO_ASSISTANT_ID;
  if (selectedTeamId) {
    comboboxValue = `${TEAM_PREFIX}${selectedTeamId}`;
  } else if (selectedAssistantId) {
    comboboxValue = `${ASSISTANT_PREFIX}${selectedAssistantId}`;
  }

  return (
    <>
      <ComboboxTrigger
        ref={triggerRef}
        collapsable={false}
        disabled={effectiveDisabled}
        onPress={handlePress}
        style={pressableStyle}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {selectedDisplay?.team ? (
          <ThemedUsers size={ICON_SIZE.sm} uniProps={botColorMapping} />
        ) : (
          <ThemedBot size={ICON_SIZE.sm} uniProps={botColorMapping} />
        )}
        <Text style={selectedDisplay ? styles.labelActive : styles.label} numberOfLines={1}>
          {label}
        </Text>
      </ComboboxTrigger>
      <Combobox
        options={options}
        value={comboboxValue}
        onSelect={handleSelect}
        open={open}
        onOpenChange={handleOpenChange}
        anchorRef={triggerRef}
        desktopPlacement="top-start"
        searchable={false}
      />
    </>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  trigger: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius["2xl"],
  },
  triggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
  triggerPressed: {
    backgroundColor: theme.colors.surface0,
  },
  triggerDisabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    fontWeight: theme.fontWeight.normal,
    flexShrink: 1,
  },
  labelActive: {
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.semibold,
  },
}));
