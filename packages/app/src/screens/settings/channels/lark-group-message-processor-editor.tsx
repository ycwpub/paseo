import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  LarkChannelBotStatus,
  LarkGroupMessageProcessor,
  LarkGroupMessageProcessorCreateInput,
  LarkGroupMessageProcessorFilter,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { useProjects } from "@/hooks/use-projects";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { useLarkGroupMessageProcessors } from "./use-lark-group-message-processors";

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
  | "model";

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

function formFromProcessor(
  processor: LarkGroupMessageProcessor | null | undefined,
  bots: readonly LarkChannelBotStatus[],
): ProcessorForm {
  if (!processor) {
    return {
      name: "",
      enabled: true,
      botId: bots[0]?.id ?? "",
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
      cwd: "",
      provider: "",
      model: "",
      filters: [],
    };
  }
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
    cwd: processor.target.cwd ?? "",
    provider: processor.target.provider ?? "",
    model: processor.target.model ?? "",
    filters: processor.filters,
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
  const { projects } = useProjects();
  const [form, setForm] = useState(() => formFromProcessor(processor, bots));
  const [error, setError] = useState<string | null>(null);
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
  const save = useCallback(async () => {
    try {
      setError(null);
      if (!form.name.trim()) throw new Error("请输入处理器名称");
      if (!form.botId) throw new Error("请选择飞书机器人");
      if (!form.cwd.trim()) throw new Error("请选择项目目录");
      if (!form.provider.trim()) throw new Error("请输入 provider");
      const scan = {
        enabled: form.scanEnabled,
        intervalMinutes: toInteger(form.scanIntervalMinutes, "扫描间隔", 1, 1440),
        lookbackMinutes: toInteger(form.scanLookbackMinutes, "扫描范围", 1, 10080),
        excludeRecentMinutes: toInteger(form.scanExcludeRecentMinutes, "排除最近", 0, 10079),
      };
      if (scan.excludeRecentMinutes >= scan.lookbackMinutes) {
        throw new Error("排除最近时间必须小于扫描范围");
      }
      const input: LarkGroupMessageProcessorCreateInput = {
        name: form.name.trim(),
        enabled: form.enabled,
        botId: form.botId,
        realtime: {
          enabled: form.realtimeEnabled,
          delaySeconds: toInteger(form.delaySeconds, "实时等待时间", 0, 3600),
        },
        scan,
        context: {
          previousMessageCount: toInteger(form.previousMessageCount, "前文消息数量", 0, 100),
          followingMessageCount: toInteger(form.followingMessageCount, "后文消息数量", 0, 100),
        },
        filters: form.filters.filter((filter) => filter.value.trim()),
        aiFilterPrompt: form.aiFilterPrompt.trim(),
        replyPrompt: form.replyPrompt.trim(),
        autoArchiveAgent: form.autoArchiveAgent,
        target: {
          kind: "workspace",
          provider: form.provider.trim(),
          model: form.model.trim() || null,
          cwd: form.cwd.trim(),
          workspaceId: null,
          projectId: null,
        },
      };
      if (processor) await processors.update(processor.id, input);
      else await processors.create(input);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [form, onSaved, processor, processors]);
  const savePressed = useCallback(() => void save(), [save]);

  return (
    <SettingsSection title={processor ? "编辑群消息处理器" : "创建群消息处理器"}>
      <View style={styles.content}>
        <ProcessorTextField label="名称" field="name" value={form.name} update={updateText} />
        <SelectField
          label="飞书机器人"
          value={form.botId}
          selectedDisplay={null}
          options={botOptions}
          onChange={updateBotId}
          placeholder="选择机器人"
          emptyText="暂无可用飞书机器人"
        />
        <SelectField
          label="项目目录"
          value={form.cwd}
          selectedDisplay={null}
          options={projectOptions}
          onChange={updateCwd}
          placeholder="选择已有 Project"
          emptyText="暂无可用 Project"
          searchable
        />
        <Text style={settingsStyles.rowHint}>
          请先将该机器人手动加入群。处理器只监听并扫描机器人已加入的群。
        </Text>
        <ProcessorTextField
          label="Provider"
          field="provider"
          value={form.provider}
          update={updateText}
        />
        <ProcessorTextField
          label="模型（可选）"
          field="model"
          value={form.model}
          update={updateText}
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
