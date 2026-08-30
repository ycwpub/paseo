import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { FileExplorerPane } from "@/components/file-explorer-pane";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useWorkspace } from "@/stores/session-store-hooks";
import { buildAbsoluteExplorerPath } from "@/utils/explorer-paths";
import { formatProjectResourceDirectoryPath } from "@/utils/project-resource-directories";
import {
  FILES_PANEL_DIRECTORY_SCOPE_IDS,
  resolveFilesPanelDirectoryScopes,
  resolveFilesPanelPath,
  type FilesPanelDirectoryScopeId,
} from "./files-panel-directory-scopes";

interface FilesPanelDirectoryBrowserProps {
  serverId: string;
  workspaceId: string;
  onOpenFile: (path: string) => void;
  onOpenFileToSide?: (path: string) => void;
  onAddToChat?: (path: string) => void;
}

export function FilesPanelDirectoryBrowser({
  serverId,
  workspaceId,
  onOpenFile,
  onOpenFileToSide,
  onAddToChat,
}: FilesPanelDirectoryBrowserProps) {
  const workspace = useWorkspace(serverId, workspaceId);
  const client = useHostRuntimeClient(serverId);
  const [selectedScopeId, setSelectedScopeId] = useState<FilesPanelDirectoryScopeId>("project");
  const [selectedRootIndex, setSelectedRootIndex] = useState(0);

  const projectConfigQuery = useFetchQuery({
    queryKey: [
      "files-panel-project-config",
      serverId,
      workspace?.projectId,
      workspace?.projectRootPath,
    ],
    enabled: Boolean(client && workspace),
    dataShape: "value",
    queryFn: async () => {
      if (!client || !workspace) return null;
      const result = await client.readProjectConfig(
        workspace.projectRootPath,
        undefined,
        workspace.projectId,
      );
      return result.ok ? (result.config?.project ?? null) : null;
    },
    retry: false,
    staleTimeMs: 30_000,
  });

  const scopes = useMemo(
    () =>
      workspace
        ? resolveFilesPanelDirectoryScopes({
            workspace,
            projectConfig: projectConfigQuery.data,
          })
        : [],
    [projectConfigQuery.data, workspace],
  );
  const selectedScope =
    scopes.find((scope) => scope.id === selectedScopeId) ??
    scopes.find((scope) => scope.id === FILES_PANEL_DIRECTORY_SCOPE_IDS[0]);
  const roots = selectedScope?.roots ?? [];
  const activeRoot = roots[selectedRootIndex] ?? "";
  const workspaceDirectory = workspace?.workspaceDirectory.trim() ?? "";

  useEffect(() => {
    setSelectedScopeId("project");
    setSelectedRootIndex(0);
  }, [serverId, workspaceId]);

  useEffect(() => {
    if (selectedRootIndex < roots.length) return;
    setSelectedRootIndex(0);
  }, [roots.length, selectedRootIndex]);

  const selectScope = useCallback((scopeId: FilesPanelDirectoryScopeId) => {
    setSelectedScopeId(scopeId);
    setSelectedRootIndex(0);
  }, []);

  const resolvePath = useCallback(
    (entryPath: string) =>
      resolveFilesPanelPath({
        root: activeRoot,
        workspaceDirectory,
        entryPath,
        buildAbsolutePath: buildAbsoluteExplorerPath,
      }),
    [activeRoot, workspaceDirectory],
  );
  const handleOpenFile = useCallback(
    (entryPath: string) => onOpenFile(resolvePath(entryPath)),
    [onOpenFile, resolvePath],
  );
  const handleOpenFileToSide = useCallback(
    (entryPath: string) => onOpenFileToSide?.(resolvePath(entryPath)),
    [onOpenFileToSide, resolvePath],
  );
  const handleAddToChat = useCallback(
    (entryPath: string) => onAddToChat?.(resolvePath(entryPath)),
    [onAddToChat, resolvePath],
  );

  if (!workspace) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.emptyText}>未找到 Workspace 目录。</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scopeScroll}
        contentContainerStyle={styles.scopeTabs}
        testID="files-panel-directory-scopes"
      >
        {scopes.map((scope) => (
          <DirectoryScopeTab
            key={scope.id}
            id={scope.id}
            label={scope.label}
            selected={scope.id === selectedScopeId}
            onSelect={selectScope}
          />
        ))}
      </ScrollView>

      {roots.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.rootScroll}
          contentContainerStyle={styles.rootTabs}
          testID="files-panel-directory-roots"
        >
          {roots.map((root, index) => (
            <DirectoryRootTab
              key={root}
              root={root}
              index={index}
              selected={index === selectedRootIndex}
              onSelect={setSelectedRootIndex}
            />
          ))}
        </ScrollView>
      ) : null}

      {activeRoot ? (
        <View style={styles.explorer}>
          <FileExplorerPane
            key={`${selectedScopeId}:${activeRoot}`}
            serverId={serverId}
            workspaceId={activeRoot === workspaceDirectory ? workspaceId : null}
            workspaceRoot={activeRoot}
            onOpenFile={handleOpenFile}
            onOpenFileToSide={onOpenFileToSide ? handleOpenFileToSide : undefined}
            onAddToChat={onAddToChat ? handleAddToChat : undefined}
          />
        </View>
      ) : (
        <View style={styles.centerState} testID="files-panel-directory-empty">
          <Text style={styles.emptyText}>此类型暂未配置目录。</Text>
        </View>
      )}
    </View>
  );
}

function DirectoryScopeTab({
  id,
  label,
  selected,
  onSelect,
}: {
  id: FilesPanelDirectoryScopeId;
  label: string;
  selected: boolean;
  onSelect: (id: FilesPanelDirectoryScopeId) => void;
}) {
  const handlePress = useCallback(() => onSelect(id), [id, onSelect]);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={selected ? SELECTED_TAB_STATE : UNSELECTED_TAB_STATE}
      onPress={handlePress}
      style={[styles.scopeTab, selected && styles.scopeTabSelected]}
      testID={`files-panel-directory-scope-${id}`}
    >
      <Text numberOfLines={1} style={[styles.scopeLabel, selected && styles.scopeLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function DirectoryRootTab({
  root,
  index,
  selected,
  onSelect,
}: {
  root: string;
  index: number;
  selected: boolean;
  onSelect: (index: number) => void;
}) {
  const handlePress = useCallback(() => onSelect(index), [index, onSelect]);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={root}
      accessibilityState={selected ? SELECTED_TAB_STATE : UNSELECTED_TAB_STATE}
      onPress={handlePress}
      style={[styles.rootTab, selected && styles.rootTabSelected]}
      testID={`files-panel-directory-root-${index}`}
    >
      <Text numberOfLines={1} style={[styles.rootLabel, selected && styles.rootLabelSelected]}>
        {formatProjectResourceDirectoryPath(root)}
      </Text>
    </Pressable>
  );
}

const SELECTED_TAB_STATE = { selected: true } as const;
const UNSELECTED_TAB_STATE = { selected: false } as const;

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  scopeScroll: {
    flexGrow: 0,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  scopeTabs: {
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  scopeTab: {
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  scopeTabSelected: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  scopeLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  scopeLabelSelected: {
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.semibold,
  },
  rootScroll: {
    flexGrow: 0,
    flexShrink: 0,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rootTabs: {
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  rootTab: {
    maxWidth: 240,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  rootTabSelected: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  rootLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  rootLabelSelected: {
    color: theme.colors.foreground,
  },
  explorer: {
    flex: 1,
    minHeight: 0,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
}));
