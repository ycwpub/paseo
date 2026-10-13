import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  LarkChannelBotStatus,
  LarkChannelTarget,
  LarkGroupMessageProcessor,
  LarkGroupMessageProcessorCreateInput,
  LarkGroupMessageProcessorFilter,
} from "@getpaseo/protocol/messages";
import type { AgentModelDefinition, ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { useAssistants } from "@/hooks/use-assistants";
import { registerProjectDescriptor } from "@/hooks/open-project";
import { useProjects } from "@/hooks/use-projects";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useTeams } from "@/hooks/use-teams";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { SettingsSection } from "@/screens/settings/settings-section";
import { useSessionStore } from "@/stores/session-store";
import { settingsStyles } from "@/styles/settings";
import {
  createLarkProjectBinding,
  findLarkProjectIdByCwd,
  rollbackLarkProjectBinding,
} from "./lark-project-binding";
import {
  LarkProjectBindingFields,
  type LarkProjectBindingMode,
} from "./lark-project-binding-fields";
import { useLarkGroupMessageProcessors } from "./use-lark-group-message-processors";

const TARGET_WORKSPACE = "workspace";
const TARGET_ASSISTANT_PREFIX = "assistant:";
const TARGET_TEAM_PREFIX = "team:";

interface ProcessorForm {
  name: string;
  enabled: boolean;
  botId: string;
  realtimeEnabled: boolean;
  delaySeconds: string;
  scanEnabled: boolean;
  scanIntervalMinutes: string;
  scanLookbackMinutes: string;
  scanExcludeRecentMinutes: string;
  previousMessageCount: string;
  followingMessageCount: string;
  aiFilterPrompt: string;
  replyPrompt: string;
  autoArchiveAgent: boolean;
  cwd: string;
  provider: string;
  model: string;
  targetSelection: string;
  filters: LarkGroupMessageProcessorFilter[];
}

type TextFormField =
  | "name"
  | "delaySeconds"
  | "scanIntervalMinutes"
  | "scanLookbackMinutes"
  | "scanExcludeRecentMinutes"
  | "previousMessageCount"
  | "followingMessageCount"
  | "aiFilterPrompt"
  | "replyPrompt"
  | "cwd"
  | "provider"
  | "model"
  | "targetSelection";

type BooleanFormField = "enabled" | "realtimeEnabled" | "scanEnabled" | "autoArchiveAgent";

const filterFieldOptions: SelectFieldOption<LarkGroupMessageProcessorFilter["field"]>[] = [
  { id: "group_name", value: "group_name", label: "群名称", description: "机器人所在群名称" },
  { id: "group_chat_id", value: "group_chat_id", label: "指定群", description: "oc_xxx" },
  { id: "sender_name", value: "sender_name", label: "发送人名称", description: "飞书显示名称" },
  { id: "sender_open_id", value: "sender_open_id", label: "发送人 open_id", description: "ou_xxx" },
  {
    id: "message_content",
    value: "message_content",
    label: "消息内容",
    description: "原始文本内容",
  },
];

const includeExcludeOptions: SelectFieldOption<"include" | "exclude">[] = [
  { id: "include", value: "include", label: "包含", description: "命中后允许" },
  { id: "exclude", value: "exclude", label: "排除", description: "命中后跳过" },
];

const exactOperatorOptions: SelectFieldOption<"equals">[] = [
  { id: "equals", value: "equals", label: "精确匹配", description: "完全相同" },
];

const textOperatorOptions: SelectFieldOption<"equals" | "contains" | "regex">[] = [
  { id: "equals", value: "equals", label: "精确匹配", description: "完全相同" },
  { id: "contains", value: "contains", label: "包含", description: "包含文本" },
  { id: "regex", value: "regex", label: "正则", description: "正则表达式" },
];

function toInteger(value: string, label: string, min: number, max: number): number {
  const number = Number(value.trim());
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label}必须是 ${min} 到 ${max} 的整数`);
  }
  return number;
}

function targetSelectionFor(target: LarkChannelTarget | null): string {
  if (target?.kind === "assistant" && target.assistantId) {
    return `${TARGET_ASSISTANT_PREFIX}${target.assistantId}`;
  }
  if (target?.kind === "team" && target.teamId) {
    return `${TARGET_TEAM_PREFIX}${target.teamId}`;
  }
  return TARGET_WORKSPACE;
}

function targetFormValues(target: LarkChannelTarget | null) {
  return {
    cwd: target?.cwd ?? "",
    provider: target?.provider ?? "",
    model: target?.model ?? "",
    targetSelection: targetSelectionFor(target),
  };
}

function defaultProcessorForm(target: LarkChannelTarget | null, botId: string): ProcessorForm {
  return {
    name: "",
    enabled: true,
    botId,
    realtimeEnabled: true,
    delaySeconds: "60",
    scanEnabled: true,
    scanIntervalMinutes: "30",
    scanLookbackMinutes: "60",
    scanExcludeRecentMinutes: "10",
    previousMessageCount: "10",
    followingMessageCount: "10",
    aiFilterPrompt: "",
    replyPrompt: "结合群聊上下文，直接回答当前工作问题。",
    autoArchiveAgent: true,
    ...targetFormValues(target),
    filters: [],
  };
}

function storedProcessorForm(
  processor: LarkGroupMessageProcessor,
  target: LarkChannelTarget | null,
): ProcessorForm {
  return {
    name: processor.name,
    enabled: processor.enabled,
    botId: processor.botId,
    realtimeEnabled: processor.realtime.enabled,
    delaySeconds: String(processor.realtime.delaySeconds),
    scanEnabled: processor.scan.enabled,
    scanIntervalMinutes: String(processor.scan.intervalMinutes),
    scanLookbackMinutes: String(processor.scan.lookbackMinutes),
    scanExcludeRecentMinutes: String(processor.scan.excludeRecentMinutes),
    previousMessageCount: String(processor.context.previousMessageCount),
    followingMessageCount: String(processor.context.followingMessageCount),
    aiFilterPrompt: processor.aiFilterPrompt,
    replyPrompt: processor.replyPrompt,
    autoArchiveAgent: processor.autoArchiveAgent,
    ...targetFormValues(target),
    filters: processor.filters,
  };
}

function formFromProcessor(
  processor: LarkGroupMessageProcessor | null | undefined,
  bots: readonly LarkChannelBotStatus[],
): ProcessorForm {
  const target = processor?.target ?? bots[0]?.target ?? null;
  if (!processor) {
    return defaultProcessorForm(target, bots[0]?.id ?? "");
  }
  return storedProcessorForm(processor, target);
}

function optionDisplay<T extends string>(
  options: readonly SelectFieldOption<T>[],
  value: T | null,
) {
  const option = options.find((entry) => entry.value === value);
  return option ? { label: option.label, description: option.description } : null;
}

function buildProviderOptions(
  entries: readonly ProviderSnapshotEntry[],
): SelectFieldOption<string>[] {
  return entries
    .filter((entry) => entry.enabled !== false)
    .map((entry) => ({
      id: entry.provider,
      value: entry.provider,
      label: entry.label ?? entry.provider,
      description: entry.description ?? entry.provider,
    }));
}

function buildModelOptions(models: readonly AgentModelDefinition[]): SelectFieldOption<string>[] {
  return models.map((model) => ({
    id: model.id,
    value: model.id,
    label: model.label,
    description: model.description ?? model.id,
  }));
}

function buildTargetOptions(
  assistants: ReturnType<typeof useAssistants>["assistants"],
  teams: ReturnType<typeof useTeams>["teams"],
): SelectFieldOption<string>[] {
  return [
    {
      id: TARGET_WORKSPACE,
      value: TARGET_WORKSPACE,
      label: "不指定助手或团队",
      description: "直接使用所选模型和 Project",
    },
    ...assistants.map((assistant) => ({
      id: `${TARGET_ASSISTANT_PREFIX}${assistant.id}`,
      value: `${TARGET_ASSISTANT_PREFIX}${assistant.id}`,
      label: assistant.name,
      description: `助手 · ${assistant.description || assistant.name}`,
    })),
    ...teams.map((team) => ({
      id: `${TARGET_TEAM_PREFIX}${team.id}`,
      value: `${TARGET_TEAM_PREFIX}${team.id}`,
      label: team.name,
      description: "团队",
    })),
  ];
}

function buildTarget(input: {
  targetSelection: string;
  provider: string;
  model: string;
  cwd: string;
  projectId: string | null;
}): LarkChannelTarget {
  const shared = {
    provider: input.provider || null,
    model: input.model || null,
    cwd: input.cwd,
    workspaceId: null,
    projectId: input.projectId,
  };
  if (input.targetSelection.startsWith(TARGET_ASSISTANT_PREFIX)) {
    return {
      kind: "assistant",
      assistantId: input.targetSelection.slice(TARGET_ASSISTANT_PREFIX.length) || null,
      ...shared,
    };
  }
  if (input.targetSelection.startsWith(TARGET_TEAM_PREFIX)) {
    return {
      kind: "team",
      teamId: input.targetSelection.slice(TARGET_TEAM_PREFIX.length) || null,
      ...shared,
    };
  }
  return { kind: "workspace", ...shared };
}

function validateProcessorForm(
  form: ProcessorForm,
  projectMode: LarkProjectBindingMode,
): {
  scan: LarkGroupMessageProcessorCreateInput["scan"];
  context: LarkGroupMessageProcessorCreateInput["context"];
} {
  if (!form.name.trim()) throw new Error("请输入处理器名称");
  if (!form.botId) throw new Error("请选择飞书机器人");
  if (!form.provider.trim()) throw new Error("请选择模型提供方");
  if (projectMode === "existing" && !form.cwd.trim()) {
    throw new Error("请选择已有 Project");
  }
  const scan = {
    enabled: form.scanEnabled,
    intervalMinutes: toInteger(form.scanIntervalMinutes, "扫描间隔", 1, 1440),
    lookbackMinutes: toInteger(form.scanLookbackMinutes, "扫描范围", 1, 10080),
    excludeRecentMinutes: toInteger(form.scanExcludeRecentMinutes, "排除最近", 0, 10079),
  };
  if (scan.excludeRecentMinutes >= scan.lookbackMinutes) {
    throw new Error("排除最近时间必须小于扫描范围");
  }
  return {
    scan,
    context: {
      previousMessageCount: toInteger(form.previousMessageCount, "前文消息数量", 0, 100),
      followingMessageCount: toInteger(form.followingMessageCount, "后文消息数量", 0, 100),
    },
  };
}

function buildProcessorInput(input: {
  form: ProcessorForm;
  scan: LarkGroupMessageProcessorCreateInput["scan"];
  context: LarkGroupMessageProcessorCreateInput["context"];
  cwd: string;
  projectId: string | null;
}): LarkGroupMessageProcessorCreateInput {
  return {
    name: input.form.name.trim(),
    enabled: input.form.enabled,
    botId: input.form.botId,
    realtime: {
      enabled: input.form.realtimeEnabled,
      delaySeconds: toInteger(input.form.delaySeconds, "实时等待时间", 0, 3600),
    },
    scan: input.scan,
    context: input.context,
    filters: input.form.filters.filter((filter) => filter.value.trim()),
    aiFilterPrompt: input.form.aiFilterPrompt.trim(),
    replyPrompt: input.form.replyPrompt.trim(),
    autoArchiveAgent: input.form.autoArchiveAgent,
    target: buildTarget({
      targetSelection: input.form.targetSelection,
      provider: input.form.provider.trim(),
      model: input.form.model.trim(),
      cwd: input.cwd,
      projectId: input.projectId,
    }),
  };
}

function ProcessorTextField({
  label,
  field,
  value,
  update,
  multiline = false,
  keyboardType,
}: {
  label: string;
  field: TextFormField;
  value: string;
  update: (field: TextFormField, value: string) => void;
  multiline?: boolean;
  keyboardType?: "number-pad";
}) {
  const onChangeText = useCallback((next: string) => update(field, next), [field, update]);
  return (
    <Field label={label}>
      <FormTextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </Field>
  );
}

function ProcessorSwitchRow({
  label,
  field,
  value,
  update,
}: {
  label: string;
  field: BooleanFormField;
  value: boolean;
  update: (field: BooleanFormField, value: boolean) => void;
}) {
  const onValueChange = useCallback((next: boolean) => update(field, next), [field, update]);
  return (
    <View style={styles.switchRow}>
      <Text style={settingsStyles.rowTitle}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function ProcessorFilterRow({
  index,
  filter,
  changeFilter,
  removeFilter,
}: {
  index: number;
  filter: LarkGroupMessageProcessorFilter;
  changeFilter: (index: number, filter: LarkGroupMessageProcessorFilter) => void;
  removeFilter: (index: number) => void;
}) {
  const onChange = useCallback(
    (next: LarkGroupMessageProcessorFilter) => changeFilter(index, next),
    [changeFilter, index],
  );
  const onRemove = useCallback(() => removeFilter(index), [index, removeFilter]);
  const setEffect = useCallback(
    (effect: "include" | "exclude") => onChange({ ...filter, effect }),
    [filter, onChange],
  );
  const setField = useCallback(
    (field: LarkGroupMessageProcessorFilter["field"]) => {
      const operator =
        field === "group_chat_id" || field === "sender_open_id" ? "equals" : "contains";
      onChange({ ...filter, field, operator } as LarkGroupMessageProcessorFilter);
    },
    [filter, onChange],
  );
  const setOperator = useCallback(
    (operator: "equals" | "contains" | "regex") =>
      onChange({ ...filter, operator } as LarkGroupMessageProcessorFilter),
    [filter, onChange],
  );
  const setValue = useCallback(
    (value: string) => onChange({ ...filter, value }),
    [filter, onChange],
  );
  const operators =
    filter.field === "group_chat_id" || filter.field === "sender_open_id"
      ? exactOperatorOptions
      : textOperatorOptions;
  return (
    <View style={styles.filterRow}>
      <SelectField
        label="作用"
        value={filter.effect}
        selectedDisplay={null}
        options={includeExcludeOptions}
        onChange={setEffect}
        placeholder="选择作用"
        emptyText="暂无作用类型"
      />
      <SelectField
        label="字段"
        value={filter.field}
        selectedDisplay={null}
        options={filterFieldOptions}
        onChange={setField}
        placeholder="选择字段"
        emptyText="暂无字段"
      />
      <SelectField
        label="匹配"
        value={filter.operator}
        selectedDisplay={null}
        options={operators}
        onChange={setOperator}
        placeholder="选择匹配方式"
        emptyText="暂无匹配方式"
      />
      <Field label="值">
        <FormTextInput value={filter.value} onChangeText={setValue} />
      </Field>
      <Button size="sm" variant="destructive" onPress={onRemove}>
        删除规则
      </Button>
    </View>
  );
}

export function LarkGroupMessageProcessorEditor({
  serverId,
  bots,
  processor,
  onSaved,
}: {
  serverId: string;
  bots: readonly LarkChannelBotStatus[];
  processor?: LarkGroupMessageProcessor | null;
  onSaved: () => void;
}) {
  const processors = useLarkGroupMessageProcessors(serverId);
  const client = useHostRuntimeClient(serverId);
  const assistants = useAssistants(serverId);
  const supportsTeams = useHostFeature(serverId, "teams");
  const teams = useTeams(serverId, { enabled: supportsTeams });
  const providerSnapshot = useProvidersSnapshot(serverId);
  const supportsDirectorylessProjects = useHostFeature(serverId, "projectCreateDirectoryless");
  const { projects } = useProjects();
  const [form, setForm] = useState(() => formFromProcessor(processor, bots));
  const [projectMode, setProjectMode] = useState<LarkProjectBindingMode>(
    processor ? "existing" : "create",
  );
  const [newProjectName, setNewProjectName] = useState(processor?.name ?? "");
  const [newProjectNameEdited, setNewProjectNameEdited] = useState(false);
  const [newProjectNameRevision, setNewProjectNameRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const upsertProject = useSessionStore((state) => state.upsertProject);
  const removeProject = useSessionStore((state) => state.removeProject);
  const setHasHydratedWorkspaces = useSessionStore((state) => state.setHasHydratedWorkspaces);
  const botOptions = useMemo(
    () =>
      bots.map((bot) => ({
        id: bot.id,
        value: bot.id,
        label: bot.name ?? bot.id,
        description: bot.appId ?? bot.id,
      })),
    [bots],
  );
  const projectOptions = useMemo(
    () =>
      projects.flatMap((project) => {
        const host = project.hosts.find((entry) => entry.serverId === serverId && entry.isOnline);
        return host?.repoRoot
          ? [
              {
                id: `${project.viewKey}:${host.repoRoot}`,
                value: host.repoRoot,
                label: project.projectCustomName ?? project.projectName,
                description: host.repoRoot,
              },
            ]
          : [];
      }),
    [projects, serverId],
  );
  const providerEntries = useMemo(() => providerSnapshot.entries ?? [], [providerSnapshot.entries]);
  const providerOptions = useMemo(() => buildProviderOptions(providerEntries), [providerEntries]);
  const selectedProvider = useMemo(
    () => providerEntries.find((entry) => entry.provider === form.provider) ?? null,
    [form.provider, providerEntries],
  );
  const modelOptions = useMemo(
    () => buildModelOptions(selectedProvider?.models ?? []),
    [selectedProvider?.models],
  );
  const targetOptions = useMemo(
    () => buildTargetOptions(assistants.assistants, teams.teams),
    [assistants.assistants, teams.teams],
  );
  const updateText = useCallback((field: TextFormField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  }, []);
  const updateBoolean = useCallback((field: BooleanFormField, value: boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  }, []);
  const updateBotId = useCallback((botId: string) => {
    setForm((current) => ({ ...current, botId }));
  }, []);
  const updateCwd = useCallback((cwd: string) => {
    setForm((current) => ({ ...current, cwd }));
  }, []);
  const updateProvider = useCallback((provider: string) => {
    setForm((current) => ({ ...current, provider, model: "" }));
  }, []);
  const updateTargetSelection = useCallback((targetSelection: string) => {
    setForm((current) => ({ ...current, targetSelection }));
  }, []);
  const updateProjectMode = useCallback((mode: LarkProjectBindingMode) => {
    setProjectMode(mode);
  }, []);
  const updateNewProjectName = useCallback((name: string) => {
    setNewProjectName(name);
    setNewProjectNameEdited(true);
  }, []);
  const updateName = useCallback(
    (name: string) => {
      updateText("name", name);
      if (!newProjectNameEdited) {
        setNewProjectName(name);
        setNewProjectNameRevision((current) => current + 1);
      }
    },
    [newProjectNameEdited, updateText],
  );
  const addFilter = useCallback(() => {
    setForm((current) => ({
      ...current,
      filters: [
        ...current.filters,
        {
          id: `filter-${Date.now()}-${current.filters.length}`,
          effect: "include",
          field: "message_content",
          operator: "contains",
          value: "",
        },
      ],
    }));
  }, []);
  const changeFilter = useCallback((index: number, filter: LarkGroupMessageProcessorFilter) => {
    setForm((current) => {
      const filters = [...current.filters];
      filters[index] = filter;
      return { ...current, filters };
    });
  }, []);
  const removeFilter = useCallback((index: number) => {
    setForm((current) => ({
      ...current,
      filters: current.filters.filter((_, currentIndex) => currentIndex !== index),
    }));
  }, []);
  const updateModel = useCallback((model: string) => updateText("model", model), [updateText]);
  const save = useCallback(async () => {
    let createdProjectId: string | null = null;
    try {
      setError(null);
      const validated = validateProcessorForm(form, projectMode);
      const selectedProjectId =
        findLarkProjectIdByCwd(projects, serverId, form.cwd) ??
        (processor?.target.cwd === form.cwd ? (processor.target.projectId ?? null) : null);
      const createdProject =
        projectMode === "create"
          ? await createLarkProjectBinding({
              name: newProjectName || form.name,
              supportsDirectorylessProjects,
              client,
              registerProject: (created) => {
                registerProjectDescriptor({
                  serverId,
                  project: created,
                  upsertProject,
                  setHasHydratedWorkspaces,
                });
              },
            })
          : null;
      const resolvedCwd = createdProject?.cwd ?? form.cwd.trim();
      const resolvedProjectId = createdProject?.projectId ?? selectedProjectId;
      createdProjectId = createdProject?.projectId ?? null;
      const input = buildProcessorInput({
        form,
        scan: validated.scan,
        context: validated.context,
        cwd: resolvedCwd,
        projectId: resolvedProjectId,
      });
      if (processor) await processors.update(processor.id, input);
      else await processors.create(input);
      onSaved();
    } catch (reason) {
      if (createdProjectId) {
        await rollbackLarkProjectBinding({
          projectId: createdProjectId,
          client,
          unregisterProject: (projectId) => removeProject(serverId, projectId),
        });
      }
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [
    client,
    form,
    newProjectName,
    onSaved,
    processor,
    processors,
    projectMode,
    projects,
    removeProject,
    serverId,
    setHasHydratedWorkspaces,
    supportsDirectorylessProjects,
    upsertProject,
  ]);
  const savePressed = useCallback(() => void save(), [save]);

  return (
    <SettingsSection title={processor ? "编辑群消息处理器" : "创建群消息处理器"}>
      <View style={styles.content}>
        <Field label="名称">
          <FormTextInput value={form.name} onChangeText={updateName} />
        </Field>
        <SelectField
          label="飞书机器人"
          value={form.botId}
          selectedDisplay={null}
          options={botOptions}
          onChange={updateBotId}
          placeholder="选择机器人"
          emptyText="暂无可用飞书机器人"
        />
        <Text style={settingsStyles.rowHint}>
          请先将该机器人手动加入群。处理器只监听并扫描机器人已加入的群。
        </Text>
        <SelectField
          label="模型提供方"
          value={form.provider || null}
          selectedDisplay={optionDisplay(providerOptions, form.provider || null)}
          options={providerOptions}
          onChange={updateProvider}
          placeholder="选择模型提供方"
          emptyText="暂无可用模型提供方"
          searchable
        />
        <SelectField
          label="模型（可选）"
          value={form.model || null}
          selectedDisplay={optionDisplay(modelOptions, form.model || null)}
          options={modelOptions}
          onChange={updateModel}
          placeholder="选择模型"
          emptyText="该提供方暂无模型"
          disabled={!form.provider}
          searchable
        />
        <SelectField
          label="助手或团队"
          value={form.targetSelection}
          selectedDisplay={optionDisplay(targetOptions, form.targetSelection)}
          options={targetOptions}
          onChange={updateTargetSelection}
          placeholder="选择助手或团队"
          emptyText="暂无助手或团队"
          searchable
        />
        <LarkProjectBindingFields
          mode={projectMode}
          cwd={form.cwd}
          newProjectName={newProjectName}
          newProjectNameRevision={newProjectNameRevision}
          supportsDirectorylessProjects={supportsDirectorylessProjects}
          projectOptions={projectOptions}
          selectedProjectDisplay={optionDisplay(projectOptions, form.cwd || null)}
          defaultNameDescription="默认与群消息处理器名称相同"
          testIDPrefix="lark-group-processor"
          onModeChange={updateProjectMode}
          onCwdChange={updateCwd}
          onNewProjectNameChange={updateNewProjectName}
        />
        <ProcessorSwitchRow
          label="启用处理器"
          field="enabled"
          value={form.enabled}
          update={updateBoolean}
        />
        <ProcessorSwitchRow
          label="实时监听"
          field="realtimeEnabled"
          value={form.realtimeEnabled}
          update={updateBoolean}
        />
        <ProcessorTextField
          label="实时消息等待（秒）"
          field="delaySeconds"
          value={form.delaySeconds}
          update={updateText}
          keyboardType="number-pad"
        />
        <ProcessorSwitchRow
          label="定时扫描"
          field="scanEnabled"
          value={form.scanEnabled}
          update={updateBoolean}
        />
        <View style={styles.inlineFields}>
          <ProcessorTextField
            label="扫描间隔（分钟）"
            field="scanIntervalMinutes"
            value={form.scanIntervalMinutes}
            update={updateText}
            keyboardType="number-pad"
          />
          <ProcessorTextField
            label="扫描范围（分钟）"
            field="scanLookbackMinutes"
            value={form.scanLookbackMinutes}
            update={updateText}
            keyboardType="number-pad"
          />
          <ProcessorTextField
            label="排除最近（分钟）"
            field="scanExcludeRecentMinutes"
            value={form.scanExcludeRecentMinutes}
            update={updateText}
            keyboardType="number-pad"
          />
        </View>
        <View style={styles.inlineFields}>
          <ProcessorTextField
            label="前文消息数量"
            field="previousMessageCount"
            value={form.previousMessageCount}
            update={updateText}
            keyboardType="number-pad"
          />
          <ProcessorTextField
            label="后文消息数量"
            field="followingMessageCount"
            value={form.followingMessageCount}
            update={updateText}
            keyboardType="number-pad"
          />
        </View>
        <Text style={settingsStyles.rowTitle}>过滤规则</Text>
        <Text style={settingsStyles.rowHint}>
          排除规则优先；相同字段的包含规则满足任意一条即可，不同字段必须同时满足。
        </Text>
        {form.filters.map((filter, index) => (
          <ProcessorFilterRow
            key={filter.id}
            index={index}
            filter={filter}
            changeFilter={changeFilter}
            removeFilter={removeFilter}
          />
        ))}
        <Button size="sm" variant="outline" onPress={addFilter}>
          增加过滤规则
        </Button>
        <ProcessorTextField
          label="AI 过滤提示词（可选）"
          field="aiFilterPrompt"
          value={form.aiFilterPrompt}
          update={updateText}
          multiline
        />
        <ProcessorTextField
          label="回答提示词"
          field="replyPrompt"
          value={form.replyPrompt}
          update={updateText}
          multiline
        />
        <ProcessorSwitchRow
          label="回答后自动归档 Agent"
          field="autoArchiveAgent"
          value={form.autoArchiveAgent}
          update={updateBoolean}
        />
        {error ? <Text style={settingsStyles.rowError}>{error}</Text> : null}
        <Button variant="default" loading={processors.isMutating} onPress={savePressed}>
          {processor ? "保存修改" : "创建群消息处理器"}
        </Button>
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: { gap: theme.spacing[3] },
  switchRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  inlineFields: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[3] },
  filterRow: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing[2],
    padding: theme.spacing[3],
  },
}));
