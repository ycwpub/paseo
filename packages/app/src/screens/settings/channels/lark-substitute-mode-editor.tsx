import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  LarkChannelBotStatus,
  LarkDirectory,
  LarkDirectoryUser,
  LarkSubstituteMode,
} from "@getpaseo/protocol/messages";
import type { AgentModelDefinition, ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { useAssistants } from "@/hooks/use-assistants";
import { useProjects } from "@/hooks/use-projects";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useTeams } from "@/hooks/use-teams";
import { LarkUserOAuthCard } from "@/projects/lark/lark-user-oauth-card";
import { useHostFeature } from "@/runtime/host-features";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { LarkUserDirectoryField } from "./lark-directory-fields";
import {
  buildSubstituteModeInput,
  createSubstituteModeFormState,
  getLarkBotLabel,
  type LarkSubstituteModeFormState,
  TARGET_ASSISTANT_PREFIX,
  TARGET_TEAM_PREFIX,
  TARGET_WORKSPACE,
} from "./lark-substitute-mode-form-model";
import { useLarkSubstituteModes } from "./use-lark-substitute-modes";

const GROUP_REPLY_IDENTITY_OPTIONS: SelectFieldOption<"user" | "bot">[] = [
  { id: "user", value: "user", label: "用户身份" },
  { id: "bot", value: "bot", label: "机器人身份" },
];
const EMPTY_USERS: LarkDirectoryUser[] = [];

function optionDisplay<T extends string>(
  options: SelectFieldOption<T>[],
  value: T | null,
): SelectFieldDisplay | null {
  const option = options.find((entry) => entry.value === value);
  return option ? { label: option.label, description: option.description } : null;
}

function buildBotOptions(bots: LarkChannelBotStatus[]): SelectFieldOption<string>[] {
  return bots.map((bot) => ({
    id: bot.id,
    value: bot.id,
    label: getLarkBotLabel(bot),
    description: bot.appId ?? bot.id,
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
      description: "直接使用所选 Provider、模型和项目",
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

function buildProviderOptions(entries: ProviderSnapshotEntry[]): SelectFieldOption<string>[] {
  return entries
    .filter((entry) => entry.enabled !== false)
    .map((entry) => ({
      id: entry.provider,
      value: entry.provider,
      label: entry.label ?? entry.provider,
      description: entry.description ?? entry.provider,
    }));
}

function buildModelOptions(models: AgentModelDefinition[]): SelectFieldOption<string>[] {
  return models.map((model) => ({
    id: model.id,
    value: model.id,
    label: model.label,
    description: model.description ?? model.id,
  }));
}

function buildProjectOptions(
  projects: ReturnType<typeof useProjects>["projects"],
  serverId: string,
): SelectFieldOption<string>[] {
  return projects.flatMap((project) => {
    const host = project.hosts.find(
      (entry) => entry.serverId === serverId && entry.isOnline && entry.repoRoot.trim(),
    );
    return host
      ? [
          {
            id: `${project.viewKey}:${host.repoRoot}`,
            value: host.repoRoot,
            label: project.projectCustomName ?? project.projectName,
            description: host.repoRoot,
          },
        ]
      : [];
  });
}

function useSubstituteModeForm(
  mode: LarkSubstituteMode | null | undefined,
  bots: LarkChannelBotStatus[],
) {
  const [form, setForm] = useState(() => createSubstituteModeFormState(mode, bots));
  const updateField = useCallback(
    <K extends keyof LarkSubstituteModeFormState>(
      field: K,
      value: LarkSubstituteModeFormState[K],
    ) => {
      setForm((current) => ({ ...current, [field]: value }));
    },
    [],
  );
  const setName = useCallback((value: string) => updateField("name", value), [updateField]);
  const setEnabled = useCallback((value: boolean) => updateField("enabled", value), [updateField]);
  const setBotId = useCallback((value: string) => updateField("botId", value), [updateField]);
  const setOpenIds = useCallback(
    (value: string[]) => updateField("openId", value[0] ?? ""),
    [updateField],
  );
  const setGroupReplyIdentity = useCallback(
    (value: "user" | "bot") => updateField("groupReplyIdentity", value),
    [updateField],
  );
  const setDisclosureEnabled = useCallback(
    (value: boolean) => updateField("disclosureEnabled", value),
    [updateField],
  );
  const setDisclosurePrompt = useCallback(
    (value: string) => updateField("disclosurePrompt", value),
    [updateField],
  );
  const setCustomPrompt = useCallback(
    (value: string) => updateField("customPrompt", value),
    [updateField],
  );
  const setDelaySeconds = useCallback(
    (value: string) => updateField("delaySeconds", value),
    [updateField],
  );
  const setWeekdays = useCallback((value: string) => updateField("weekdays", value), [updateField]);
  const setStartTime = useCallback(
    (value: string) => updateField("startTime", value),
    [updateField],
  );
  const setEndTime = useCallback((value: string) => updateField("endTime", value), [updateField]);
  const setTimezone = useCallback((value: string) => updateField("timezone", value), [updateField]);
  const setAllowlist = useCallback(
    (value: string) => updateField("allowlist", value),
    [updateField],
  );
  const setDenylist = useCallback((value: string) => updateField("denylist", value), [updateField]);
  const setTargetSelection = useCallback(
    (value: string) => updateField("targetSelection", value),
    [updateField],
  );
  const setProvider = useCallback((value: string) => {
    setForm((current) => ({ ...current, provider: value, model: null }));
  }, []);
  const setModel = useCallback((value: string) => updateField("model", value), [updateField]);
  const setCwd = useCallback((value: string) => updateField("cwd", value), [updateField]);
  return {
    form,
    setName,
    setEnabled,
    setBotId,
    setOpenIds,
    setGroupReplyIdentity,
    setDisclosureEnabled,
    setDisclosurePrompt,
    setCustomPrompt,
    setDelaySeconds,
    setWeekdays,
    setStartTime,
    setEndTime,
    setTimezone,
    setAllowlist,
    setDenylist,
    setTargetSelection,
    setProvider,
    setModel,
    setCwd,
  };
}

async function persistMode(
  modes: ReturnType<typeof useLarkSubstituteModes>,
  mode: LarkSubstituteMode | null | undefined,
  input: ReturnType<typeof buildSubstituteModeInput>,
): Promise<void> {
  if (mode) {
    await modes.update(mode.id, input);
    return;
  }
  await modes.create(input);
}

export function LarkSubstituteModeEditor({
  serverId,
  bots,
  directory,
  resolveDirectoryUsers,
  mode,
  onSaved,
}: {
  serverId: string;
  bots: LarkChannelBotStatus[];
  directory: LarkDirectory | null;
  resolveDirectoryUsers: (appId: string, emails: string[]) => Promise<LarkDirectoryUser[]>;
  mode?: LarkSubstituteMode | null;
  onSaved: () => void;
}) {
  const modes = useLarkSubstituteModes(serverId);
  const assistants = useAssistants(serverId);
  const supportsTeams = useHostFeature(serverId, "teams");
  const teams = useTeams(serverId, { enabled: supportsTeams });
  const providers = useProvidersSnapshot(serverId);
  const { projects } = useProjects();
  const controller = useSubstituteModeForm(mode, bots);
  const { form } = controller;
  const [formError, setFormError] = useState<string | null>(null);
  const selectedBot = bots.find((bot) => bot.id === form.botId) ?? null;
  const botOptions = useMemo(() => buildBotOptions(bots), [bots]);
  const targetOptions = useMemo(
    () => buildTargetOptions(assistants.assistants, teams.teams),
    [assistants.assistants, teams.teams],
  );
  const providerEntries = useMemo(() => providers.entries ?? [], [providers.entries]);
  const providerOptionList = useMemo(
    () => buildProviderOptions(providerEntries),
    [providerEntries],
  );
  const providerEntry = providerEntries.find((entry) => entry.provider === form.provider) ?? null;
  const modelOptionList = useMemo(
    () => buildModelOptions(providerEntry?.models ?? []),
    [providerEntry?.models],
  );
  const projectOptionList = useMemo(
    () => buildProjectOptions(projects, serverId),
    [projects, serverId],
  );
  const selectedOpenIds = useMemo(() => (form.openId ? [form.openId] : []), [form.openId]);
  const directoryUsers = directory?.users ?? EMPTY_USERS;

  const handleSave = useCallback(async () => {
    setFormError(null);
    try {
      const input = buildSubstituteModeInput({
        form,
        selectedBot,
        directoryUsers,
        mode,
      });
      await persistMode(modes, mode, input);
      onSaved();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  }, [directoryUsers, form, mode, modes, onSaved, selectedBot]);

  return (
    <View style={styles.editor}>
      <SettingsSection title={mode ? "编辑替身模式" : "创建替身模式"}>
        <View style={styles.form}>
          <View style={styles.switchRow}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>启用替身模式</Text>
              <Text style={settingsStyles.rowHint}>仅在时间、名单和问题类型规则均通过时回答。</Text>
            </View>
            <Switch
              value={form.enabled}
              onValueChange={controller.setEnabled}
              accessibilityLabel="启用替身模式"
            />
          </View>
          <Field label="名称">
            <FormTextInput
              value={form.name}
              onChangeText={controller.setName}
              placeholder="例如：工作时间替身"
            />
          </Field>
          <SelectField
            label="飞书机器人"
            value={form.botId}
            selectedDisplay={optionDisplay(botOptions, form.botId)}
            options={botOptions}
            onChange={controller.setBotId}
            placeholder="选择飞书机器人"
            emptyText="暂无可用飞书机器人"
          />
          <LarkUserDirectoryField
            label="被替身用户"
            hint="通过邮箱选择用户，保存用户名、邮箱和 ou_xxx。"
            appId={selectedBot?.appId ?? ""}
            openIds={selectedOpenIds}
            users={directoryUsers}
            resolveUsers={resolveDirectoryUsers}
            onChange={controller.setOpenIds}
            disabled={!selectedBot?.appId}
          />
          <Field label="私聊回答身份" hint="私聊固定使用当前 OAuth 用户身份。">
            <FormTextInput value="用户身份" editable={false} />
          </Field>
          <SelectField
            label="群聊回答身份"
            value={form.groupReplyIdentity}
            selectedDisplay={optionDisplay(GROUP_REPLY_IDENTITY_OPTIONS, form.groupReplyIdentity)}
            options={GROUP_REPLY_IDENTITY_OPTIONS}
            onChange={controller.setGroupReplyIdentity}
            placeholder="选择回答身份"
            emptyText="暂无回答身份"
          />
          <View style={styles.switchRow}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>携带机器人回答提示</Text>
              <Text style={settingsStyles.rowHint}>关闭后会移除模型自行生成的替身提示。</Text>
            </View>
            <Switch
              value={form.disclosureEnabled}
              onValueChange={controller.setDisclosureEnabled}
              accessibilityLabel="携带机器人回答提示"
            />
          </View>
          {form.disclosureEnabled ? (
            <Field label="回答提示">
              <FormTextInput
                value={form.disclosurePrompt}
                onChangeText={controller.setDisclosurePrompt}
                placeholder="【机器人代答】"
              />
            </Field>
          ) : null}
          <Field label="替身提示词" hint="作为该替身模式的附加系统要求发送给 Agent。">
            <FormTextInput
              value={form.customPrompt}
              onChangeText={controller.setCustomPrompt}
              placeholder="例如：只回答工作相关问题，避免代替用户做承诺。"
              multiline
            />
          </Field>
          <Field label="自动回答延迟（秒）" hint="延迟期间的新消息会替换旧消息，以最后一条为准。">
            <FormTextInput
              value={form.delaySeconds}
              onChangeText={controller.setDelaySeconds}
              keyboardType="number-pad"
            />
          </Field>
          <Text style={settingsStyles.rowTitle}>生效时间段（留空表示全天）</Text>
          <View style={styles.inlineFields}>
            <Field label="星期">
              <FormTextInput
                value={form.weekdays}
                onChangeText={controller.setWeekdays}
                placeholder="1,2,3,4,5；0 表示周日"
              />
            </Field>
            <Field label="开始时间">
              <FormTextInput
                value={form.startTime}
                onChangeText={controller.setStartTime}
                placeholder="09:00"
              />
            </Field>
            <Field label="结束时间">
              <FormTextInput
                value={form.endTime}
                onChangeText={controller.setEndTime}
                placeholder="18:00"
              />
            </Field>
            <Field label="时区">
              <FormTextInput value={form.timezone} onChangeText={controller.setTimezone} />
            </Field>
          </View>
          <Field
            label="白名单"
            hint="每行一条：用户|名称|邮箱|ou_xxx；群|名称|群ID|oc_xxx；群正则|表达式；问题类型|自然语言描述。配置身份规则时必须命中一条。"
          >
            <FormTextInput
              value={form.allowlist}
              onChangeText={controller.setAllowlist}
              multiline
              placeholder={
                "用户|张三|zhangsan@example.com|ou_xxx\n群正则|^研发.*\n问题类型|研发和代码问题"
              }
            />
          </Field>
          <Field
            label="黑名单"
            hint="格式与白名单相同；黑名单优先。问题类型由 Agent 进行语义匹配。"
          >
            <FormTextInput
              value={form.denylist}
              onChangeText={controller.setDenylist}
              multiline
              placeholder={"群|闲聊群|group_id|oc_xxx\n问题类型|人事和薪酬问题"}
            />
          </Field>
          <SelectField
            label="模型提供方"
            value={form.provider}
            selectedDisplay={optionDisplay(providerOptionList, form.provider)}
            options={providerOptionList}
            onChange={controller.setProvider}
            placeholder="选择模型提供方"
            emptyText="暂无可用模型提供方"
            searchable
          />
          <SelectField
            label="模型"
            value={form.model}
            selectedDisplay={optionDisplay(modelOptionList, form.model)}
            options={modelOptionList}
            onChange={controller.setModel}
            placeholder="选择模型"
            emptyText="该提供方暂无模型"
            searchable
            disabled={!form.provider}
          />
          <SelectField
            label="助手或团队"
            value={form.targetSelection}
            selectedDisplay={optionDisplay(targetOptions, form.targetSelection)}
            options={targetOptions}
            onChange={controller.setTargetSelection}
            placeholder="选择助手或团队"
            emptyText="暂无助手或团队"
            searchable
          />
          <SelectField
            label="项目"
            value={form.cwd || null}
            selectedDisplay={optionDisplay(projectOptionList, form.cwd || null)}
            options={projectOptionList}
            onChange={controller.setCwd}
            placeholder="选择项目"
            emptyText="暂无可用项目"
            searchable
          />
          {formError ? <Text style={settingsStyles.rowError}>{formError}</Text> : null}
          <Button
            variant="default"
            onPress={handleSave}
            loading={modes.isMutating}
            disabled={modes.isMutating}
          >
            {mode ? "保存修改" : "创建替身模式"}
          </Button>
        </View>
      </SettingsSection>
      {selectedBot?.appId ? (
        <LarkUserOAuthCard serverId={serverId} appId={selectedBot.appId} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  editor: {
    gap: theme.spacing[6],
  },
  form: {
    gap: theme.spacing[4],
  },
  switchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[3],
  },
  inlineFields: {
    gap: theme.spacing[3],
  },
}));
