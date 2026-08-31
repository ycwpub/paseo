import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { Plus, X } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { resolveGitRepositoryManagedPath } from "@getpaseo/protocol/project-git-resource";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EditingTextInput as TextInput } from "@/components/ui/text-input";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import {
  projectDirectoryPathForDisplay,
  type ProjectDirectoryDraft,
  type ProjectDirectoryKey,
} from "./project-config-editor-model";

const ICON_SIZE = 14;

/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-jsx-as-prop -- Dynamic form rows bind edits to their current row values. */
export function ProjectDirectoryListSection({
  title,
  hint,
  directoryKey,
  values,
  mode,
  projectDirectoryPath,
  error,
  onModeChange,
  onChange,
  flush,
}: {
  title: string;
  hint: string;
  directoryKey: ProjectDirectoryKey;
  values: ProjectDirectoryDraft[];
  mode?: "single" | "multiple";
  projectDirectoryPath?: string;
  error?: string | null;
  onModeChange?: (value: "single" | "multiple") => void;
  onChange: (key: ProjectDirectoryKey, values: ProjectDirectoryDraft[]) => void;
  flush?: boolean;
}) {
  const { t } = useTranslation();
  const add = useCallback(
    () =>
      onChange(directoryKey, [
        ...values,
        {
          id: `project-directory-${directoryKey}-${Date.now()}`,
          type: "local-directory",
          path: "",
          repository: "",
          branch: "",
          directory: "",
          enabled: true,
        },
      ]),
    [directoryKey, onChange, values],
  );
  const canAdd = mode !== "single" || values.length === 0;
  return (
    <SettingsSection
      title={title}
      flush={flush}
      trailing={
        <Pressable
          onPress={add}
          disabled={!canAdd}
          hitSlop={8}
          style={[settingsStyles.sectionHeaderLink, !canAdd && styles.disabledControl]}
        >
          <Plus size={ICON_SIZE} color={styles.iconColor.color} />
        </Pressable>
      }
    >
      <Text style={styles.sectionHint}>{hint}</Text>
      {mode && onModeChange ? (
        <View style={styles.directoryModeRow}>
          <Button
            variant={mode === "single" ? "default" : "outline"}
            size="sm"
            onPress={() => onModeChange("single")}
            testID="project-directory-mode-single"
          >
            {t("settings.project.resources.project.single")}
          </Button>
          <Button
            variant={mode === "multiple" ? "default" : "outline"}
            size="sm"
            onPress={() => onModeChange("multiple")}
            testID="project-directory-mode-multiple"
          >
            {t("settings.project.resources.project.multiple")}
          </Button>
        </View>
      ) : null}
      <View style={styles.listEditor}>
        {values.length === 0 ? (
          <Text style={styles.emptyText}>{t("settings.project.resources.emptyDirectories")}</Text>
        ) : (
          values.map((value) => (
            <ProjectDirectoryRow
              key={value.id}
              title={title}
              directoryKey={directoryKey}
              value={value}
              values={values}
              projectDirectoryPath={projectDirectoryPath}
              onChange={onChange}
            />
          ))
        )}
        {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      </View>
    </SettingsSection>
  );
}

function ProjectDirectoryRow({
  title,
  directoryKey,
  value,
  values,
  projectDirectoryPath,
  onChange,
}: {
  title: string;
  directoryKey: ProjectDirectoryKey;
  value: ProjectDirectoryDraft;
  values: ProjectDirectoryDraft[];
  projectDirectoryPath?: string;
  onChange: (key: ProjectDirectoryKey, values: ProjectDirectoryDraft[]) => void;
}) {
  const { t } = useTranslation();
  const patch = useCallback(
    (next: Partial<ProjectDirectoryDraft>) => {
      onChange(
        directoryKey,
        values.map((entry) => (entry.id === value.id ? { ...entry, ...next } : entry)),
      );
    },
    [directoryKey, onChange, value.id, values],
  );
  const remove = useCallback(
    () =>
      onChange(
        directoryKey,
        values.filter((entry) => entry.id !== value.id),
      ),
    [directoryKey, onChange, value.id, values],
  );
  const supportsGit = directoryKey === "project";
  return (
    <View style={styles.directoryEntry}>
      <View style={styles.listEditorRow}>
        <Switch
          value={value.enabled}
          onValueChange={(enabled) => patch({ enabled })}
          testID={`project-directory-enabled-${value.id}`}
        />
        {supportsGit ? (
          <View style={styles.directoryTypeRow}>
            <Button
              variant={value.type === "local-directory" ? "default" : "outline"}
              size="sm"
              onPress={() => patch({ type: "local-directory" })}
            >
              本地目录
            </Button>
            <Button
              variant={value.type === "git-repository" ? "default" : "outline"}
              size="sm"
              onPress={() => patch({ type: "git-repository" })}
            >
              Git 仓库
            </Button>
          </View>
        ) : null}
        {value.type === "local-directory" || !supportsGit ? (
          <TextInput
            value={
              projectDirectoryPath
                ? projectDirectoryPathForDisplay(value.path, projectDirectoryPath)
                : value.path
            }
            onChangeText={(next) => patch({ path: next })}
            placeholder="./path"
            placeholderTextColor={styles.placeholderColor.color}
            style={styles.flexInput}
          />
        ) : null}
        <Pressable
          accessibilityLabel={t("settings.project.resources.removeDirectory", { title })}
          onPress={remove}
          style={styles.removeIconButton}
        >
          <X size={ICON_SIZE} color={styles.iconColor.color} />
        </Pressable>
      </View>
      {supportsGit && value.type === "git-repository" ? (
        <>
          <View style={styles.gitDirectoryFields}>
            <TextInput
              value={value.repository ?? ""}
              onChangeText={(repository) => patch({ repository })}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Git 仓库地址，例如 git@host:team/repo.git"
              placeholderTextColor={styles.placeholderColor.color}
              style={styles.flexInput}
            />
            <TextInput
              value={value.branch ?? ""}
              onChangeText={(branch) => patch({ branch })}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="分支（留空使用默认分支）"
              placeholderTextColor={styles.placeholderColor.color}
              style={styles.gitBranchInput}
            />
            <TextInput
              value={value.directory ?? ""}
              onChangeText={(directory) => patch({ directory })}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="repos 下的目录名（可选）"
              placeholderTextColor={styles.placeholderColor.color}
              style={styles.gitDirectoryInput}
            />
          </View>
          <Text selectable style={styles.gitPath}>
            下载路径：
            {projectDirectoryPath && (value.repository ?? "").trim()
              ? resolveGitRepositoryManagedPath({
                  repository: value.repository ?? "",
                  ...((value.directory ?? "").trim() ? { directory: value.directory } : {}),
                }).replace("{{projectRoot}}", projectDirectoryPath)
              : "保存后下载到 Project 路径下的 repos 目录"}
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  sectionHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing[2],
  },
  directoryModeRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  disabledControl: {
    opacity: 0.35,
  },
  listEditor: {
    gap: theme.spacing[2],
  },
  listEditorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  directoryEntry: {
    gap: theme.spacing[2],
  },
  directoryTypeRow: {
    flexDirection: "row",
    gap: theme.spacing[1],
  },
  gitDirectoryFields: {
    flexDirection: {
      xs: "column",
      lg: "row",
    },
    gap: theme.spacing[2],
    paddingLeft: 52,
  },
  flexInput: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  gitBranchInput: {
    width: {
      xs: "100%",
      lg: 180,
    },
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  gitDirectoryInput: {
    width: {
      xs: "100%",
      lg: 220,
    },
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  gitPath: {
    color: theme.colors.foregroundExtraMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
    paddingLeft: 52,
  },
  removeIconButton: {
    padding: theme.spacing[2],
    alignSelf: "center",
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  fieldError: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  iconColor: {
    color: theme.colors.foregroundMuted,
  },
  placeholderColor: {
    color: theme.colors.foregroundExtraMuted,
  },
}));
