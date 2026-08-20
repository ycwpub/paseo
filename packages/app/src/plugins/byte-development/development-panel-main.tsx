import { Text, View } from "react-native";
import { Plus } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  PluginAppDefinition,
  PluginHttpJob,
  PluginSummary,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import type { SelectFieldDisplay, SelectFieldOption } from "@/components/ui/select-field";
import { DevelopmentFlowDetail } from "./development-flow-detail";
import { DevelopmentFlowForm } from "./development-flow-form";
import type { DevelopmentProjectMode } from "./development-project-selection-model";
import type { DevelopmentFlow } from "./flow-model";
import type { DevelopmentPrdSourceValue } from "./development-prd-source-model";

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
  sourceProjectId,
  sourceProjectDisplay,
  projectOptions,
  sourceProjectOptions,
  canCreateNewProject,
  fixedFormValues,
  prdSource,
  editInitialValues,
  contextLoading,
  contextError,
  canRenderForm,
  saving,
  deleting,
  canMutate,
  onFlowTitleChange,
  onProjectModeChange,
  onFlowProjectChange,
  onSourceProjectChange,
  onFormValuesChange,
  onPrdSourceChange,
  onPrepareSubmission,
  onJobSubmitted,
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
  sourceProjectId: string | null;
  sourceProjectDisplay: SelectFieldDisplay | null;
  projectOptions: SelectFieldOption<string>[];
  sourceProjectOptions: SelectFieldOption<string>[];
  canCreateNewProject: boolean;
  fixedFormValues: Record<string, unknown>;
  prdSource: DevelopmentPrdSourceValue;
  editInitialValues: Record<string, unknown>;
  contextLoading: boolean;
  contextError: string | null;
  canRenderForm: boolean;
  saving: boolean;
  deleting: boolean;
  canMutate: boolean;
  onFlowTitleChange: (title: string) => void;
  onProjectModeChange: (mode: DevelopmentProjectMode) => void;
  onFlowProjectChange: (projectId: string) => void;
  onSourceProjectChange: (projectId: string) => void;
  onFormValuesChange: (form: Record<string, unknown>) => void;
  onPrdSourceChange: (value: DevelopmentPrdSourceValue) => void;
  onPrepareSubmission: (
    form: Record<string, unknown>,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  onJobSubmitted: (job: PluginHttpJob) => void;
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
        sourceProjectId={sourceProjectId}
        sourceProjectDisplay={sourceProjectDisplay}
        projectOptions={projectOptions}
        sourceProjectOptions={sourceProjectOptions}
        canCreateNewProject={canCreateNewProject}
        fixedFormValues={fixedFormValues}
        prdSource={prdSource}
        initialFormValues={editing ? editInitialValues : undefined}
        contextLoading={contextLoading}
        contextError={contextError}
        canRenderForm={canRenderForm}
        saving={saving}
        onFlowTitleChange={onFlowTitleChange}
        onProjectModeChange={onProjectModeChange}
        onFlowProjectChange={onFlowProjectChange}
        onSourceProjectChange={onSourceProjectChange}
        onFormValuesChange={editing ? onFormValuesChange : undefined}
        onPrdSourceChange={onPrdSourceChange}
        onPrepareSubmission={creating ? onPrepareSubmission : undefined}
        onJobSubmitted={creating ? onJobSubmitted : undefined}
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
        canMutate={canMutate}
        deleting={deleting}
        onOpenProject={onOpenProject}
        onOpenProjectSettings={onOpenProjectSettings}
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
