/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop -- Recursive workflow controls bind edits to their current node and branch values. */
import { memo, useCallback, useMemo, useState, type ReactElement } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Braces,
  CircleHelp,
  FileCode2,
  GitBranch,
  Plus,
  Repeat2,
  TerminalSquare,
  Trash2,
} from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  type WorkflowAgentConfig,
  type WorkflowAgentOutputType,
  type WorkflowAgentStep,
  type WorkflowBashStep,
  type WorkflowForStep,
  type WorkflowPythonStep,
  type WorkflowRetryPolicy,
  type WorkflowStep,
  type WorkflowSwitchStep,
} from "@getpaseo/protocol/workflow/types";
import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import type { Assistant, PaseoInstructionTemplate, Team } from "@getpaseo/protocol/messages";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form-field";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WorkflowExpandableTextInput } from "@/components/workflows/workflow-expandable-text-input";
import { WorkflowDownstreamField } from "@/components/workflows/workflow-downstream-field";
import { WorkflowPythonStepFields } from "@/components/workflows/workflow-python-step-fields";
import { WorkflowStepHelp } from "@/components/workflows/workflow-step-help";
import { WorkflowTextInput } from "@/components/workflows/workflow-text-input";
import { formatAgentModeLabel, formatThinkingOptionLabel } from "@/composer/agent-controls/utils";
import { resolveTeamAssistantIds, resolveTeamLeader } from "@/teams/team-members";
import {
  applyInstructionTemplateToAgentSystemPrompt,
  applyInstructionTemplateToAgentStep,
  createWorkflowStep,
  getAvailableWorkflowStepTypes,
  moveWorkflowStep,
  updateAgentOutputType,
  type WorkflowStepType,
} from "@/workflows/editor-model";
import {
  removeWorkflowSequenceStep,
  replaceWorkflowSequenceStep,
} from "@/workflows/sequence-links";

const STEP_META = {
  bash: {
    labelKey: "workflows.nodes.types.bash",
    icon: TerminalSquare,
  },
  python: {
    labelKey: "workflows.nodes.types.python",
    icon: FileCode2,
  },
  agent: {
    labelKey: "workflows.nodes.types.agent",
    icon: Bot,
  },
  switch: {
    labelKey: "workflows.nodes.types.switch",
    icon: GitBranch,
  },
  for: {
    labelKey: "workflows.nodes.types.for",
    icon: Repeat2,
  },
} as const satisfies Record<WorkflowStepType, { labelKey: string; icon: typeof TerminalSquare }>;

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalMultilineText(value: string): string | undefined {
  return value.trim().length > 0 ? value : undefined;
}

function optionalPositiveNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function optionalPositiveDecimal(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : undefined;
}

function optionalPositiveSecondsAsMilliseconds(value: string): number | undefined {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000) : undefined;
}

function optionalNonnegativeSecondsAsMilliseconds(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 1000) : undefined;
}

function formatMillisecondsAsSeconds(value: number | undefined): string {
  return value === undefined ? "" : String(value / 1000);
}

interface WorkflowStepListEditorProps {
  steps: WorkflowStep[];
  rootSteps: WorkflowStep[];
  onChange: (steps: WorkflowStep[]) => void;
  providerEntries?: ProviderSnapshotEntry[];
  providersLoading?: boolean;
  assistants?: Assistant[];
  assistantsLoading?: boolean;
  teams?: Team[];
  teamsLoading?: boolean;
  promptTemplates?: PaseoInstructionTemplate[];
  promptTemplatesLoading?: boolean;
  allowPython?: boolean;
  label?: string;
  description?: string;
  depth?: number;
  testID?: string;
}

export const WorkflowStepListEditor = memo(function WorkflowStepListEditor({
  steps,
  rootSteps,
  onChange,
  providerEntries = [],
  providersLoading = false,
  assistants = [],
  assistantsLoading = false,
  teams = [],
  teamsLoading = false,
  promptTemplates = [],
  promptTemplatesLoading = false,
  allowPython = true,
  label,
  description,
  depth = 0,
  testID,
}: WorkflowStepListEditorProps): ReactElement {
  const { t } = useTranslation();
  const [newStepIndex, setNewStepIndex] = useState<number | null>(null);
  const addStep = useCallback(
    (type: WorkflowStepType) => {
      const step = createWorkflowStep(type, rootSteps, {
        workflow: t("workflows.editor.untitled"),
        bash: t("workflows.nodes.defaultNames.bash"),
        python: t("workflows.nodes.defaultNames.python"),
        agent: t("workflows.nodes.defaultNames.agent"),
        switch: t("workflows.nodes.defaultNames.switch"),
        for: t("workflows.nodes.defaultNames.for"),
      });
      setNewStepIndex(steps.length);
      onChange([...steps, step]);
    },
    [onChange, rootSteps, steps, t],
  );

  return (
    <View style={styles.stepList} testID={testID}>
      {label ? (
        <View style={styles.branchHeading}>
          <Text style={styles.branchTitle}>{label}</Text>
          {description ? <Text style={styles.branchDescription}>{description}</Text> : null}
        </View>
      ) : null}
      {steps.length === 0 ? (
        <View style={styles.emptyBranch}>
          <Text style={styles.emptyBranchText}>{t("workflows.nodes.emptyBranch")}</Text>
        </View>
      ) : null}
      {steps.map((step, index) => (
        <WorkflowStepCard
          // The user-editable step ID cannot be the React key because changing it
          // would remount the focused input after every keystroke.
          // oxlint-disable-next-line react/no-array-index-key
          key={`${step.type}:${index}`}
          step={step}
          index={index}
          total={steps.length}
          depth={depth}
          rootSteps={rootSteps}
          siblingSteps={steps}
          initiallyOpen={newStepIndex === index}
          providerEntries={providerEntries}
          providersLoading={providersLoading}
          assistants={assistants}
          assistantsLoading={assistantsLoading}
          teams={teams}
          teamsLoading={teamsLoading}
          promptTemplates={promptTemplates}
          promptTemplatesLoading={promptTemplatesLoading}
          allowPython={allowPython}
          onChange={(nextStep) => onChange(replaceWorkflowSequenceStep(steps, index, nextStep))}
          onRemove={() => onChange(removeWorkflowSequenceStep(steps, index))}
          onMove={(direction) => onChange(moveWorkflowStep(steps, index, direction))}
          onDetailsClose={() => setNewStepIndex(null)}
        />
      ))}
      <AddNodeBar onAdd={addStep} compact={depth > 0} allowPython={allowPython} />
    </View>
  );
});

function AddNodeBar({
  onAdd,
  compact,
  allowPython,
}: {
  onAdd: (type: WorkflowStepType) => void;
  compact: boolean;
  allowPython: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.addNodeBar, compact && styles.addNodeBarCompact]}>
      <View style={styles.addNodeLabel}>
        <Plus size={14} color={styles.addNodeLabelIcon.color} />
        <Text style={styles.addNodeLabelText}>{t("workflows.nodes.add")}</Text>
      </View>
      <View style={styles.addNodeActions}>
        {getAvailableWorkflowStepTypes(allowPython).map((type) => {
          const meta = STEP_META[type];
          return (
            <Button
              key={type}
              variant="ghost"
              size="xs"
              leftIcon={meta.icon}
              onPress={() => onAdd(type)}
              testID={`workflow-add-${type}`}
            >
              {t(meta.labelKey)}
            </Button>
          );
        })}
      </View>
    </View>
  );
}

interface WorkflowStepCardProps {
  step: WorkflowStep;
  index: number;
  total: number;
  depth: number;
  rootSteps: WorkflowStep[];
  siblingSteps: WorkflowStep[];
  initiallyOpen: boolean;
  providerEntries: ProviderSnapshotEntry[];
  providersLoading: boolean;
  assistants: Assistant[];
  assistantsLoading: boolean;
  teams: Team[];
  teamsLoading: boolean;
  promptTemplates: PaseoInstructionTemplate[];
  promptTemplatesLoading: boolean;
  allowPython: boolean;
  onChange: (step: WorkflowStep) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onDetailsClose: () => void;
}

function WorkflowStepCard({
  step,
  index,
  total,
  depth,
  rootSteps,
  siblingSteps,
  initiallyOpen,
  providerEntries,
  providersLoading,
  assistants,
  assistantsLoading,
  teams,
  teamsLoading,
  promptTemplates,
  promptTemplatesLoading,
  allowPython,
  onChange,
  onRemove,
  onMove,
  onDetailsClose,
}: WorkflowStepCardProps): ReactElement {
  const { t } = useTranslation();
  const [detailsVisible, setDetailsVisible] = useState(initiallyOpen);
  const meta = STEP_META[step.type];
  const Icon = meta.icon;
  const openDetails = useCallback(() => setDetailsVisible(true), []);
  const closeDetails = useCallback(() => {
    setDetailsVisible(false);
    onDetailsClose();
  }, [onDetailsClose]);
  const detailsHeader = useMemo<SheetHeader>(
    () => ({
      title: step.name || step.id,
      subtitle: `${t(meta.labelKey)} · ${step.id}`,
    }),
    [meta.labelKey, step.id, step.name, t],
  );
  let stepFields: ReactElement;
  switch (step.type) {
    case "bash":
      stepFields = <BashStepFields step={step} onChange={onChange} />;
      break;
    case "python":
      stepFields = <PythonStepFields step={step} onChange={onChange} />;
      break;
    case "agent":
      stepFields = (
        <AgentStepFields
          step={step}
          providerEntries={providerEntries}
          providersLoading={providersLoading}
          assistants={assistants}
          assistantsLoading={assistantsLoading}
          teams={teams}
          teamsLoading={teamsLoading}
          promptTemplates={promptTemplates}
          promptTemplatesLoading={promptTemplatesLoading}
          onChange={onChange}
        />
      );
      break;
    case "switch":
      stepFields = (
        <SwitchStepFields
          step={step}
          rootSteps={rootSteps}
          providerEntries={providerEntries}
          providersLoading={providersLoading}
          assistants={assistants}
          assistantsLoading={assistantsLoading}
          teams={teams}
          teamsLoading={teamsLoading}
          promptTemplates={promptTemplates}
          promptTemplatesLoading={promptTemplatesLoading}
          allowPython={allowPython}
          depth={depth}
          onChange={onChange}
        />
      );
      break;
    case "for":
      stepFields = (
        <ForStepFields
          step={step}
          rootSteps={rootSteps}
          providerEntries={providerEntries}
          providersLoading={providersLoading}
          assistants={assistants}
          assistantsLoading={assistantsLoading}
          teams={teams}
          teamsLoading={teamsLoading}
          promptTemplates={promptTemplates}
          promptTemplatesLoading={promptTemplatesLoading}
          allowPython={allowPython}
          depth={depth}
          onChange={onChange}
        />
      );
      break;
  }

  return (
    <>
      <View style={[styles.stepCard, depth > 0 && styles.stepCardNested]}>
        <View style={styles.stepHeader}>
          <Pressable
            onPress={openDetails}
            style={({ hovered, pressed }) => [
              styles.stepHeaderMain,
              hovered && styles.stepHeaderMainHovered,
              pressed && styles.stepHeaderMainPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("workflows.nodes.openDetails", {
              name: step.name || step.id,
            })}
            testID={`workflow-step-${step.id}-open`}
          >
            <View style={styles.stepTypeIcon}>
              <Icon size={16} color={styles.stepTypeIconColor.color} />
            </View>
            <View style={styles.stepHeaderText}>
              <View style={styles.stepTitleRow}>
                <Text style={styles.stepType}>{t(meta.labelKey)}</Text>
                <Text style={styles.stepSummary} numberOfLines={2}>
                  {step.name || step.id}
                </Text>
              </View>
              <Text style={styles.stepId} numberOfLines={1}>
                {step.id}
              </Text>
            </View>
          </Pressable>
          <View style={styles.stepHeaderActions}>
            <WorkflowStepHelp step={step} typeLabel={t(meta.labelKey)} />
            <IconButton
              label={t("workflows.nodes.moveUp")}
              icon={ArrowUp}
              disabled={index === 0}
              onPress={() => onMove(-1)}
            />
            <IconButton
              label={t("workflows.nodes.moveDown")}
              icon={ArrowDown}
              disabled={index === total - 1}
              onPress={() => onMove(1)}
            />
            <IconButton
              label={t("workflows.nodes.delete")}
              icon={Trash2}
              destructive
              onPress={onRemove}
            />
          </View>
        </View>
      </View>

      <AdaptiveModalSheet
        visible={detailsVisible}
        header={detailsHeader}
        onClose={closeDetails}
        desktopMaxWidth={1080}
        snapPoints={["90%", "95%"]}
        testID={`workflow-step-${step.id}-details`}
      >
        <View style={styles.stepFields}>
          <View style={styles.threeColumn}>
            <View style={styles.columnField}>
              <Field label={t("workflows.nodes.id")}>
                <WorkflowTextInput
                  value={step.id}
                  onChangeText={(id) => onChange({ ...step, id })}
                  autoCapitalize="none"
                  size="sm"
                  testID={`workflow-step-${step.id}-id`}
                />
              </Field>
            </View>
            <View style={styles.columnField}>
              <Field label={t("workflows.nodes.displayName")}>
                <WorkflowTextInput
                  value={step.name ?? ""}
                  onChangeText={(name) => onChange({ ...step, name: optionalText(name) })}
                  size="sm"
                />
              </Field>
            </View>
            <View style={styles.columnField}>
              <WorkflowDownstreamField
                step={step}
                siblingSteps={siblingSteps}
                onChange={onChange}
              />
            </View>
          </View>
          {stepFields}
        </View>
      </AdaptiveModalSheet>
    </>
  );
}

function BashStepFields({
  step,
  onChange,
}: {
  step: WorkflowBashStep;
  onChange: (step: WorkflowBashStep) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t("workflows.nodes.bash.initialCommand")}>
        <WorkflowExpandableTextInput
          value={step.initialCommand}
          onChangeText={(initialCommand) => onChange({ ...step, initialCommand })}
          editorTitle={t("workflows.nodes.bash.initialCommand")}
          monospace
          multiline
          textAlignVertical="top"
          style={styles.codeInput}
          autoCapitalize="none"
          autoCorrect={false}
          testID={`workflow-bash-${step.id}-command`}
        />
      </Field>
      <WorkflowVariablesEditor
        kind="bash"
        variables={step.variables ?? {}}
        onChange={(variables) =>
          onChange({
            ...step,
            variables: Object.keys(variables).length > 0 ? variables : undefined,
          })
        }
      />
      <View style={styles.threeColumn}>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.common.workingDirectory")}>
            <WorkflowTextInput
              value={step.cwd ?? ""}
              onChangeText={(cwd) => onChange({ ...step, cwd: optionalText(cwd) })}
              placeholder={t("workflows.nodes.common.inputFileDirectory")}
              size="sm"
              autoCapitalize="none"
            />
          </Field>
        </View>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.bash.shell")}>
            <WorkflowTextInput
              value={step.shell ?? ""}
              onChangeText={(shell) => onChange({ ...step, shell: optionalText(shell) })}
              placeholder="/bin/bash"
              size="sm"
              autoCapitalize="none"
            />
          </Field>
        </View>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.common.timeout")}>
            <WorkflowTextInput
              value={formatMillisecondsAsSeconds(step.timeoutMs)}
              onChangeText={(value) =>
                onChange({
                  ...step,
                  timeoutMs: optionalPositiveSecondsAsMilliseconds(value),
                })
              }
              placeholder="1800"
              keyboardType="decimal-pad"
              size="sm"
            />
          </Field>
        </View>
      </View>
      <RetryPolicyFields retry={step.retry} onChange={(retry) => onChange({ ...step, retry })} />
    </>
  );
}

function PythonStepFields({
  step,
  onChange,
}: {
  step: WorkflowPythonStep;
  onChange: (step: WorkflowPythonStep) => void;
}) {
  return (
    <>
      <WorkflowPythonStepFields step={step} onChange={onChange} />
      <WorkflowVariablesEditor
        kind="python"
        variables={step.variables ?? {}}
        onChange={(variables) =>
          onChange({
            ...step,
            variables: Object.keys(variables).length > 0 ? variables : undefined,
          })
        }
      />
      <RetryPolicyFields retry={step.retry} onChange={(retry) => onChange({ ...step, retry })} />
    </>
  );
}

function updateAgentConfig(
  step: WorkflowAgentStep,
  patch: Partial<WorkflowAgentConfig>,
): WorkflowAgentStep {
  return { ...step, config: { ...step.config, ...patch } };
}

function optionDisplay(option: SelectFieldOption<string> | undefined): SelectFieldDisplay | null {
  return option ? { label: option.label, description: option.description } : null;
}

function includeCurrentStringOption(
  options: SelectFieldOption<string>[],
  currentValue: string | undefined,
): SelectFieldOption<string>[] {
  if (!currentValue || options.some((option) => option.value === currentValue)) {
    return options;
  }
  return [
    ...options,
    {
      id: `current:${currentValue}`,
      value: currentValue,
      label: currentValue,
      description: currentValue,
    },
  ];
}

function resolveAssistantOrTeamValue(config: WorkflowAgentStep["config"]): string {
  if (config.teamId) {
    return `team:${config.teamId}`;
  }
  if (config.assistantId) {
    return `assistant:${config.assistantId}`;
  }
  return "";
}

function AgentPromptTemplateField({
  stepId,
  target,
  promptTemplates,
  loading,
  onSelect,
}: {
  stepId: string;
  target: "user" | "system";
  promptTemplates: PaseoInstructionTemplate[];
  loading: boolean;
  onSelect: (template: PaseoInstructionTemplate) => void;
}) {
  const { t } = useTranslation();
  const options = useMemo<SelectFieldOption<string>[]>(
    () =>
      promptTemplates.map((template) => ({
        id: template.id,
        value: template.id,
        label: template.name,
        description: template.description || template.id,
      })),
    [promptTemplates],
  );
  return (
    <Field
      label={t(
        target === "user"
          ? "workflows.nodes.agent.promptTemplate"
          : "workflows.nodes.agent.systemPromptTemplate",
      )}
      hint={t("workflows.nodes.agent.promptTemplateHint")}
    >
      <SelectField
        field={false}
        label=""
        value=""
        selectedDisplay={null}
        options={options}
        onChange={(templateId) => {
          const template = promptTemplates.find((candidate) => candidate.id === templateId);
          if (template) {
            onSelect(template);
          }
        }}
        placeholder={t(
          target === "user"
            ? "workflows.nodes.agent.selectPromptTemplate"
            : "workflows.nodes.agent.selectSystemPromptTemplate",
        )}
        emptyText={t("workflows.nodes.agent.noPromptTemplates")}
        title={t(
          target === "user"
            ? "workflows.nodes.agent.promptTemplate"
            : "workflows.nodes.agent.systemPromptTemplate",
        )}
        loading={loading}
        searchable
        size="sm"
        testID={`workflow-agent-${stepId}-${target}-prompt-template`}
      />
    </Field>
  );
}

function AgentSystemPromptField({
  step,
  promptTemplates,
  loading,
  onChange,
}: {
  step: WorkflowAgentStep;
  promptTemplates: PaseoInstructionTemplate[];
  loading: boolean;
  onChange: (step: WorkflowAgentStep) => void;
}) {
  const { t } = useTranslation();
  const hint = step.config.systemPrompt?.trim()
    ? t("workflows.nodes.agent.systemPromptConfiguredHint")
    : t("workflows.nodes.agent.systemPromptHint");
  return (
    <>
      <AgentPromptTemplateField
        stepId={step.id}
        target="system"
        promptTemplates={promptTemplates}
        loading={loading}
        onSelect={(template) =>
          onChange(applyInstructionTemplateToAgentSystemPrompt(step, template))
        }
      />
      <Field label={t("workflows.nodes.agent.systemPrompt")} hint={hint}>
        <WorkflowExpandableTextInput
          value={step.config.systemPrompt ?? ""}
          onChangeText={(systemPrompt) =>
            onChange(
              updateAgentConfig(step, {
                systemPrompt: optionalMultilineText(systemPrompt),
              }),
            )
          }
          editorTitle={t("workflows.nodes.agent.systemPrompt")}
          multiline
          textAlignVertical="top"
          style={styles.systemPromptInput}
          placeholder={t("workflows.nodes.agent.systemPromptPlaceholder")}
          testID={`workflow-agent-${step.id}-system-prompt`}
        />
      </Field>
    </>
  );
}

function AgentStepFields({
  step,
  providerEntries,
  providersLoading,
  assistants,
  assistantsLoading,
  teams,
  teamsLoading,
  promptTemplates,
  promptTemplatesLoading,
  onChange,
}: {
  step: WorkflowAgentStep;
  providerEntries: ProviderSnapshotEntry[];
  providersLoading: boolean;
  assistants: Assistant[];
  assistantsLoading: boolean;
  teams: Team[];
  teamsLoading: boolean;
  promptTemplates: PaseoInstructionTemplate[];
  promptTemplatesLoading: boolean;
  onChange: (step: WorkflowAgentStep) => void;
}) {
  const { t } = useTranslation();
  const isolation = step.config.isolation ?? "local";
  const selectedProviderEntry = useMemo(
    () => providerEntries.find((entry) => entry.provider === step.config.provider) ?? null,
    [providerEntries, step.config.provider],
  );
  const providerOptions = useMemo(
    () =>
      includeCurrentStringOption(
        providerEntries
          .filter((entry) => entry.enabled !== false || entry.provider === step.config.provider)
          .map((entry) => ({
            id: entry.provider,
            value: entry.provider,
            label: entry.label ?? entry.provider,
            description: entry.description ?? entry.provider,
          })),
        step.config.provider,
      ),
    [providerEntries, step.config.provider],
  );
  const modelOptions = useMemo(
    () =>
      includeCurrentStringOption(
        [
          {
            id: "provider-default-model",
            value: "",
            label: t("workflows.nodes.common.providerDefault"),
          },
          ...(selectedProviderEntry?.models ?? []).map((model) => ({
            id: model.id,
            value: model.id,
            label: model.label,
            description: model.description ?? model.id,
          })),
        ],
        step.config.model,
      ),
    [selectedProviderEntry?.models, step.config.model, t],
  );
  const modeOptions = useMemo(
    () =>
      includeCurrentStringOption(
        [
          {
            id: "provider-default-mode",
            value: "",
            label: t("workflows.nodes.common.providerDefault"),
          },
          ...(selectedProviderEntry?.modes ?? []).map((mode) => ({
            id: mode.id,
            value: mode.id,
            label: formatAgentModeLabel(mode),
            description: mode.description ?? mode.id,
          })),
        ],
        step.config.modeId,
      ),
    [selectedProviderEntry?.modes, step.config.modeId, t],
  );
  const selectedModel = useMemo(
    () =>
      selectedProviderEntry?.models?.find((model) => model.id === step.config.model) ??
      selectedProviderEntry?.models?.find((model) => model.isDefault) ??
      selectedProviderEntry?.models?.[0] ??
      null,
    [selectedProviderEntry?.models, step.config.model],
  );
  const thinkingOptions = useMemo(
    () =>
      includeCurrentStringOption(
        [
          {
            id: "provider-default-thinking",
            value: "",
            label: t("workflows.nodes.common.providerDefault"),
          },
          ...(selectedModel?.thinkingOptions ?? []).map((option) => ({
            id: option.id,
            value: option.id,
            label: formatThinkingOptionLabel(option),
            description: option.description ?? option.id,
          })),
        ],
        step.config.thinkingOptionId,
      ),
    [selectedModel?.thinkingOptions, step.config.thinkingOptionId, t],
  );
  const approvalOptions = useMemo(
    () =>
      includeCurrentStringOption(
        [
          {
            id: "provider-default-approval",
            value: "",
            label: t("workflows.nodes.common.providerDefault"),
          },
          {
            id: "on-request",
            value: "on-request",
            label: t("workflows.nodes.agent.approvalOptions.onRequest"),
          },
          {
            id: "never",
            value: "never",
            label: t("workflows.nodes.agent.approvalOptions.never"),
          },
          {
            id: "untrusted",
            value: "untrusted",
            label: t("workflows.nodes.agent.approvalOptions.untrusted"),
          },
          {
            id: "on-failure",
            value: "on-failure",
            label: t("workflows.nodes.agent.approvalOptions.onFailure"),
          },
        ],
        step.config.approvalPolicy,
      ),
    [step.config.approvalPolicy, t],
  );
  const sandboxOptions = useMemo(
    () =>
      includeCurrentStringOption(
        [
          {
            id: "provider-default-sandbox",
            value: "",
            label: t("workflows.nodes.common.providerDefault"),
          },
          {
            id: "read-only",
            value: "read-only",
            label: t("workflows.nodes.agent.sandboxOptions.readOnly"),
          },
          {
            id: "workspace-write",
            value: "workspace-write",
            label: t("workflows.nodes.agent.sandboxOptions.workspaceWrite"),
          },
          {
            id: "danger-full-access",
            value: "danger-full-access",
            label: t("workflows.nodes.agent.sandboxOptions.fullAccess"),
          },
        ],
        step.config.sandboxMode,
      ),
    [step.config.sandboxMode, t],
  );
  const assistantOrTeamValue = resolveAssistantOrTeamValue(step.config);
  const assistantOrTeamOptions = useMemo(
    () =>
      includeCurrentStringOption(
        [
          {
            id: "no-assistant-or-team",
            value: "",
            label: t("workflows.nodes.common.optional"),
          },
          ...assistants.map((assistant) => ({
            id: `assistant:${assistant.id}`,
            value: `assistant:${assistant.id}`,
            label: assistant.name || assistant.id,
            description: assistant.description || assistant.id,
          })),
          ...teams.flatMap((team) => {
            const leader = resolveTeamLeader(team, assistants);
            if (!leader) {
              return [];
            }
            return [
              {
                id: `team:${team.id}`,
                value: `team:${team.id}`,
                label: team.name,
                description: t("workflows.nodes.agent.teamOptionDescription", {
                  leader: leader.name || leader.id,
                  count: resolveTeamAssistantIds(team).length,
                }),
              },
            ];
          }),
        ],
        assistantOrTeamValue,
      ),
    [assistantOrTeamValue, assistants, t, teams],
  );
  const isolationOptions = useMemo<SelectFieldOption<"local" | "worktree">[]>(
    () => [
      {
        id: "local",
        value: "local",
        label: t("workflows.nodes.agent.localDirectory"),
      },
      {
        id: "worktree",
        value: "worktree",
        label: t("workflows.nodes.agent.isolatedWorktree"),
      },
    ],
    [t],
  );
  const selectedIsolation = isolationOptions.find((option) => option.value === isolation);
  const outputType = step.outputType ?? "answer";
  const outputTypeOptions = useMemo<SelectFieldOption<WorkflowAgentOutputType>[]>(
    () => [
      {
        id: "answer",
        value: "answer",
        label: t("workflows.nodes.agent.outputTypes.answer"),
        description: t("workflows.nodes.agent.outputTypes.answerDescription"),
      },
      {
        id: "control",
        value: "control",
        label: t("workflows.nodes.agent.outputTypes.control"),
        description: t("workflows.nodes.agent.outputTypes.controlDescription"),
      },
    ],
    [t],
  );
  return (
    <>
      <Field
        label={t("workflows.nodes.agent.outputType")}
        hint={t("workflows.nodes.agent.outputTypeHint")}
      >
        <SelectField
          field={false}
          label=""
          value={outputType}
          selectedDisplay={optionDisplay(
            outputTypeOptions.find((option) => option.value === outputType),
          )}
          options={outputTypeOptions}
          onChange={(nextOutputType) => onChange(updateAgentOutputType(step, nextOutputType))}
          placeholder={t("workflows.nodes.agent.selectOutputType")}
          emptyText={t("workflows.nodes.agent.noOutputTypes")}
          title={t("workflows.nodes.agent.outputType")}
          size="sm"
          testID={`workflow-agent-${step.id}-output-type`}
        />
      </Field>
      <AgentPromptTemplateField
        stepId={step.id}
        target="user"
        promptTemplates={promptTemplates}
        loading={promptTemplatesLoading}
        onSelect={(template) => onChange(applyInstructionTemplateToAgentStep(step, template))}
      />
      <Field label={t("workflows.nodes.agent.initialPrompt")}>
        <WorkflowExpandableTextInput
          value={step.initialPrompt}
          onChangeText={(initialPrompt) => onChange({ ...step, initialPrompt })}
          editorTitle={t("workflows.nodes.agent.initialPrompt")}
          multiline
          textAlignVertical="top"
          style={styles.promptInput}
          testID={`workflow-agent-${step.id}-initial-prompt`}
        />
      </Field>
      <WorkflowVariablesEditor
        kind="agent"
        variables={step.promptVariables ?? {}}
        onChange={(promptVariables) =>
          onChange({
            ...step,
            promptVariables: Object.keys(promptVariables).length > 0 ? promptVariables : undefined,
          })
        }
      />
      <View style={styles.policySection}>
        <Text style={styles.sectionTitle}>{t("workflows.nodes.agent.executionPolicy")}</Text>
        <View style={styles.policyField}>
          <Field
            label={t("workflows.nodes.common.timeout")}
            hint={t("workflows.nodes.agent.timeoutHint")}
          >
            <WorkflowTextInput
              value={formatMillisecondsAsSeconds(step.timeoutMs)}
              onChangeText={(value) =>
                onChange({
                  ...step,
                  timeoutMs: optionalPositiveSecondsAsMilliseconds(value),
                })
              }
              placeholder="1800"
              keyboardType="decimal-pad"
              size="sm"
            />
          </Field>
        </View>
      </View>
      <RetryPolicyFields retry={step.retry} onChange={(retry) => onChange({ ...step, retry })} />
      <View style={styles.threeColumn}>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.agent.provider")}>
            <SelectField
              field={false}
              label=""
              value={step.config.provider}
              selectedDisplay={optionDisplay(
                providerOptions.find((option) => option.value === step.config.provider),
              )}
              options={providerOptions}
              onChange={(provider) =>
                onChange(
                  updateAgentConfig(step, {
                    provider,
                    model: undefined,
                    modeId: undefined,
                    thinkingOptionId: undefined,
                  }),
                )
              }
              placeholder={t("workflows.nodes.agent.selectProvider")}
              emptyText={t("workflows.nodes.agent.noProviders")}
              title={t("workflows.nodes.agent.provider")}
              loading={providersLoading}
              searchable
              size="sm"
              testID={`workflow-agent-${step.id}-provider`}
            />
          </Field>
        </View>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.agent.model")}>
            <SelectField
              field={false}
              label=""
              value={step.config.model ?? ""}
              selectedDisplay={optionDisplay(
                modelOptions.find((option) => option.value === (step.config.model ?? "")),
              )}
              options={modelOptions}
              onChange={(model) =>
                onChange(
                  updateAgentConfig(step, {
                    model: optionalText(model),
                    thinkingOptionId: undefined,
                  }),
                )
              }
              placeholder={t("workflows.nodes.agent.selectModel")}
              emptyText={t("workflows.nodes.agent.noModels")}
              title={t("workflows.nodes.agent.model")}
              loading={providersLoading}
              searchable
              size="sm"
              disabled={!step.config.provider}
              testID={`workflow-agent-${step.id}-model`}
            />
          </Field>
        </View>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.agent.mode")}>
            <SelectField
              field={false}
              label=""
              value={step.config.modeId ?? ""}
              selectedDisplay={optionDisplay(
                modeOptions.find((option) => option.value === (step.config.modeId ?? "")),
              )}
              options={modeOptions}
              onChange={(modeId) =>
                onChange(updateAgentConfig(step, { modeId: optionalText(modeId) }))
              }
              placeholder={t("workflows.nodes.agent.selectMode")}
              emptyText={t("workflows.nodes.agent.noModes")}
              title={t("workflows.nodes.agent.mode")}
              loading={providersLoading}
              size="sm"
              disabled={!step.config.provider}
              testID={`workflow-agent-${step.id}-mode`}
            />
          </Field>
        </View>
      </View>
      <View style={styles.threeColumn}>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.common.workingDirectory")}>
            <WorkflowTextInput
              value={step.config.cwd ?? ""}
              onChangeText={(cwd) => onChange(updateAgentConfig(step, { cwd: optionalText(cwd) }))}
              placeholder={t("workflows.nodes.common.inputFileDirectory")}
              size="sm"
              autoCapitalize="none"
            />
          </Field>
        </View>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.agent.thinking")}>
            <SelectField
              field={false}
              label=""
              value={step.config.thinkingOptionId ?? ""}
              selectedDisplay={optionDisplay(
                thinkingOptions.find(
                  (option) => option.value === (step.config.thinkingOptionId ?? ""),
                ),
              )}
              options={thinkingOptions}
              onChange={(thinkingOptionId) =>
                onChange(
                  updateAgentConfig(step, {
                    thinkingOptionId: optionalText(thinkingOptionId),
                  }),
                )
              }
              placeholder={t("workflows.nodes.agent.selectThinking")}
              emptyText={t("workflows.nodes.agent.noThinking")}
              title={t("workflows.nodes.agent.thinking")}
              loading={providersLoading}
              size="sm"
              disabled={!step.config.provider}
              testID={`workflow-agent-${step.id}-thinking`}
            />
          </Field>
        </View>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.agent.isolation")}>
            <SelectField
              field={false}
              label=""
              value={isolation}
              selectedDisplay={selectedIsolation ? { label: selectedIsolation.label } : null}
              options={isolationOptions}
              onChange={(next) => onChange(updateAgentConfig(step, { isolation: next }))}
              placeholder={t("workflows.nodes.agent.isolationSelect")}
              emptyText={t("workflows.nodes.agent.isolationEmpty")}
              title={t("workflows.nodes.agent.isolationTitle")}
              size="sm"
            />
          </Field>
        </View>
      </View>
      <View style={styles.threeColumn}>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.agent.approvalPolicy")}>
            <SelectField
              field={false}
              label=""
              value={step.config.approvalPolicy ?? ""}
              selectedDisplay={optionDisplay(
                approvalOptions.find(
                  (option) => option.value === (step.config.approvalPolicy ?? ""),
                ),
              )}
              options={approvalOptions}
              onChange={(approvalPolicy) =>
                onChange(
                  updateAgentConfig(step, {
                    approvalPolicy: optionalText(approvalPolicy),
                  }),
                )
              }
              placeholder={t("workflows.nodes.agent.selectApprovalPolicy")}
              emptyText={t("workflows.nodes.agent.noApprovalPolicies")}
              title={t("workflows.nodes.agent.approvalPolicy")}
              size="sm"
              testID={`workflow-agent-${step.id}-approval`}
            />
          </Field>
        </View>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.agent.sandboxMode")}>
            <SelectField
              field={false}
              label=""
              value={step.config.sandboxMode ?? ""}
              selectedDisplay={optionDisplay(
                sandboxOptions.find((option) => option.value === (step.config.sandboxMode ?? "")),
              )}
              options={sandboxOptions}
              onChange={(sandboxMode) =>
                onChange(
                  updateAgentConfig(step, {
                    sandboxMode: optionalText(sandboxMode) as
                      | "read-only"
                      | "workspace-write"
                      | "danger-full-access"
                      | undefined,
                  }),
                )
              }
              placeholder={t("workflows.nodes.agent.selectSandboxMode")}
              emptyText={t("workflows.nodes.agent.noSandboxModes")}
              title={t("workflows.nodes.agent.sandboxMode")}
              size="sm"
              testID={`workflow-agent-${step.id}-sandbox`}
            />
          </Field>
        </View>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.agent.assistantOrTeam")}>
            <SelectField
              field={false}
              label=""
              value={assistantOrTeamValue}
              selectedDisplay={optionDisplay(
                assistantOrTeamOptions.find((option) => option.value === assistantOrTeamValue),
              )}
              options={assistantOrTeamOptions}
              onChange={(value) => {
                if (value.startsWith("team:")) {
                  const teamId = value.slice("team:".length);
                  const team = teams.find((candidate) => candidate.id === teamId);
                  onChange(
                    updateAgentConfig(step, {
                      teamId: optionalText(teamId),
                      assistantId: team?.leaderAssistantId,
                    }),
                  );
                  return;
                }
                onChange(
                  updateAgentConfig(step, {
                    teamId: undefined,
                    assistantId: optionalText(
                      value.startsWith("assistant:") ? value.slice("assistant:".length) : value,
                    ),
                  }),
                );
              }}
              placeholder={t("workflows.nodes.agent.selectAssistantOrTeam")}
              emptyText={t("workflows.nodes.agent.noAssistantsOrTeams")}
              title={t("workflows.nodes.agent.assistantOrTeam")}
              loading={assistantsLoading || teamsLoading}
              searchable
              size="sm"
              testID={`workflow-agent-${step.id}-assistant-or-team`}
            />
          </Field>
        </View>
      </View>
      {outputType === "control" ? (
        <AgentSystemPromptField
          step={step}
          promptTemplates={promptTemplates}
          loading={promptTemplatesLoading}
          onChange={onChange}
        />
      ) : null}
      <View style={styles.toggleRow}>
        <ToggleField
          label={t("workflows.nodes.agent.archive")}
          value={step.config.archiveOnFinish ?? true}
          onChange={(archiveOnFinish) => onChange(updateAgentConfig(step, { archiveOnFinish }))}
        />
        <ToggleField
          label={t("workflows.nodes.agent.network")}
          value={step.config.networkAccess ?? false}
          onChange={(networkAccess) => onChange(updateAgentConfig(step, { networkAccess }))}
        />
        <ToggleField
          label={t("workflows.nodes.agent.webSearch")}
          value={step.config.webSearch ?? false}
          onChange={(webSearch) => onChange(updateAgentConfig(step, { webSearch }))}
        />
      </View>
    </>
  );
}

type WorkflowVariableKind = "bash" | "python" | "agent";

const WORKFLOW_VARIABLE_COPY = {
  bash: {
    instructionHint: "workflows.nodes.bash.initialCommandHint",
    description: "workflows.nodes.variables.bashDescription",
    usageExample: "workflows.nodes.variables.bashUsageExample",
    title: "workflows.nodes.variables.bashTitle",
  },
  python: {
    instructionHint: "workflows.nodes.python.codeHint",
    description: "workflows.nodes.variables.pythonDescription",
    usageExample: "workflows.nodes.variables.pythonUsageExample",
    title: "workflows.nodes.variables.pythonTitle",
  },
  agent: {
    instructionHint: "workflows.nodes.agent.initialPromptHint",
    description: "workflows.nodes.variables.agentDescription",
    usageExample: "workflows.nodes.variables.agentUsageExample",
    title: "workflows.nodes.variables.agentTitle",
  },
} as const;

function WorkflowVariableHelp({ kind }: { kind: WorkflowVariableKind }) {
  const { t } = useTranslation();
  const copy = WORKFLOW_VARIABLE_COPY[kind];
  let usage: string;
  if (kind === "bash") {
    usage = `input="$(cat)"\necho '{{customer.name}}' '{{items.0.id}}' '{{control}}'\nprintf '{"control":"done"}\\n' >&3`;
  } else if (kind === "python") {
    usage = `customer = "{{customer.name}}"\nitem_id = "{{items.0.id}}"\nwith os.fdopen(3, "w") as result:\n    json.dump({"control": "done"}, result)`;
  } else {
    usage = `Review {{customer.name}} for item {{items.0.id}}. Current route: {{control}}.`;
  }
  const examples = [
    {
      template: "{{customer.name}}",
      result: "Alice",
      description: t("workflows.nodes.variables.nestedObjectExample"),
    },
    {
      template: "{{items.0.id}}",
      result: "7",
      description: t("workflows.nodes.variables.arrayExample"),
    },
    {
      template: "{{control}}",
      result: "review",
      description: t("workflows.nodes.variables.controlExample"),
    },
    {
      template: "{{payload}}",
      result: '{"control":"review",...}',
      description: t("workflows.nodes.variables.payloadExample"),
    },
    {
      template: "{{role}}",
      result: "reviewer",
      description: t("workflows.nodes.variables.customExample"),
    },
  ];
  return (
    <Tooltip
      delayDuration={0}
      enabledOnDesktop
      enabledOnMobile
      openOnHover={false}
      openOnPress
      dismissOnTriggerPressOnly
    >
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("workflows.nodes.variables.showHelp")}
          hitSlop={8}
          style={styles.variableHelpButton}
          testID={`workflow-${kind}-variable-help`}
        >
          <CircleHelp size={16} color={styles.variableHelpIcon.color} />
        </Pressable>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="end"
        offset={8}
        maxWidth={680}
        style={styles.variableHelpPopover}
        testID={`workflow-${kind}-variable-help-content`}
      >
        <View style={styles.variableExamples}>
          <Text style={styles.variableExamplesTitle}>
            {t("workflows.nodes.variables.examplesTitle")}
          </Text>
          <Text style={styles.variableExamplesDescription}>{t(copy.instructionHint)}</Text>
          <Text style={styles.variableExamplesDescription}>{t(copy.description)}</Text>
          <Text style={styles.variableExamplesDescription}>
            {t("workflows.nodes.variables.inputExample")}
          </Text>
          <Text style={styles.variableExampleCode} selectable>
            {'{"customer":{"name":"Alice"},"items":[{"id":7}],"control":"review"}'}
          </Text>
          <View style={styles.variableExampleRows}>
            {examples.map((example) => (
              <View key={example.template} style={styles.variableExampleRow}>
                <Text style={styles.variableExampleTemplate} selectable>
                  {example.template}
                </Text>
                <Text style={styles.variableExampleArrow}>→</Text>
                <Text style={styles.variableExampleResult} selectable>
                  {example.result}
                </Text>
                <Text style={styles.variableExampleDescription}>{example.description}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.variableExamplesDescription}>{t(copy.usageExample)}</Text>
          <Text style={styles.variableExampleCode} selectable>
            {usage}
          </Text>
        </View>
      </TooltipContent>
    </Tooltip>
  );
}

function WorkflowVariablesEditor({
  kind,
  variables,
  onChange,
}: {
  kind: WorkflowVariableKind;
  variables: Record<string, string>;
  onChange: (variables: Record<string, string>) => void;
}) {
  const { t } = useTranslation();
  const entries = Object.entries(variables);
  const title = t(WORKFLOW_VARIABLE_COPY[kind].title);
  return (
    <View style={styles.variablesSection}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.variableHeaderActions}>
          <WorkflowVariableHelp kind={kind} />
          <Button
            variant="ghost"
            size="xs"
            leftIcon={Plus}
            onPress={() => {
              let index = entries.length + 1;
              let key = `variable${index}`;
              while (key in variables) {
                index += 1;
                key = `variable${index}`;
              }
              onChange({ ...variables, [key]: "" });
            }}
          >
            {t("workflows.nodes.variables.add")}
          </Button>
        </View>
      </View>
      {entries.map(([name, value], index) => (
        // Variable names are editable, so using the name as the key would drop
        // focus whenever the user renames one.
        // oxlint-disable-next-line react/no-array-index-key
        <View key={`variable-${index}`} style={styles.variableRow}>
          <WorkflowTextInput
            value={name}
            onChangeText={(nextName) => {
              const nextEntries = [...entries];
              nextEntries[index] = [nextName, value];
              onChange(Object.fromEntries(nextEntries));
            }}
            placeholder={t("workflows.nodes.variables.name")}
            autoCapitalize="none"
            size="sm"
            style={styles.variableName}
          />
          <WorkflowTextInput
            value={value}
            onChangeText={(nextValue) => onChange({ ...variables, [name]: nextValue })}
            placeholder={t("workflows.nodes.variables.value")}
            size="sm"
            style={styles.variableValue}
          />
          <IconButton
            label={t("workflows.nodes.variables.delete", { name })}
            icon={Trash2}
            onPress={() => onChange(Object.fromEntries(entries.filter((_, i) => i !== index)))}
          />
        </View>
      ))}
    </View>
  );
}

function RetryPolicyFields({
  retry,
  onChange,
}: {
  retry: WorkflowRetryPolicy | undefined;
  onChange: (retry: WorkflowRetryPolicy | undefined) => void;
}) {
  const { t } = useTranslation();
  const updateRetry = (patch: Partial<WorkflowRetryPolicy>) => {
    onChange({
      maxAttempts: retry?.maxAttempts ?? 3,
      initialDelayMs: retry?.initialDelayMs,
      maxDelayMs: retry?.maxDelayMs,
      backoffMultiplier: retry?.backoffMultiplier,
      jitter: retry?.jitter,
      ...patch,
    });
  };
  return (
    <View style={styles.policySection}>
      <View>
        <Text style={styles.sectionTitle}>{t("workflows.nodes.retry.title")}</Text>
        <Text style={styles.sectionDescription}>{t("workflows.nodes.retry.description")}</Text>
      </View>
      <View style={styles.fourColumn}>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.retry.attempts")}>
            <WorkflowTextInput
              value={retry?.maxAttempts?.toString() ?? ""}
              onChangeText={(value) => {
                const maxAttempts = optionalPositiveNumber(value);
                onChange(maxAttempts ? { ...retry, maxAttempts } : undefined);
              }}
              placeholder={t("workflows.nodes.retry.workflowDefault")}
              keyboardType="numeric"
              size="sm"
            />
          </Field>
        </View>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.retry.initialDelay")}>
            <WorkflowTextInput
              value={formatMillisecondsAsSeconds(retry?.initialDelayMs)}
              onChangeText={(value) =>
                updateRetry({
                  initialDelayMs: optionalNonnegativeSecondsAsMilliseconds(value),
                })
              }
              placeholder="1"
              keyboardType="decimal-pad"
              size="sm"
            />
          </Field>
        </View>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.retry.maxDelay")}>
            <WorkflowTextInput
              value={formatMillisecondsAsSeconds(retry?.maxDelayMs)}
              onChangeText={(value) =>
                updateRetry({
                  maxDelayMs: optionalPositiveSecondsAsMilliseconds(value),
                })
              }
              placeholder="30"
              keyboardType="decimal-pad"
              size="sm"
            />
          </Field>
        </View>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.retry.backoff")}>
            <WorkflowTextInput
              value={retry?.backoffMultiplier?.toString() ?? ""}
              onChangeText={(value) =>
                updateRetry({ backoffMultiplier: optionalPositiveDecimal(value) })
              }
              placeholder="2"
              keyboardType="decimal-pad"
              size="sm"
            />
          </Field>
        </View>
      </View>
      <ToggleField
        label={t("workflows.nodes.retry.jitter")}
        value={retry?.jitter ?? true}
        onChange={(jitter) => updateRetry({ jitter })}
      />
    </View>
  );
}

function SwitchStepFields({
  step,
  rootSteps,
  providerEntries,
  providersLoading,
  assistants,
  assistantsLoading,
  teams,
  teamsLoading,
  promptTemplates,
  promptTemplatesLoading,
  allowPython,
  depth,
  onChange,
}: {
  step: WorkflowSwitchStep;
  rootSteps: WorkflowStep[];
  providerEntries: ProviderSnapshotEntry[];
  providersLoading: boolean;
  assistants: Assistant[];
  assistantsLoading: boolean;
  teams: Team[];
  teamsLoading: boolean;
  promptTemplates: PaseoInstructionTemplate[];
  promptTemplatesLoading: boolean;
  allowPython: boolean;
  depth: number;
  onChange: (step: WorkflowSwitchStep) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <ToggleField
        label={t("workflows.nodes.switch.caseSensitive")}
        value={step.caseSensitive ?? false}
        onChange={(caseSensitive) => onChange({ ...step, caseSensitive })}
      />
      <View style={styles.branches}>
        {step.cases.map((candidate, index) => (
          // Case values are editable and must not remount their branch while typed.
          // oxlint-disable-next-line react/no-array-index-key
          <View key={`case-${index}`} style={styles.branchCard}>
            <View style={styles.branchCaseHeader}>
              <View style={styles.branchCondition}>
                <Braces size={14} color={styles.branchConditionIcon.color} />
                <Text style={styles.branchConditionLabel}>
                  {t("workflows.nodes.switch.controlEquals")}
                </Text>
                <WorkflowTextInput
                  value={candidate.equals}
                  onChangeText={(equals) => {
                    const cases = [...step.cases];
                    cases[index] = { ...candidate, equals };
                    onChange({ ...step, cases });
                  }}
                  size="sm"
                  style={styles.branchConditionInput}
                />
              </View>
              <IconButton
                label={t("workflows.nodes.switch.deleteBranch")}
                icon={Trash2}
                disabled={step.cases.length === 1}
                onPress={() =>
                  onChange({
                    ...step,
                    cases: step.cases.filter((_, candidateIndex) => candidateIndex !== index),
                  })
                }
              />
            </View>
            <WorkflowStepListEditor
              steps={candidate.steps}
              rootSteps={rootSteps}
              providerEntries={providerEntries}
              providersLoading={providersLoading}
              assistants={assistants}
              assistantsLoading={assistantsLoading}
              teams={teams}
              teamsLoading={teamsLoading}
              promptTemplates={promptTemplates}
              promptTemplatesLoading={promptTemplatesLoading}
              allowPython={allowPython}
              depth={depth + 1}
              onChange={(steps) => {
                const cases = [...step.cases];
                cases[index] = { ...candidate, steps };
                onChange({ ...step, cases });
              }}
            />
          </View>
        ))}
        <Button
          variant="outline"
          size="xs"
          leftIcon={Plus}
          onPress={() =>
            onChange({
              ...step,
              cases: [...step.cases, { equals: `case-${step.cases.length + 1}`, steps: [] }],
            })
          }
        >
          {t("workflows.nodes.switch.addBranch")}
        </Button>
        <View style={styles.branchCard}>
          <WorkflowStepListEditor
            label={t("workflows.nodes.switch.defaultBranch")}
            description={t("workflows.nodes.switch.defaultDescription")}
            steps={step.defaultSteps ?? []}
            rootSteps={rootSteps}
            providerEntries={providerEntries}
            providersLoading={providersLoading}
            assistants={assistants}
            assistantsLoading={assistantsLoading}
            teams={teams}
            teamsLoading={teamsLoading}
            promptTemplates={promptTemplates}
            promptTemplatesLoading={promptTemplatesLoading}
            allowPython={allowPython}
            depth={depth + 1}
            onChange={(defaultSteps) => onChange({ ...step, defaultSteps })}
          />
        </View>
      </View>
    </>
  );
}

function ForStepFields({
  step,
  rootSteps,
  providerEntries,
  providersLoading,
  assistants,
  assistantsLoading,
  teams,
  teamsLoading,
  promptTemplates,
  promptTemplatesLoading,
  allowPython,
  depth,
  onChange,
}: {
  step: WorkflowForStep;
  rootSteps: WorkflowStep[];
  providerEntries: ProviderSnapshotEntry[];
  providersLoading: boolean;
  assistants: Assistant[];
  assistantsLoading: boolean;
  teams: Team[];
  teamsLoading: boolean;
  promptTemplates: PaseoInstructionTemplate[];
  promptTemplatesLoading: boolean;
  allowPython: boolean;
  depth: number;
  onChange: (step: WorkflowForStep) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <View style={styles.threeColumn}>
        <View style={styles.columnField}>
          <Field
            label={t("workflows.nodes.for.separator")}
            hint={t("workflows.nodes.for.separatorHint")}
          >
            <WorkflowTextInput
              value={step.separator ?? ""}
              onChangeText={(separator) =>
                onChange({ ...step, separator: optionalText(separator) })
              }
              placeholder={t("workflows.nodes.for.automatic")}
              size="sm"
            />
          </Field>
        </View>
        <View style={styles.columnField}>
          <Field
            label={t("workflows.nodes.for.maximumIterations")}
            hint={t("workflows.nodes.for.maximumIterationsHint")}
          >
            <WorkflowTextInput
              value={step.maxIterations?.toString() ?? ""}
              onChangeText={(value) =>
                onChange({ ...step, maxIterations: optionalPositiveNumber(value) })
              }
              placeholder="100"
              keyboardType="numeric"
              size="sm"
            />
          </Field>
        </View>
        <View style={styles.columnField}>
          <Field
            label={t("workflows.nodes.for.concurrency")}
            hint={t("workflows.nodes.for.concurrencyHint")}
          >
            <WorkflowTextInput
              value={step.concurrency?.toString() ?? ""}
              onChangeText={(value) =>
                onChange({ ...step, concurrency: optionalPositiveNumber(value) })
              }
              placeholder="1"
              keyboardType="numeric"
              size="sm"
            />
          </Field>
        </View>
      </View>
      <View style={styles.branchCard}>
        <WorkflowStepListEditor
          label={t("workflows.nodes.for.loopBody")}
          description={t("workflows.nodes.for.loopDescription")}
          steps={step.steps}
          rootSteps={rootSteps}
          providerEntries={providerEntries}
          providersLoading={providersLoading}
          assistants={assistants}
          assistantsLoading={assistantsLoading}
          teams={teams}
          teamsLoading={teamsLoading}
          promptTemplates={promptTemplates}
          promptTemplatesLoading={promptTemplatesLoading}
          allowPython={allowPython}
          depth={depth + 1}
          onChange={(steps) => onChange({ ...step, steps })}
        />
      </View>
    </>
  );
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleField}>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
      <Text style={styles.toggleLabel}>{label}</Text>
    </View>
  );
}

function IconButton({
  label,
  icon: Icon,
  onPress,
  disabled = false,
  destructive = false,
}: {
  label: string;
  icon: typeof ArrowUp;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const color = destructive
    ? styles.iconButtonDestructiveColor.color
    : styles.iconButtonColor.color;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ hovered, pressed }) => [
        styles.iconButton,
        hovered && styles.iconButtonHovered,
        pressed && styles.iconButtonPressed,
        disabled && styles.iconButtonDisabled,
      ]}
    >
      <Icon size={14} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  stepList: {
    gap: theme.spacing[3],
  },
  branchHeading: {
    gap: theme.spacing[1],
  },
  branchTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  branchDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  emptyBranch: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderStyle: "dashed",
    borderRadius: theme.borderRadius.md,
  },
  emptyBranchText: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
  },
  addNodeBar: {
    minHeight: 44,
    flexDirection: { xs: "column", md: "row" },
    alignItems: { xs: "stretch", md: "center" },
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderStyle: "dashed",
    borderRadius: theme.borderRadius.lg,
  },
  addNodeBarCompact: {
    backgroundColor: theme.colors.surface0,
  },
  addNodeLabel: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  addNodeLabelIcon: {
    color: theme.colors.foregroundMuted,
  },
  addNodeLabelText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  addNodeActions: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: { xs: "flex-start", md: "flex-end" },
    gap: theme.spacing[1],
  },
  stepCard: {
    overflow: "hidden",
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  stepCardNested: {
    backgroundColor: theme.colors.surface0,
  },
  stepHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    padding: theme.spacing[2],
  },
  stepHeaderMain: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  stepHeaderMainHovered: {
    backgroundColor: theme.colors.surface2,
  },
  stepHeaderMainPressed: {
    opacity: theme.opacity[50],
  },
  stepTypeIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface3,
  },
  stepTypeIconColor: {
    color: theme.colors.foreground,
  },
  stepHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  stepTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  stepType: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  stepSummary: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  stepId: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
  },
  stepHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginLeft: "auto",
    gap: theme.spacing[1],
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonColor: {
    color: theme.colors.foregroundMuted,
  },
  iconButtonDestructiveColor: {
    color: theme.colors.destructive,
  },
  iconButtonHovered: {
    backgroundColor: theme.colors.surface3,
  },
  iconButtonPressed: {
    opacity: theme.opacity[50],
  },
  iconButtonDisabled: {
    opacity: theme.opacity[50],
  },
  stepFields: {
    gap: theme.spacing[4],
    padding: theme.spacing[4],
  },
  twoColumn: {
    flexDirection: { xs: "column", md: "row" },
    gap: theme.spacing[3],
  },
  threeColumn: {
    flexDirection: { xs: "column", lg: "row" },
    gap: theme.spacing[3],
  },
  fourColumn: {
    flexDirection: { xs: "column", lg: "row" },
    gap: theme.spacing[3],
  },
  policySection: {
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
  },
  policyField: {
    maxWidth: 320,
  },
  columnField: {
    flex: 1,
    minWidth: 0,
  },
  codeInput: {
    minHeight: 128,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
    lineHeight: Math.round(theme.fontSize.xs * 1.5),
  },
  promptInput: {
    minHeight: 112,
  },
  systemPromptInput: {
    minHeight: 80,
  },
  variablesSection: {
    gap: theme.spacing[2],
  },
  variableExamples: {
    gap: theme.spacing[2],
    width: 640,
    maxWidth: "100%",
  },
  variableHelpButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.full,
  },
  variableHelpIcon: {
    color: theme.colors.foregroundMuted,
  },
  variableHelpPopover: {
    padding: theme.spacing[3],
  },
  variableHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  variableExamplesTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  variableExamplesDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  variableExampleCode: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface2,
  },
  variableExampleRows: {
    gap: theme.spacing[1],
  },
  variableExampleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  variableExampleTemplate: {
    width: 150,
    color: theme.colors.accent,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
  },
  variableExampleArrow: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
  },
  variableExampleResult: {
    minWidth: 84,
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
  },
  variableExampleDescription: {
    flex: 1,
    minWidth: 180,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  sectionTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  sectionDescription: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
  },
  variableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  variableName: {
    width: 180,
    fontFamily: theme.fontFamily.mono,
  },
  variableValue: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[4],
  },
  toggleField: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  toggleLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  branches: {
    gap: theme.spacing[3],
  },
  branchCard: {
    padding: theme.spacing[3],
    gap: theme.spacing[3],
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.accent,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  branchCaseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  branchCondition: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  branchConditionIcon: {
    color: theme.colors.foregroundMuted,
  },
  branchConditionLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  branchConditionInput: {
    flex: 1,
    maxWidth: 260,
    fontFamily: theme.fontFamily.mono,
  },
}));
