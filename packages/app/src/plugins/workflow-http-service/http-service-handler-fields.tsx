/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop -- Handler mode switches and the modal editor bind to the current handler draft. */
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Settings2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import type {
  Assistant,
  PaseoInstructionTemplate,
  PluginHttpHandler,
  Team,
} from "@getpaseo/protocol/messages";
import type { WorkflowScriptSummary, WorkflowStep } from "@getpaseo/protocol/workflow/types";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { WorkflowStepEditorFields } from "@/components/workflows/workflow-step-editor";
import {
  createWorkflowStep,
  getAvailableWorkflowStepTypes,
  type WorkflowStepType,
} from "@/workflows/editor-model";
import type { WorkflowRunTarget } from "@/workflows/run-targets";
import { HttpServiceWorkflowFields } from "./http-service-workflow-fields";

const HANDLER_MODE_OPTIONS: SelectFieldOption<PluginHttpHandler["mode"]>[] = [
  {
    id: "workflow",
    value: "workflow",
    label: "复用现有 Workflow",
    description: "选择一个已保存的 Workflow，可从入口或指定节点开始执行。",
  },
  {
    id: "custom_node",
    value: "custom_node",
    label: "自定义处理节点",
    description: "直接配置一个 Workflow 节点，由 HTTP 服务托管并执行。",
  },
];

const STEP_LABELS: Record<WorkflowStepType, string> = {
  bash: "Bash",
  python: "Python",
  agent: "Agent",
  switch: "Switch",
  for: "For 循环",
};

export interface HttpServiceHandlerEditorResources {
  providerEntries?: ProviderSnapshotEntry[];
  providersLoading?: boolean;
  assistants?: Assistant[];
  assistantsLoading?: boolean;
  teams?: Team[];
  teamsLoading?: boolean;
  promptTemplates?: PaseoInstructionTemplate[];
  promptTemplatesLoading?: boolean;
  allowPython?: boolean;
}

export const EMPTY_HTTP_SERVICE_HANDLER_RESOURCES: HttpServiceHandlerEditorResources = {};

export interface HttpServiceHandlerFieldsProps extends HttpServiceHandlerEditorResources {
  handler: PluginHttpHandler;
  workflows: WorkflowScriptSummary[];
  workflowsLoading: boolean;
  workflowsError: string | null;
  inspectWorkflowTargets: (workflowPath: string) => Promise<WorkflowRunTarget[]>;
  onChange: (handler: PluginHttpHandler) => void;
}

export function HttpServiceHandlerFields({
  handler,
  workflows,
  workflowsLoading,
  workflowsError,
  inspectWorkflowTargets,
  providerEntries = [],
  providersLoading = false,
  assistants = [],
  assistantsLoading = false,
  teams = [],
  teamsLoading = false,
  promptTemplates = [],
  promptTemplatesLoading = false,
  allowPython = true,
  onChange,
}: HttpServiceHandlerFieldsProps) {
  const [editorVisible, setEditorVisible] = useState(false);
  const stepOptions = useMemo<SelectFieldOption<WorkflowStepType>[]>(
    () =>
      getAvailableWorkflowStepTypes(allowPython).map((type) => ({
        id: type,
        value: type,
        label: STEP_LABELS[type],
        description: `使用 ${STEP_LABELS[type]} 节点处理该请求。`,
      })),
    [allowPython],
  );
  const handleModeChange = useCallback(
    (mode: PluginHttpHandler["mode"]) => {
      if (mode === handler.mode) return;
      if (mode === "workflow") {
        onChange({
          mode: "workflow",
          workflowPath: workflows[0]?.path ?? "",
        });
        return;
      }
      onChange({ mode: "custom_node", step: createWorkflowStep("bash", []) });
    },
    [handler.mode, onChange, workflows],
  );
  const handleStepTypeChange = useCallback(
    (type: WorkflowStepType) => {
      onChange({ mode: "custom_node", step: createWorkflowStep(type, []) });
    },
    [onChange],
  );
  const handleStepChange = useCallback(
    (step: WorkflowStep) => onChange({ mode: "custom_node", step }),
    [onChange],
  );
  const editorHeader = useMemo<SheetHeader>(
    () => ({
      title:
        handler.mode === "custom_node" ? handler.step.name || handler.step.id : "自定义处理节点",
      subtitle:
        handler.mode === "custom_node"
          ? `${STEP_LABELS[handler.step.type]} · HTTP 请求处理`
          : "HTTP 请求处理",
    }),
    [handler],
  );

  return (
    <View style={styles.container}>
      <SelectField
        label="处理方式"
        value={handler.mode}
        selectedDisplay={
          HANDLER_MODE_OPTIONS.find((option) => option.value === handler.mode) ?? null
        }
        options={HANDLER_MODE_OPTIONS}
        onChange={handleModeChange}
        placeholder="选择处理方式"
        emptyText="没有可用的处理方式"
        hint="每个请求 Path 可以复用已有 Workflow，也可以直接定义一个处理节点。"
      />
      {handler.mode === "workflow" ? (
        <HttpServiceWorkflowFields
          workflowPath={handler.workflowPath}
          targetNodeId={handler.targetNodeId}
          workflows={workflows}
          workflowsLoading={workflowsLoading}
          workflowsError={workflowsError}
          inspectWorkflowTargets={inspectWorkflowTargets}
          onWorkflowPathChange={(workflowPath) => onChange({ mode: "workflow", workflowPath })}
          onTargetNodeIdChange={(targetNodeId) => onChange({ ...handler, targetNodeId })}
        />
      ) : (
        <>
          <View style={styles.customHeader}>
            <View style={styles.typeField}>
              <SelectField
                label="节点类型"
                value={handler.step.type}
                selectedDisplay={{
                  label: STEP_LABELS[handler.step.type],
                  description: handler.step.name || handler.step.id,
                }}
                options={stepOptions}
                onChange={handleStepTypeChange}
                placeholder="选择节点类型"
                emptyText="没有可用的节点类型"
              />
            </View>
            <Button
              variant="outline"
              size="sm"
              leftIcon={Settings2}
              onPress={() => setEditorVisible(true)}
            >
              编辑处理节点
            </Button>
          </View>
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>{handler.step.name || handler.step.id}</Text>
            <Text style={styles.summaryText}>
              节点 ID：{handler.step.id} · 类型：{STEP_LABELS[handler.step.type]}
            </Text>
          </View>
          <AdaptiveModalSheet
            visible={editorVisible}
            header={editorHeader}
            onClose={() => setEditorVisible(false)}
            desktopMaxWidth={1200}
            snapPoints={["95%"]}
            testID={`http-handler-${handler.step.id}-details`}
          >
            <WorkflowStepEditorFields
              step={handler.step}
              depth={0}
              rootSteps={[handler.step]}
              siblingSteps={[handler.step]}
              providerEntries={providerEntries}
              providersLoading={providersLoading}
              assistants={assistants}
              assistantsLoading={assistantsLoading}
              teams={teams}
              teamsLoading={teamsLoading}
              promptTemplates={promptTemplates}
              promptTemplatesLoading={promptTemplatesLoading}
              allowPython={allowPython}
              onChange={handleStepChange}
            />
          </AdaptiveModalSheet>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[3],
  },
  customHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  typeField: {
    flex: 1,
    minWidth: 240,
  },
  summary: {
    gap: theme.spacing[1],
    padding: theme.spacing[3],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  summaryTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  summaryText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));
