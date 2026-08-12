import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Check } from "lucide-react-native";
import { create } from "zustand";
import { useTranslation } from "react-i18next";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useToast } from "@/contexts/toast-context";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  buildWorktreeArchiveRiskReasons,
  toWorktreeArchiveRisk,
} from "@/git/worktree-archive-warning";
import { archiveWorkspacesOptimistically } from "@/workspace/workspace-archive";
import { redirectIfArchivingActiveWorkspace } from "@/utils/sidebar-workspace-archive-redirect";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import type { Theme } from "@/styles/theme";

interface SidebarWorkspaceBulkArchiveState {
  active: boolean;
  archiving: boolean;
  selectedKeys: ReadonlySet<string>;
  start: () => void;
  cancel: () => void;
  toggle: (workspaceKey: string) => void;
  setArchiving: (archiving: boolean) => void;
  keepSelected: (workspaceKeys: string[]) => void;
}

export const useSidebarWorkspaceBulkArchiveStore = create<SidebarWorkspaceBulkArchiveState>(
  (set) => ({
    active: false,
    archiving: false,
    selectedKeys: new Set<string>(),
    start: () => set({ active: true, selectedKeys: new Set<string>() }),
    cancel: () => set({ active: false, archiving: false, selectedKeys: new Set<string>() }),
    toggle: (workspaceKey) =>
      set((state) => {
        if (!state.active || state.archiving) {
          return state;
        }
        const selectedKeys = new Set(state.selectedKeys);
        if (selectedKeys.has(workspaceKey)) {
          selectedKeys.delete(workspaceKey);
        } else {
          selectedKeys.add(workspaceKey);
        }
        return { selectedKeys };
      }),
    setArchiving: (archiving) => set({ archiving }),
    keepSelected: (workspaceKeys) =>
      set({
        active: workspaceKeys.length > 0,
        selectedKeys: new Set(workspaceKeys),
      }),
  }),
);

export function useSidebarWorkspaceBulkSelection(workspaceKey: string) {
  const active = useSidebarWorkspaceBulkArchiveStore((state) => state.active);
  const archiving = useSidebarWorkspaceBulkArchiveStore((state) => state.archiving);
  const selected = useSidebarWorkspaceBulkArchiveStore((state) =>
    state.selectedKeys.has(workspaceKey),
  );
  const toggleSelection = useSidebarWorkspaceBulkArchiveStore((state) => state.toggle);
  const toggle = useCallback(() => toggleSelection(workspaceKey), [toggleSelection, workspaceKey]);

  return { active, archiving, selected, toggle };
}

export function useSidebarWorkspaceBulkArchive(
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>,
) {
  const { t } = useTranslation();
  const toast = useToast();
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  const active = useSidebarWorkspaceBulkArchiveStore((state) => state.active);
  const archiving = useSidebarWorkspaceBulkArchiveStore((state) => state.archiving);
  const selectedKeys = useSidebarWorkspaceBulkArchiveStore((state) => state.selectedKeys);
  const start = useSidebarWorkspaceBulkArchiveStore((state) => state.start);
  const cancel = useSidebarWorkspaceBulkArchiveStore((state) => state.cancel);
  const setArchiving = useSidebarWorkspaceBulkArchiveStore((state) => state.setArchiving);
  const keepSelected = useSidebarWorkspaceBulkArchiveStore((state) => state.keepSelected);

  const selectedWorkspaces = useMemo(
    () =>
      Array.from(selectedKeys).flatMap((workspaceKey) => {
        const workspace = workspaceEntriesByKey.get(workspaceKey);
        return workspace && workspace.archivingAt === null ? [workspace] : [];
      }),
    [selectedKeys, workspaceEntriesByKey],
  );

  const archiveSelected = useCallback(async () => {
    if (archiving || selectedWorkspaces.length === 0) {
      return;
    }

    const riskyWorktreeCount = selectedWorkspaces.filter(
      (workspace) =>
        workspace.workspaceKind === "worktree" &&
        buildWorktreeArchiveRiskReasons(toWorktreeArchiveRisk(workspace)).length > 0,
    ).length;
    const messageParts = [
      t("sidebar.workspace.bulkArchive.message", { count: selectedWorkspaces.length }),
    ];
    if (riskyWorktreeCount > 0) {
      messageParts.push(
        t("sidebar.workspace.bulkArchive.riskyWorktrees", { count: riskyWorktreeCount }),
      );
    }

    const confirmed = await confirmDialog({
      title: t("sidebar.workspace.bulkArchive.title", { count: selectedWorkspaces.length }),
      message: messageParts.join("\n\n"),
      confirmLabel: t("sidebar.workspace.bulkArchive.confirm"),
      cancelLabel: t("common.actions.cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setArchiving(true);
    try {
      for (const workspace of selectedWorkspaces) {
        redirectIfArchivingActiveWorkspace({
          serverId: workspace.serverId,
          workspaceId: workspace.workspaceId,
          activeWorkspaceSelection,
        });
      }

      const failures = await archiveWorkspacesOptimistically({
        getClient: (serverId) => getHostRuntimeStore().getClient(serverId),
        workspaces: selectedWorkspaces.map(({ serverId, workspaceId }) => ({
          serverId,
          workspaceId,
        })),
      });
      const failedKeys = new Set(
        failures.map(({ serverId, workspaceId }) => `${serverId}:${workspaceId}`),
      );

      for (const workspace of selectedWorkspaces) {
        if (failedKeys.has(workspace.workspaceKey)) {
          continue;
        }
        const persistenceKey = buildWorkspaceTabPersistenceKey(workspace);
        if (persistenceKey) {
          useWorkspaceLayoutStore.getState().purgeWorkspace(persistenceKey);
        }
      }

      if (failures.length > 0) {
        keepSelected(Array.from(failedKeys));
        toast.error(
          t("sidebar.workspace.bulkArchive.failed", {
            count: failures.length,
          }),
        );
      } else {
        cancel();
      }
    } finally {
      setArchiving(false);
    }
  }, [
    activeWorkspaceSelection,
    archiving,
    cancel,
    keepSelected,
    selectedWorkspaces,
    setArchiving,
    t,
    toast,
  ]);

  return {
    active,
    archiving,
    selectedCount: selectedWorkspaces.length,
    start,
    cancel,
    archiveSelected,
  };
}

const checkColorMapping = (theme: Theme) => ({
  color: theme.colors.primaryForeground,
});
const ThemedCheck = withUnistyles(Check);

export function SidebarWorkspaceBulkSelectionIndicator({ selected }: { selected: boolean }) {
  return (
    <View
      style={[styles.checkbox, selected && styles.checkboxSelected]}
      testID={selected ? "sidebar-workspace-selected" : "sidebar-workspace-unselected"}
    >
      {selected ? <ThemedCheck size={12} uniProps={checkColorMapping} /> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  checkbox: {
    width: theme.iconSize.md,
    height: theme.iconSize.md,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.foregroundExtraMuted,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkboxSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
}));
