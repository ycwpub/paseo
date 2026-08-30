import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { RepositorySwitcher } from "@/git/repository-switcher";
import { useProjectGitRepositories } from "@/git/use-project-git-repositories";
import { PullRequestContent, usePullRequestData } from "@/panels/pull-request";

export function MultiRepositoryPullRequestPanel({
  serverId,
  workspaceId,
}: {
  serverId: string;
  workspaceId: string;
}) {
  const { repositories, isLoading } = useProjectGitRepositories({ serverId, workspaceId });
  const roots = useMemo(() => repositories.map((repository) => repository.root), [repositories]);
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const activeRoot =
    selectedRoot && roots.includes(selectedRoot) ? selectedRoot : (roots[0] ?? null);

  useEffect(() => {
    if (activeRoot !== selectedRoot) setSelectedRoot(activeRoot);
  }, [activeRoot, selectedRoot]);

  if (isLoading && repositories.length === 0) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.mutedText}>正在检查 Git 仓库...</Text>
      </View>
    );
  }
  if (!activeRoot) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.mutedText}>未在当前 Project 中找到 Git 仓库。</Text>
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <RepositorySwitcher
        repositories={repositories}
        selectedRoot={activeRoot}
        onSelect={setSelectedRoot}
      />
      <View style={styles.content} key={activeRoot}>
        <RepositoryPullRequestContent
          serverId={serverId}
          workspaceId={workspaceId}
          cwd={activeRoot}
        />
      </View>
    </View>
  );
}

function RepositoryPullRequestContent({
  serverId,
  workspaceId,
  cwd,
}: {
  serverId: string;
  workspaceId: string;
  cwd: string;
}) {
  const prPane = usePullRequestData({ serverId, cwd });
  return (
    <PullRequestContent serverId={serverId} workspaceId={workspaceId} cwd={cwd} prPane={prPane} />
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  content: {
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
