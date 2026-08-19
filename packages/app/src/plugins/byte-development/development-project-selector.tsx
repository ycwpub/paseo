import { useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";
import type { DevelopmentProjectMode } from "./development-project-selection-model";

const PROJECT_MODE_OPTIONS = [
  { value: "existing", label: "选择已有 Project" },
  { value: "new", label: "创建新 Project" },
] satisfies Array<{ value: DevelopmentProjectMode; label: string }>;

export function DevelopmentProjectSelector({
  mode,
  existingProjectId,
  existingProjectDisplay,
  newProjectName,
  projectOptions,
  canCreateNewProject,
  onModeChange,
  onExistingProjectChange,
  onNewProjectNameChange,
}: {
  mode: DevelopmentProjectMode;
  existingProjectId: string | null;
  existingProjectDisplay: SelectFieldDisplay | null;
  newProjectName: string;
  projectOptions: SelectFieldOption<string>[];
  canCreateNewProject: boolean;
  onModeChange: (mode: DevelopmentProjectMode) => void;
  onExistingProjectChange: (projectId: string) => void;
  onNewProjectNameChange: (name: string) => void;
}) {
  const projectModeOptions = useMemo(
    () => [
      {
        value: PROJECT_MODE_OPTIONS[0].value,
        label: PROJECT_MODE_OPTIONS[0].label,
        disabled: false,
      },
      {
        value: PROJECT_MODE_OPTIONS[1].value,
        label: PROJECT_MODE_OPTIONS[1].label,
        disabled: !canCreateNewProject,
      },
    ],
    [canCreateNewProject],
  );

  return (
    <View style={styles.container}>
      <Field label="流程 Project" hint="用于承载本开发流程的日常对话、Agent 指令和过程记录。">
        <SegmentedControl
          value={mode}
          onValueChange={onModeChange}
          options={projectModeOptions}
          style={styles.modeControl}
          testID="development-project-mode"
        />
      </Field>
      {mode === "existing" ? (
        <SelectField
          label="已有 Project"
          value={existingProjectId}
          selectedDisplay={existingProjectDisplay}
          options={projectOptions}
          onChange={onExistingProjectChange}
          placeholder="选择已有 Project"
          emptyText="当前 Host 没有可用 Project"
          searchable
          searchPlaceholder="搜索 Project"
          hint="不会创建新 Project，流程会直接关联到所选 Project。"
        />
      ) : (
        <Field
          label="新 Project 名称（可选）"
          hint={
            canCreateNewProject
              ? "留空时会根据流程名称自动生成，例如“研发流程 · 支付优化”。"
              : "当前 Host 不支持创建无目录 Project，请更新并重启 daemon。"
          }
        >
          <FormTextInput
            value={newProjectName}
            onChangeText={onNewProjectNameChange}
            placeholder="根据流程名称自动生成"
            editable={canCreateNewProject}
            testID="development-new-project-name"
          />
        </Field>
      )}
      <Text style={styles.sourceHint}>
        流程 Project 与代码来源 Project 可以相同；无目录 Project 需要另选代码来源。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  modeControl: {
    alignSelf: "flex-start",
  },
  sourceHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
  },
}));
