import { useMemo } from "react";
import { Text, View } from "react-native";
import { Save, X } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  PluginAppDefinition,
  PluginHttpJob,
  PluginSummary,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";
import { PluginAppSurface } from "@/screens/settings/plugins/plugin-app-modal";
import type { PluginAppComponentSlots } from "@/screens/settings/plugins/plugin-app-component-slot";
import { DevelopmentAssistantMemoryField } from "./development-assistant-memory-field";
import type { DevelopmentProjectMode } from "./development-project-selection-model";
import { DevelopmentProjectSelector } from "./development-project-selector";
import { DevelopmentPrdField } from "./development-prd-field";
import type { DevelopmentPrdSourceValue } from "./development-prd-source-model";

const EDIT_HIDDEN_COMPONENT_IDS = ["run", "status", "result"] as const;

export function DevelopmentFlowForm({
  mode,
  active,
  serverId,
  plugin,
  appDefinition,
  projectMode,
  flowProjectId,
  flowProjectDisplay,
  newProjectName,
  sourceProjectId,
  sourceProjectDisplay,
  projectOptions,
  sourceProjectOptions,
  canCreateNewProject,
  fixedFormValues,
  prdSource,
  initialFormValues,
  contextLoading,
  contextError,
  canRenderForm,
  saving = false,
  onProjectModeChange,
  onFlowProjectChange,
  onNewProjectNameChange,
  onSourceProjectChange,
  onFormValuesChange,
  onPrdSourceChange,
  onPrepareSubmission,
  onJobSubmitted,
  onSave,
  onCancel,
}: {
  mode: "create" | "edit";
  active: boolean;
  serverId: string;
  plugin: PluginSummary;
  appDefinition: PluginAppDefinition;
  projectMode: DevelopmentProjectMode;
  flowProjectId: string | null;
  flowProjectDisplay: SelectFieldDisplay | null;
  newProjectName: string;
  sourceProjectId: string | null;
  sourceProjectDisplay: SelectFieldDisplay | null;
  projectOptions: SelectFieldOption<string>[];
  sourceProjectOptions: SelectFieldOption<string>[];
  canCreateNewProject: boolean;
  fixedFormValues: Record<string, unknown>;
  prdSource: DevelopmentPrdSourceValue;
  initialFormValues?: Record<string, unknown>;
  contextLoading: boolean;
  contextError: string | null;
  canRenderForm: boolean;
  saving?: boolean;
  onProjectModeChange: (mode: DevelopmentProjectMode) => void;
  onFlowProjectChange: (projectId: string) => void;
  onNewProjectNameChange: (name: string) => void;
  onSourceProjectChange: (projectId: string) => void;
  onFormValuesChange?: (form: Record<string, unknown>) => void;
  onPrdSourceChange: (value: DevelopmentPrdSourceValue) => void;
  onPrepareSubmission?: (
    form: Record<string, unknown>,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  onJobSubmitted?: (job: PluginHttpJob) => void;
  onSave?: () => void;
  onCancel?: () => void;
}) {
  const hiddenFieldIds = useMemo(
    () => (mode === "edit" ? EDIT_HIDDEN_COMPONENT_IDS : undefined),
    [mode],
  );
  const componentSlots = useMemo<PluginAppComponentSlots>(
    () => ({
      prd: (
        <DevelopmentPrdField
          active={active}
          serverId={serverId}
          plugin={plugin}
          value={prdSource}
          onChange={onPrdSourceChange}
        />
      ),
      assistant_id: ({ form, value, onChange }) => (
        <DevelopmentAssistantMemoryField
          serverId={serverId}
          value={value}
          enabled={form.memory_assistant === true}
          onChange={onChange}
        />
      ),
    }),
    [active, onPrdSourceChange, plugin, prdSource, serverId],
  );
  return (
    <View style={styles.pane}>
      <View style={styles.header}>
        <Text style={styles.title}>{mode === "create" ? "创建开发流程" : "编辑开发流程"}</Text>
        <Text style={styles.hint}>
          {mode === "create"
            ? "选择已有 Project 承载流程，或创建一个新的独立 Project；代码仓库可来自另一个 Project。"
            : "可修改流程的全部业务配置；执行状态、Process ID 和历史节点结果保持只读。"}
        </Text>
      </View>
      {mode === "create" ? (
        <DevelopmentProjectSelector
          mode={projectMode}
          existingProjectId={flowProjectId}
          existingProjectDisplay={flowProjectDisplay}
          newProjectName={newProjectName}
          projectOptions={projectOptions}
          canCreateNewProject={canCreateNewProject}
          onModeChange={onProjectModeChange}
          onExistingProjectChange={onFlowProjectChange}
          onNewProjectNameChange={onNewProjectNameChange}
        />
      ) : null}
      <SelectField
        label="代码来源 Project"
        value={sourceProjectId}
        selectedDisplay={sourceProjectDisplay}
        options={sourceProjectOptions}
        onChange={onSourceProjectChange}
        placeholder="选择 Project"
        emptyText="当前 Host 没有可用 Project"
        searchable
        searchPlaceholder="搜索 Project"
        hint="仓库路径和关联飞书文档会自动读取所选 Project 的配置。"
      />
      {canRenderForm && !contextLoading ? (
        <PluginAppSurface
          active={active}
          serverId={serverId}
          plugin={plugin}
          appDefinition={appDefinition}
          fixedFormValues={fixedFormValues}
          initialFormValues={initialFormValues}
          hiddenFieldIds={hiddenFieldIds}
          componentSlots={componentSlots}
          showConversation={false}
          prepareSubmission={onPrepareSubmission}
          onFormValuesChange={onFormValuesChange}
          onJobSubmitted={onJobSubmitted}
          previewTitle="流程配置"
        />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {contextLoading ? "正在读取 Project 配置…" : "当前 Project 无法配置流程"}
          </Text>
          <Text style={styles.hint}>
            {contextError ??
              (sourceProjectId
                ? "该 Project 没有关联代码目录，请选择包含代码目录的 Project。"
                : "请先创建或选择 Project。")}
          </Text>
        </View>
      )}
      {mode === "edit" ? (
        <View style={styles.actions}>
          <Button variant="outline" leftIcon={X} disabled={saving} onPress={onCancel}>
            取消
          </Button>
          <Button
            variant="default"
            leftIcon={Save}
            loading={saving}
            disabled={!canRenderForm || contextLoading}
            onPress={onSave}
          >
            保存修改
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  pane: {
    gap: theme.spacing[4],
  },
  header: {
    gap: theme.spacing[1],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
  },
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  empty: {
    alignItems: "flex-start",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[6],
  },
  emptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
    paddingTop: theme.spacing[2],
  },
}));
