import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  LarkChannelBotStatus,
  LarkDirectory,
  LarkDirectoryChat,
  LarkDirectoryUser,
  LarkSubstituteMode,
} from "@getpaseo/protocol/messages";
import { DEFAULT_LARK_SUBSTITUTE_CUSTOM_PROMPT } from "@getpaseo/protocol/messages";
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
import { registerProjectDescriptor } from "@/hooks/open-project";
import { useProjects } from "@/hooks/use-projects";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useTeams } from "@/hooks/use-teams";
import { LarkUserOAuthCard } from "@/projects/lark/lark-user-oauth-card";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useHostFeature } from "@/runtime/host-features";
import { SettingsSection } from "@/screens/settings/settings-section";
import { useSessionStore } from "@/stores/session-store";
import { settingsStyles } from "@/styles/settings";
import {
  buildSubstituteModeInput,
  createSubstituteModeFormState,
  getLarkBotLabel,
  type LarkSubstituteModeFormState,
  TARGET_ASSISTANT_PREFIX,
  TARGET_TEAM_PREFIX,
  TARGET_WORKSPACE,
} from "./lark-substitute-mode-form-model";
import {
  LarkSubstituteAudienceRuleListEditor,
  LarkSubstituteQuestionRuleListEditor,
} from "./lark-substitute-rule-list-editor";
import {
  resolveSubstituteModeProject,
  rollbackSubstituteModeProject,
} from "./lark-substitute-mode-project";
import { useLarkSubstituteModes } from "./use-lark-substitute-modes";
import { WeekdayMultiSelectField } from "./weekday-multi-select-field";

const EMPTY_USERS: LarkDirectoryUser[] = [];
const EMPTY_CHATS: LarkDirectoryChat[] = [];

function getDirectoryUsers(directory: LarkDirectory | null): LarkDirectoryUser[] {
  return directory ? directory.users : EMPTY_USERS;
}

function getDirectoryChats(directory: LarkDirectory | null): LarkDirectoryChat[] {
  return directory ? directory.chats : EMPTY_CHATS;
}

function getBotAppId(bot: LarkChannelBotStatus | null): string {
  return bot ? (bot.appId ?? "") : "";
}

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
  const setGroupScanEnabled = useCallback(
    (value: boolean) => updateField("groupScanEnabled", value),
    [updateField],
  );
  const setGroupScanIntervalMinutes = useCallback(
    (value: string) => updateField("groupScanIntervalMinutes", value),
    [updateField],
  );
  const setGroupScanLookbackMinutes = useCallback(
    (value: string) => updateField("groupScanLookbackMinutes", value),
    [updateField],
  );
  const setGroupScanExcludeRecentMinutes = useCallback(
    (value: string) => updateField("groupScanExcludeRecentMinutes", value),
    [updateField],
  );
  const setPrivateScanEnabled = useCallback(
    (value: boolean) => updateField("privateScanEnabled", value),
    [updateField],
  );
  const setPrivateScanIntervalMinutes = useCallback(
    (value: string) => updateField("privateScanIntervalMinutes", value),
    [updateField],
  );
  const setPrivateScanLookbackMinutes = useCallback(
    (value: string) => updateField("privateScanLookbackMinutes", value),
    [updateField],
  );
  const setPrivateScanExcludeRecentMinutes = useCallback(
    (value: string) => updateField("privateScanExcludeRecentMinutes", value),
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
  const setWeekdays = useCallback(
    (value: number[]) => updateField("weekdays", value),
    [updateField],
  );
  const setStartTime = useCallback(
    (value: string) => updateField("startTime", value),
    [updateField],
  );
  const setEndTime = useCallback((value: string) => updateField("endTime", value), [updateField]);
  const setTimezone = useCallback((value: string) => updateField("timezone", value), [updateField]);
  const setAudienceAllowlist = useCallback(
    (value: LarkSubstituteModeFormState["audienceAllowlist"]) =>
      updateField("audienceAllowlist", value),
    [updateField],
  );
  const setAudienceDenylist = useCallback(
    (value: LarkSubstituteModeFormState["audienceDenylist"]) =>
      updateField("audienceDenylist", value),
    [updateField],
  );
  const setQuestionAllowlist = useCallback(
    (value: LarkSubstituteModeFormState["questionAllowlist"]) =>
      updateField("questionAllowlist", value),
    [updateField],
  );
  const setQuestionDenylist = useCallback(
    (value: LarkSubstituteModeFormState["questionDenylist"]) =>
      updateField("questionDenylist", value),
    [updateField],
  );
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
    setGroupScanEnabled,
    setGroupScanIntervalMinutes,
    setGroupScanLookbackMinutes,
    setGroupScanExcludeRecentMinutes,
    setPrivateScanEnabled,
    setPrivateScanIntervalMinutes,
    setPrivateScanLookbackMinutes,
    setPrivateScanExcludeRecentMinutes,
    setDisclosureEnabled,
    setDisclosurePrompt,
    setCustomPrompt,
    setDelaySeconds,
    setWeekdays,
    setStartTime,
    setEndTime,
    setTimezone,
    setAudienceAllowlist,
    setAudienceDenylist,
    setQuestionAllowlist,
    setQuestionDenylist,
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
  resolveDirectoryChats,
  mode,
  onSaved,
}: {
  serverId: string;
  bots: LarkChannelBotStatus[];
  directory: LarkDirectory | null;
  resolveDirectoryUsers: (appId: string, emails: string[]) => Promise<LarkDirectoryUser[]>;
  resolveDirectoryChats: (appId: string, query: string) => Promise<LarkDirectoryChat[]>;
  mode?: LarkSubstituteMode | null;
  onSaved: () => void;
}) {
  const modes = useLarkSubstituteModes(serverId);
  const client = useHostRuntimeClient(serverId);
  const assistants = useAssistants(serverId);
  const supportsTeams = useHostFeature(serverId, "teams");
  const supportsDirectorylessProjects = useHostFeature(serverId, "projectCreateDirectoryless");
  const teams = useTeams(serverId, { enabled: supportsTeams });
  const providers = useProvidersSnapshot(serverId);
  const { projects } = useProjects();
  const controller = useSubstituteModeForm(mode, bots);
  const { form, setCwd } = controller;
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const upsertProject = useSessionStore((state) => state.upsertProject);
  const removeProject = useSessionStore((state) => state.removeProject);
  const setHasHydratedWorkspaces = useSessionStore((state) => state.setHasHydratedWorkspaces);
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
  const directoryUsers = getDirectoryUsers(directory);
  const directoryChats = getDirectoryChats(directory);
  const selectedBotAppId = getBotAppId(selectedBot);
  const ruleEditingDisabled = !selectedBotAppId;

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setFormError(null);
    setIsSaving(true);
    let createdProjectId: string | null = null;
    let createdProjectCwd: string | null = null;
    try {
      const baseInput = buildSubstituteModeInput({
        form,
        selectedBot,
        mode,
      });
      const project = await resolveSubstituteModeProject({
        name: form.name,
        cwd: form.cwd,
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
      });
      createdProjectId = project.createdProjectId;
      createdProjectCwd = project.createdProjectId ? project.cwd : null;
      await persistMode(modes, mode, {
        ...baseInput,
        target: {
          ...baseInput.target,
          cwd: project.cwd,
        },
      });
      onSaved();
    } catch (error) {
      const rolledBack = await rollbackSubstituteModeProject({
        projectId: createdProjectId,
        client,
        unregisterProject: (projectId) => removeProject(serverId, projectId),
      });
      if (!rolledBack && createdProjectCwd) {
        setCwd(createdProjectCwd);
      }
      const message = error instanceof Error ? error.message : String(error);
      setFormError(
        rolledBack ? message : `${message}；自动创建的 Project 回滚失败，已保留并填入项目选项`,
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    client,
    form,
    isSaving,
    mode,
    modes,
    onSaved,
    removeProject,
    selectedBot,
    serverId,
    setCwd,
    setHasHydratedWorkspaces,
    supportsDirectorylessProjects,
    upsertProject,
  ]);

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
          <Field
            label="回答身份"
            hint="替身用户固定为下方 OAuth 授权用户；群聊和私聊转发群均由机器人在话题中回答。"
          >
            <FormTextInput value="机器人身份" editable={false} />
          </Field>
          <View style={settingsStyles.card}>
            <View style={settingsStyles.row}>
              <View style={settingsStyles.rowContent}>
                <Text style={settingsStyles.rowTitle}>主动监听群消息</Text>
                <Text style={settingsStyles.rowHint}>
                  机器人在群内时，实时监听并处理 @ 授权替身用户的消息。
                </Text>
              </View>
              <Text style={styles.enabledStatus}>已启用</Text>
            </View>
          </View>
          <View style={styles.switchRow}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>定时扫描群消息</Text>
              <Text style={settingsStyles.rowHint}>
                扫描机器人已知或名单指定的群，补偿实时监听期间遗漏的 @ 替身用户消息。
              </Text>
            </View>
            <Switch
              value={form.groupScanEnabled}
              onValueChange={controller.setGroupScanEnabled}
              accessibilityLabel="定时扫描群消息"
            />
          </View>
          {form.groupScanEnabled ? (
            <View style={styles.inlineFields}>
              <Field label="群聊扫描间隔（分钟）">
                <FormTextInput
                  value={form.groupScanIntervalMinutes}
                  onChangeText={controller.setGroupScanIntervalMinutes}
                  keyboardType="number-pad"
                />
              </Field>
              <Field label="群聊扫描范围（分钟）">
                <FormTextInput
                  value={form.groupScanLookbackMinutes}
                  onChangeText={controller.setGroupScanLookbackMinutes}
                  keyboardType="number-pad"
                />
              </Field>
              <Field label="群聊排除最近（分钟）">
                <FormTextInput
                  value={form.groupScanExcludeRecentMinutes}
                  onChangeText={controller.setGroupScanExcludeRecentMinutes}
                  keyboardType="number-pad"
                />
              </Field>
            </View>
          ) : null}
          <View style={styles.switchRow}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>定时扫描新增私聊消息</Text>
              <Text style={settingsStyles.rowHint}>
                授权用户未回复时，补偿扫描遗漏的私聊，并创建或复用包含授权用户、机器人和私聊用户的群聊。
              </Text>
            </View>
            <Switch
              value={form.privateScanEnabled}
              onValueChange={controller.setPrivateScanEnabled}
              accessibilityLabel="扫描新增私聊消息"
            />
          </View>
          {form.privateScanEnabled ? (
            <View style={styles.inlineFields}>
              <Field label="扫描间隔（分钟）">
                <FormTextInput
                  value={form.privateScanIntervalMinutes}
                  onChangeText={controller.setPrivateScanIntervalMinutes}
                  keyboardType="number-pad"
                />
              </Field>
              <Field label="扫描范围（分钟）">
                <FormTextInput
                  value={form.privateScanLookbackMinutes}
                  onChangeText={controller.setPrivateScanLookbackMinutes}
                  keyboardType="number-pad"
                />
              </Field>
              <Field label="排除最近（分钟）">
                <FormTextInput
                  value={form.privateScanExcludeRecentMinutes}
                  onChangeText={controller.setPrivateScanExcludeRecentMinutes}
                  keyboardType="number-pad"
                />
              </Field>
            </View>
          ) : null}
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
              placeholder={DEFAULT_LARK_SUBSTITUTE_CUSTOM_PROMPT}
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
            <WeekdayMultiSelectField value={form.weekdays} onChange={controller.setWeekdays} />
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
          <LarkSubstituteAudienceRuleListEditor
            label="用户/群白名单"
            hint="配置后必须命中至少一条。支持用户、群、群 AI 分类、全部和群名称正则表达式。"
            rules={form.audienceAllowlist}
            appId={selectedBotAppId}
            users={directoryUsers}
            chats={directoryChats}
            resolveUsers={resolveDirectoryUsers}
            resolveChats={resolveDirectoryChats}
            disabled={ruleEditingDisabled}
            onChange={controller.setAudienceAllowlist}
          />
          <LarkSubstituteAudienceRuleListEditor
            label="用户/群黑名单"
            hint="命中任意一条即不回答，优先级高于用户/群白名单。"
            rules={form.audienceDenylist}
            appId={selectedBotAppId}
            users={directoryUsers}
            chats={directoryChats}
            resolveUsers={resolveDirectoryUsers}
            resolveChats={resolveDirectoryChats}
            disabled={ruleEditingDisabled}
            onChange={controller.setAudienceDenylist}
          />
          <LarkSubstituteQuestionRuleListEditor
            label="问题白名单"
            hint="配置后问题必须由 Agent 语义判断命中至少一条。"
            rules={form.questionAllowlist}
            onChange={controller.setQuestionAllowlist}
          />
          <LarkSubstituteQuestionRuleListEditor
            label="问题黑名单"
            hint="Agent 语义判断命中任意一条即不回答，优先级高于问题白名单。"
            rules={form.questionDenylist}
            onChange={controller.setQuestionDenylist}
          />
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
          <Text style={settingsStyles.rowHint}>
            不选择项目时，将使用替身模式名称自动创建并绑定一个 Project。
          </Text>
          {formError ? <Text style={settingsStyles.rowError}>{formError}</Text> : null}
          <Button
            variant="default"
            onPress={handleSave}
            loading={isSaving || modes.isMutating}
            disabled={isSaving || modes.isMutating}
          >
            {mode ? "保存修改" : "创建替身模式"}
          </Button>
        </View>
      </SettingsSection>
      {selectedBotAppId ? <LarkUserOAuthCard serverId={serverId} appId={selectedBotAppId} /> : null}
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
  enabledStatus: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
