import { useCallback, useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { GitBranch } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { ProjectGitRepository } from "@/git/use-project-git-repositories";

const ThemedGitBranch = withUnistyles(GitBranch);

export function RepositorySwitcher({
  repositories,
  selectedRoot,
  onSelect,
}: {
  repositories: readonly ProjectGitRepository[];
  selectedRoot: string | null;
  onSelect: (root: string) => void;
}) {
  if (repositories.length <= 1) return null;
  return (
    <View style={styles.container} testID="git-repository-groups">
      <Text style={styles.heading}>Git 仓库</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {repositories.map((repository) => (
          <RepositoryTab
            key={repository.root}
            repository={repository}
            selected={repository.root === selectedRoot}
            onSelect={onSelect}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function RepositoryTab({
  repository,
  selected,
  onSelect,
}: {
  repository: ProjectGitRepository;
  selected: boolean;
  onSelect: (root: string) => void;
}) {
  const handlePress = useCallback(() => onSelect(repository.root), [onSelect, repository.root]);
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const branch =
    repository.status.currentBranch && repository.status.currentBranch !== "HEAD"
      ? repository.status.currentBranch
      : null;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={`${repository.label} ${repository.pathLabel}`}
      accessibilityState={accessibilityState}
      onPress={handlePress}
      style={[styles.tab, selected && styles.tabSelected]}
      testID={`git-repository-group-${repository.root}`}
    >
      <View style={styles.titleRow}>
        <ThemedGitBranch size={13} strokeWidth={1.5} uniProps={iconColorMapping} />
        <Text numberOfLines={1} style={[styles.label, selected && styles.labelSelected]}>
          {repository.label}
        </Text>
        {branch ? (
          <Text numberOfLines={1} style={styles.branch}>
            {branch}
          </Text>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.path}>
        {repository.pathLabel}
      </Text>
    </Pressable>
  );
}

const iconColorMapping = (theme: { colors: { foregroundMuted: string } }) => ({
  color: theme.colors.foregroundMuted,
});

const styles = StyleSheet.create((theme) => ({
  container: {
    flexShrink: 0,
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  heading: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  tabs: {
    gap: theme.spacing[1],
  },
  tab: {
    minWidth: 132,
    maxWidth: 260,
    gap: 2,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  tabSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  label: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  labelSelected: {
    color: theme.colors.foreground,
  },
  branch: {
    maxWidth: 100,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  path: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
  },
}));
