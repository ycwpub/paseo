import { useCallback, type ReactNode } from "react";
import {
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Archive, ChevronsDown, ChevronsUp, ListChecks, Search, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { SidebarDisplayPreferencesMenu } from "@/components/sidebar/display-preferences/menu";
import { useSidebarModel } from "@/components/sidebar/sidebar-model";
import { useSidebarWorkspaceBulkArchive } from "@/components/sidebar/sidebar-workspace-bulk-archive";
import { Shortcut } from "@/components/ui/shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import type { Theme } from "@/styles/theme";

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const ThemedArchive = withUnistyles(Archive);
const ThemedChevronsDown = withUnistyles(ChevronsDown);
const ThemedChevronsUp = withUnistyles(ChevronsUp);
const ThemedListChecks = withUnistyles(ListChecks);
const ThemedSearch = withUnistyles(Search);
const ThemedX = withUnistyles(X);

type HeaderIconName = "archive" | "chevrons-down" | "chevrons-up" | "list-checks" | "search" | "x";

function HeaderIcon({ highlighted, name }: { highlighted: boolean; name: HeaderIconName }) {
  const uniProps = highlighted ? foregroundColorMapping : foregroundMutedColorMapping;
  let icon: ReactNode;

  switch (name) {
    case "archive":
      icon = <ThemedArchive size={14} uniProps={uniProps} />;
      break;
    case "chevrons-down":
      icon = <ThemedChevronsDown size={14} uniProps={uniProps} />;
      break;
    case "chevrons-up":
      icon = <ThemedChevronsUp size={14} uniProps={uniProps} />;
      break;
    case "list-checks":
      icon = <ThemedListChecks size={14} uniProps={uniProps} />;
      break;
    case "search":
      icon = <ThemedSearch size={14} uniProps={uniProps} />;
      break;
    case "x":
      icon = <ThemedX size={14} uniProps={uniProps} />;
      break;
  }

  return icon;
}

function HeaderTooltipContent({
  label,
  shortcutKeys,
}: {
  label: string;
  shortcutKeys?: ReturnType<typeof useShortcutKeys>;
}) {
  return (
    <View style={styles.tooltipRow}>
      <Text style={styles.tooltipText}>{label}</Text>
      {shortcutKeys ? <Shortcut chord={shortcutKeys} /> : null}
    </View>
  );
}

function HeaderIconButton({
  label,
  testID,
  icon,
  onPress,
  disabled = false,
  shortcutKeys,
}: {
  label: string;
  testID: string;
  icon: HeaderIconName;
  onPress: () => void;
  disabled?: boolean;
  shortcutKeys?: ReturnType<typeof useShortcutKeys>;
}) {
  const style = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) =>
      [
        styles.iconButton,
        (hovered || pressed) && styles.iconButtonHovered,
        disabled && styles.iconButtonDisabled,
      ] satisfies StyleProp<ViewStyle>,
    [disabled],
  );

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          disabled={disabled}
          testID={testID}
          style={style}
          onPress={onPress}
        >
          {({ hovered, pressed }) => (
            <HeaderIcon name={icon} highlighted={Boolean(hovered || pressed)} />
          )}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" offset={8}>
        <HeaderTooltipContent label={label} shortcutKeys={shortcutKeys} />
      </TooltipContent>
    </Tooltip>
  );
}

export function WorkspacesSectionHeader() {
  const { t } = useTranslation();
  const { allWorkspaceGroupsCollapsed, setAllWorkspaceGroupsCollapsed, workspaceEntriesByKey } =
    useSidebarModel();
  const bulkArchive = useSidebarWorkspaceBulkArchive(workspaceEntriesByKey);
  const setCommandCenterOpen = useKeyboardShortcutsStore((state) => state.setCommandCenterOpen);
  const commandCenterKeys = useShortcutKeys("toggle-command-center");
  const handleSearchPress = useCallback(() => setCommandCenterOpen(true), [setCommandCenterOpen]);
  const handleToggleAllPress = useCallback(
    () => setAllWorkspaceGroupsCollapsed(!allWorkspaceGroupsCollapsed),
    [allWorkspaceGroupsCollapsed, setAllWorkspaceGroupsCollapsed],
  );
  const handleBulkArchivePress = useCallback(() => {
    void bulkArchive.archiveSelected();
  }, [bulkArchive]);
  const toggleAllIcon = allWorkspaceGroupsCollapsed ? "chevrons-down" : "chevrons-up";
  const toggleAllLabel = allWorkspaceGroupsCollapsed
    ? t("sidebar.actions.expandAllWorkspaces")
    : t("sidebar.actions.collapseAllWorkspaces");

  return (
    <View style={styles.header}>
      <Text style={styles.title}>
        {bulkArchive.active
          ? t("sidebar.workspace.bulkArchive.selected", { count: bulkArchive.selectedCount })
          : "Workspaces"}
      </Text>
      <View style={styles.actions}>
        {bulkArchive.active ? (
          <>
            <HeaderIconButton
              label={t("sidebar.workspace.bulkArchive.confirm")}
              testID="sidebar-bulk-archive-workspaces"
              icon="archive"
              onPress={handleBulkArchivePress}
              disabled={bulkArchive.selectedCount === 0 || bulkArchive.archiving}
            />
            <HeaderIconButton
              label={t("sidebar.workspace.bulkArchive.cancel")}
              testID="sidebar-cancel-workspace-selection"
              icon="x"
              onPress={bulkArchive.cancel}
              disabled={bulkArchive.archiving}
            />
          </>
        ) : (
          <>
            <HeaderIconButton
              label={t("sidebar.workspace.bulkArchive.select")}
              testID="sidebar-select-workspaces"
              icon="list-checks"
              onPress={bulkArchive.start}
            />
            <HeaderIconButton
              label={toggleAllLabel}
              testID="sidebar-toggle-all-workspaces"
              icon={toggleAllIcon}
              onPress={handleToggleAllPress}
            />
            <HeaderIconButton
              label="Search"
              testID="sidebar-command-center-search"
              icon="search"
              onPress={handleSearchPress}
              shortcutKeys={commandCenterKeys}
            />
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <View>
                  <SidebarDisplayPreferencesMenu />
                </View>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="center" offset={8}>
                <HeaderTooltipContent label="Display preferences" />
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingLeft: theme.spacing[2],
    paddingRight: 4,
    paddingTop: theme.spacing[1],
    paddingBottom: theme.spacing[1],
  },
  title: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  iconButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  iconButtonHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  iconButtonDisabled: {
    opacity: 0.4,
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
