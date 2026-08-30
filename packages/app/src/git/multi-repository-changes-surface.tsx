import { useCallback, useEffect, useMemo, type ComponentProps } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ChangesSurface } from "@/git/diff-pane";
import {
  resolveRepositoryFocusPath,
  selectRepositoryRootForFocus,
} from "@/git/project-git-repositories";
import { RepositorySwitcher } from "@/git/repository-switcher";
import { useProjectGitRepositories } from "@/git/use-project-git-repositories";
import { resolveWorkingDiffFilePath } from "@/git/working-diff-repository";
import type { ChangesState } from "@/panels/changes/state";
import type { WorkspaceWorkingDiffTabTarget } from "@/workspace-tabs/model";

type ChangesSurfacePresentation = NonNullable<
  ComponentProps<typeof ChangesSurface>["presentation"]
>;

export function MultiRepositoryChangesSurface({
  serverId,
  workspaceId,
  workspaceRoot,
  target,
  enabled,
  presentation,
  modeScope,
  selectedRoot,
  onSelectedRootChange,
  onOpenFile,
  onOpenToSide,
  onSelectDiffFile,
  onAddToChat,
  state,
  onStateChange,
}: {
  serverId: string;
  workspaceId: string;
  workspaceRoot: string | null;
  target: WorkspaceWorkingDiffTabTarget | { kind: "changes_tree" };
  enabled: boolean;
  presentation: ChangesSurfacePresentation;
  modeScope: string;
  selectedRoot: string | null;
  onSelectedRootChange: (root: string | null) => void;
  onOpenFile: (path: string) => void;
  onOpenToSide?: (repositoryRoot: string, path: string) => void;
  onSelectDiffFile?: (repositoryRoot: string, path: string) => void;
  onAddToChat?: (path: string) => void;
  state: ChangesState;
  onStateChange: (state: ChangesState) => void;
}) {
  const requestedRoot = target.kind === "working_diff" ? target.cwd : undefined;
  const { repositories, isLoading } = useProjectGitRepositories({
    serverId,
    workspaceId,
    additionalRoots: requestedRoot ? [requestedRoot] : undefined,
  });
  const repositoryRoots = useMemo(
    () => repositories.map((repository) => repository.root),
    [repositories],
  );
  const targetRoot = selectRepositoryRootForFocus({
    repositoryRoots,
    requestedRoot,
    focusPath: target.kind === "working_diff" ? target.focusPath : undefined,
  });
  const focusPath = target.kind === "working_diff" ? target.focusPath : undefined;
  const focusSelectsRepository = Boolean(
    focusPath &&
    repositoryRoots.some((root) => focusPath === root || focusPath.startsWith(`${root}/`)),
  );
  const targetSelectsRepository = Boolean(requestedRoot || focusSelectsRepository);
  let activeRoot = targetRoot;
  if (!targetSelectsRepository && selectedRoot && repositoryRoots.includes(selectedRoot)) {
    activeRoot = selectedRoot;
  }

  useEffect(() => {
    if (activeRoot !== selectedRoot) onSelectedRootChange(activeRoot);
  }, [activeRoot, onSelectedRootChange, selectedRoot]);

  const activeRepository = repositories.find((repository) => repository.root === activeRoot);
  const resolveFilePath = useCallback(
    (path: string) =>
      resolveWorkingDiffFilePath({
        repositoryRoot: activeRoot ?? "",
        workspaceRoot,
        path,
      }),
    [activeRoot, workspaceRoot],
  );
  const handleOpenFile = useCallback(
    (path: string) => onOpenFile(resolveFilePath(path)),
    [onOpenFile, resolveFilePath],
  );
  const handleAddToChat = useCallback(
    (path: string) => onAddToChat?.(resolveFilePath(path)),
    [onAddToChat, resolveFilePath],
  );
  const handleSelectDiffFile = useCallback(
    (path: string) => {
      if (activeRoot) onSelectDiffFile?.(activeRoot, path);
    },
    [activeRoot, onSelectDiffFile],
  );
  const handleOpenToSide = useCallback(
    (path: string) => {
      if (activeRoot) onOpenToSide?.(activeRoot, path);
    },
    [activeRoot, onOpenToSide],
  );
  const repositoryFocusPath =
    target.kind === "working_diff" && activeRoot
      ? resolveRepositoryFocusPath({
          repositoryRoot: activeRoot,
          focusPath: target.focusPath,
        })
      : undefined;

  if (isLoading && repositories.length === 0) {
    return (
      <View style={styles.centerState} testID="git-repositories-loading">
        <Text style={styles.mutedText}>正在检查 Git 仓库...</Text>
      </View>
    );
  }
  if (!activeRepository || !activeRoot) {
    return (
      <View style={styles.centerState} testID="git-repositories-empty">
        <Text style={styles.mutedText}>未在当前 Project 中找到 Git 仓库。</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <RepositorySwitcher
        repositories={repositories}
        selectedRoot={activeRoot}
        onSelect={onSelectedRootChange}
      />
      <View style={styles.surface} key={activeRoot}>
        <ChangesSurface
          serverId={serverId}
          workspaceId={workspaceId}
          cwd={activeRoot}
          enabled={enabled}
          presentation={presentation}
          modeScope={`${modeScope}:repository=${encodeURIComponent(activeRoot)}`}
          focusPath={repositoryFocusPath}
          focusRequestId={target.kind === "working_diff" ? target.focusRequestId : undefined}
          onSelectDiffFile={onSelectDiffFile ? handleSelectDiffFile : undefined}
          onOpenFile={handleOpenFile}
          onOpenToSide={onOpenToSide ? handleOpenToSide : undefined}
          onAddToChat={onAddToChat ? handleAddToChat : undefined}
          state={state}
          onStateChange={onStateChange}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  surface: {
    flex: 1,
    minHeight: 0,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
  },
  mutedText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
}));
