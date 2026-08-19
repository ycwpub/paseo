import { useMemo } from "react";
import { Text, View } from "react-native";
import { Plus, Save, X } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { PluginAppDefinition, PluginSummary } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { type SelectFieldDisplay, type SelectFieldOption } from "@/components/ui/select-field";
import { PluginAppSurface } from "@/screens/settings/plugins/plugin-app-modal";
import type { PluginAppComponentSlots } from "@/screens/settings/plugins/plugin-app-component-slot";
import { DevelopmentAssistantMemoryField } from "./development-assistant-memory-field";
import {
  PluginProjectDefaultAgentField,
  type PluginProjectDefaultAgentValue,
} from "@/plugins/project/plugin-project-default-agent-field";
import type { DevelopmentProjectMode } from "./development-project-selection-model";
import { DevelopmentProjectSelector } from "./development-project-selector";

const EDIT_HIDDEN_COMPONENT_IDS = ["prd", "run", "status", "result"] as const;

export function DevelopmentFlowForm({
  mode,
  active,
  serverId,
  plugin,
  appDefinition,
  flowTitle,
  projectMode,
  flowProjectId,
  flowProjectDisplay,
  projectOptions,
  canCreateNewProject,
  defaultAgent,
  defaultAgentCwd,
  fixedFormValues,
  initialFormValues,
  contextLoading,
  contextError,
  canRenderForm,
  saving = false,
  onFlowTitleChange,
  onProjectModeChange,
  onFlowProjectChange,
  onDefaultAgentChange,
  onFormValuesChange,
  onCreateDraft,
  onSave,
  onCancel,
}: {
  mode: "create" | "edit";
  active: boolean;
  serverId: string;
  plugin: PluginSummary;
  appDefinition: PluginAppDefinition;
  flowTitle: string;
  projectMode: DevelopmentProjectMode;
  flowProjectId: string | null;
  flowProjectDisplay: SelectFieldDisplay | null;
  projectOptions: SelectFieldOption<string>[];
  canCreateNewProject: boolean;
  defaultAgent: PluginProjectDefaultAgentValue;
  defaultAgentCwd: string | null;
  fixedFormValues: Record<string, unknown>;
  initialFormValues?: Record<string, unknown>;
  contextLoading: boolean;
  contextError: string | null;
  canRenderForm: boolean;
  saving?: boolean;
  onFlowTitleChange: (title: string) => void;
  onProjectModeChange: (mode: DevelopmentProjectMode) => void;
  onFlowProjectChange: (projectId: string) => void;
  onDefaultAgentChange: (value: PluginProjectDefaultAgentValue) => void;
  onFormValuesChange?: (form: Record<string, unknown>) => void;
  onCreateDraft?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
}) {
  const componentSlots = useMemo<PluginAppComponentSlots>(
    () => ({
      assistant_id: ({ form, value, onChange }) => (
        <DevelopmentAssistantMemoryField
          serverId={serverId}
          value={value}
          enabled={form.memory_assistant === true}
          onChange={onChange}
        />
      ),
    }),
    [serverId],
  );
  let editContent = null;
  if (mode === "edit" && canRenderForm && !contextLoading) {
    editContent = (
      <PluginAppSurface
        active={active}
        serverId={serverId}
        plugin={plugin}
        appDefinition={appDefinition}
        projectId={flowProjectId!}
        fixedFormValues={fixedFormValues}
        initialFormValues={initialFormValues}
        hiddenFieldIds={EDIT_HIDDEN_COMPONENT_IDS}
        componentSlots={componentSlots}
        showConversation={false}
        onFormValuesChange={onFormValuesChange}
        previewTitle="流程配置"
      />
    );
  } else if (mode === "edit") {
    editContent = (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>
          {contextLoading ? "正在读取 Project 配置…" : "当前 Project 无法配置流程"}
        </Text>
        <Text style={styles.hint}>
          {contextError ??
            (flowProjectId
              ? "流程 Project 没有关联代码目录，请先在 Project 设置中添加代码目录。"
              : "请先创建或选择 Project。")}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.pane}>
      <View style={styles.header}>
        <Text style={styles.title}>{mode === "create" ? "创建开发流程" : "编辑开发流程"}</Text>
        <Text style={styles.hint}>
          {mode === "create"
            ? "这里只创建开发任务并关联 Project。创建后选择节点，在 Project Agent 会话中与 Agent 协作完成任务。"
            : "可修改流程的通用业务配置；PRD 和节点专有知识请在对应节点中维护。已有 Agent 会话和节点状态不会被重置。"}
        </Text>
      </View>
      {mode === "create" ? (
        <>
          <Field
            label="新开发流程名称（必填）"
            hint="创建新 Project 时会直接使用该名称，并进入标准创建 Project 流程。"
          >
            <FormTextInput
              value={flowTitle}
              onChangeText={onFlowTitleChange}
              placeholder="例如：支付链路优化"
              testID="development-flow-title"
            />
          </Field>
          <DevelopmentProjectSelector
            mode={projectMode}
            existingProjectId={flowProjectId}
            existingProjectDisplay={flowProjectDisplay}
            projectOptions={projectOptions}
            canCreateNewProject={canCreateNewProject}
            projectSelectionEnabled={Boolean(flowTitle.trim())}
            onModeChange={onProjectModeChange}
            onExistingProjectChange={onFlowProjectChange}
          />
          <PluginProjectDefaultAgentField
            active={active}
            serverId={serverId}
            cwd={defaultAgentCwd}
            value={defaultAgent}
            disabled={saving}
            onChange={onDefaultAgentChange}
          />
          <View style={styles.actions}>
            <Button
              variant="default"
              leftIcon={Plus}
              loading={saving}
              disabled={!canRenderForm || contextLoading}
              onPress={onCreateDraft}
            >
              创建开发任务
            </Button>
          </View>
        </>
      ) : null}
      {editContent}
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
