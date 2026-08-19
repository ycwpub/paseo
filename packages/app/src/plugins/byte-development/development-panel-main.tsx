import { Text, View } from "react-native";
import { Plus } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { PluginAppDefinition, PluginSummary } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import type { SelectFieldDisplay, SelectFieldOption } from "@/components/ui/select-field";
import { DevelopmentFlowDetail } from "./development-flow-detail";
import { DevelopmentFlowForm } from "./development-flow-form";
import type { DevelopmentPrdSourceValue } from "./development-prd-source-model";
import type { DevelopmentProjectMode } from "./development-project-selection-model";
import type { DevelopmentFlow, DevelopmentStageId } from "./flow-model";
import type { PluginProjectDefaultAgentValue } from "@/plugins/project/plugin-project-default-agent-field";

export function DevelopmentPanelMain({
  active,
  serverId,
  plugin,
  appDefinition,
  creating,
  editing,
  flowTitle,
  selectedFlow,
  projectName,
  projectMode,
  flowProjectId,
  flowProjectDisplay,
  projectOptions,
  canCreateNewProject,
  defaultAgent,
  defaultAgentCwd,
  fixedFormValues,
  editInitialValues,
  contextLoading,
  contextError,
  canRenderForm,
  saving,
  copying,
  deleting,
  canMutate,
  canCopy,
  onFlowTitleChange,
  onProjectModeChange,
  onFlowProjectChange,
  onDefaultAgentChange,
  onFormValuesChange,
  onCreateDraft,
  onSavePrd,
  onSaveStageKnowledge,
  onOpenStage,
  onCompleteStage,
  onReopenStage,
  onCopy,
  onSave,
  onCancel,
  onCreate,
  onOpenProject,
  onOpenProjectSettings,
  onEdit,
  onDelete,
}: {
  active: boolean;
  serverId: string;
  plugin: PluginSummary;
  appDefinition: PluginAppDefinition;
  creating: boolean;
  editing: boolean;
  flowTitle: string;
  selectedFlow: DevelopmentFlow | null;
  projectName: string;
  projectMode: DevelopmentProjectMode;
  flowProjectId: string | null;
  flowProjectDisplay: SelectFieldDisplay | null;
  projectOptions: SelectFieldOption<string>[];
  canCreateNewProject: boolean;
  defaultAgent: PluginProjectDefaultAgentValue;
  defaultAgentCwd: string | null;
  fixedFormValues: Record<string, unknown>;
  editInitialValues: Record<string, unknown>;
  contextLoading: boolean;
  contextError: string | null;
  canRenderForm: boolean;
  saving: boolean;
  copying: boolean;
  deleting: boolean;
  canMutate: boolean;
  canCopy: boolean;
  onFlowTitleChange: (title: string) => void;
  onProjectModeChange: (mode: DevelopmentProjectMode) => void;
  onFlowProjectChange: (projectId: string) => void;
  onDefaultAgentChange: (value: PluginProjectDefaultAgentValue) => void;
  onFormValuesChange: (form: Record<string, unknown>) => void;
  onCreateDraft: () => void;
  onSavePrd: (value: DevelopmentPrdSourceValue) => Promise<void>;
  onSaveStageKnowledge: (stageId: DevelopmentStageId, knowledge: string) => Promise<void>;
  onOpenStage: (
    stageId: DevelopmentStageId,
    knowledge: string,
    prdSource?: DevelopmentPrdSourceValue,
  ) => Promise<void>;
  onCompleteStage: (stageId: DevelopmentStageId, knowledge: string) => Promise<void>;
  onReopenStage: (stageId: DevelopmentStageId, knowledge: string) => Promise<void>;
  onCopy: () => void;
  onSave: () => void;
  onCancel: () => void;
  onCreate: () => void;
  onOpenProject: () => void;
  onOpenProjectSettings: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (creating || editing) {
    const mode = editing ? "edit" : "create";
    return (
      <DevelopmentFlowForm
        mode={mode}
        active={active}
        serverId={serverId}
        plugin={plugin}
        appDefinition={appDefinition}
        flowTitle={flowTitle}
        projectMode={projectMode}
        flowProjectId={flowProjectId}
        flowProjectDisplay={flowProjectDisplay}
        projectOptions={projectOptions}
        canCreateNewProject={canCreateNewProject}
        defaultAgent={defaultAgent}
        defaultAgentCwd={defaultAgentCwd}
        fixedFormValues={fixedFormValues}
        initialFormValues={editing ? editInitialValues : undefined}
        contextLoading={contextLoading}
        contextError={contextError}
        canRenderForm={canRenderForm}
        saving={saving}
        onFlowTitleChange={onFlowTitleChange}
        onProjectModeChange={onProjectModeChange}
        onFlowProjectChange={onFlowProjectChange}
        onDefaultAgentChange={onDefaultAgentChange}
        onFormValuesChange={editing ? onFormValuesChange : undefined}
        onCreateDraft={creating ? onCreateDraft : undefined}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
  }
  if (selectedFlow) {
    return (
      <DevelopmentFlowDetail
        flow={selectedFlow}
        projectName={projectName}
        serverId={serverId}
        plugin={plugin}
        canMutate={canMutate}
        canCopy={canCopy}
        copying={copying}
        deleting={deleting}
        onOpenProject={onOpenProject}
        onOpenProjectSettings={onOpenProjectSettings}
        onSavePrd={onSavePrd}
        onSaveStageKnowledge={onSaveStageKnowledge}
        onOpenStage={onOpenStage}
        onCompleteStage={onCompleteStage}
        onReopenStage={onReopenStage}
        onCopy={onCopy}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );
  }
  return (
    <View style={styles.emptyDetail}>
      <Text style={styles.emptyTitle}>选择或创建开发流程</Text>
      <Text style={styles.hint}>
        左侧用于管理研发流程，Project 会话仍承载日常沟通和 Agent 指令。
      </Text>
      <Button variant="default" leftIcon={Plus} onPress={onCreate}>
        创建开发流程
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  emptyDetail: {
    alignItems: "flex-start",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[8],
  },
  emptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
}));
