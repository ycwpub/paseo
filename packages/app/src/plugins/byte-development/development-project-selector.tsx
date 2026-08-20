import { useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Field } from "@/components/ui/form-field";
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
  projectOptions,
  canCreateNewProject,
  projectSelectionEnabled,
  onModeChange,
  onExistingProjectChange,
}: {
  mode: DevelopmentProjectMode;
  existingProjectId: string | null;
  existingProjectDisplay: SelectFieldDisplay | null;
  projectOptions: SelectFieldOption<string>[];
  canCreateNewProject: boolean;
  projectSelectionEnabled: boolean;
  onModeChange: (mode: DevelopmentProjectMode) => void;
  onExistingProjectChange: (projectId: string) => void;
}) {
  const projectModeOptions = useMemo(
    () => [
      {
        value: PROJECT_MODE_OPTIONS[0].value,
        label: PROJECT_MODE_OPTIONS[0].label,
        disabled: !projectSelectionEnabled,
      },
      {
        value: PROJECT_MODE_OPTIONS[1].value,
        label: PROJECT_MODE_OPTIONS[1].label,
        disabled: !projectSelectionEnabled || !canCreateNewProject,
      },
    ],
    [canCreateNewProject, projectSelectionEnabled],
  );

  return (
    <View style={styles.container}>
      <Field
        label="流程 Project"
        hint={
          projectSelectionEnabled
            ? "选择已有 Project，或进入标准创建流程新建多目录 Project。"
            : "请先填写新开发流程名称，再选择或创建 Project。"
        }
      >
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
          disabled={!projectSelectionEnabled}
        />
      ) : null}
      <Text style={styles.sourceHint}>
        流程 Project 与代码来源 Project 可以相同；多目录 Project 可另选代码来源。
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
