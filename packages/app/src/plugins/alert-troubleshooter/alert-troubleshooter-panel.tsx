/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Dynamic group rows and identity selectors bind to the active Project draft. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { ClipboardList, Play, Plus, Save, Trash2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { ZodType } from "zod";
import {
  ALERT_TROUBLESHOOTER_PROMPT_VARIABLES,
  type AlertTroubleshooterChat,
  type AlertTroubleshooterConfig,
  type AlertTroubleshooterRuntime,
  type AlertTroubleshooterTarget,
  type PluginAppDefinition,
  type PluginSummary,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SelectField } from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { useAssistants } from "@/hooks/use-assistants";
import { useTeams } from "@/hooks/use-teams";
import {
  PluginProjectBoundary,
  type PluginProjectContext,
} from "@/plugins/project/plugin-project-boundary";
import { PluginProjectDefaultAgentField } from "@/plugins/project/plugin-project-default-agent-field";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { LarkChatDirectoryField } from "@/screens/settings/channels/lark-directory-fields";
import { formatLarkChatIdentity } from "@/screens/settings/channels/lark-directory-format";
import { useLarkChannel } from "@/screens/settings/channels/use-lark-channel";
import { validateAlertTroubleshooterConfig } from "./alert-troubleshooter-form-validation";
import { AlertTroubleshooterTaskListPage } from "./alert-troubleshooter-task-list-page";

const DEFAULT_CONFIG: Omit<
  AlertTroubleshooterConfig,
  "bot" | "botId" | "chats" | "troubleshootingSopDoc" | "attributionRecordRoot"
> = {
  version: 4,
  enabled: true,
  listenEnabled: true,
  troubleshootingEnabled: true,
  autoArchiveAgents: false,
  target: { kind: "default" },
  promptTemplate: "",
  queuePollIntervalMinutes: 5,
  schedule: {
    enabled: true,
    intervalMinutes: 30,
    lookbackMinutes: 120,
    excludeRecentMinutes: 0,
  },
};

export interface AlertTroubleshooterPanelSpec {
  pluginId: string;
  appId: string;
  configDataKey: string;
  runtimeDataKey: string;
  productName: string;
  manualDebugSelector?: "uniqueId" | "resultId";
  allowCustomBot?: boolean;
  allowAgentAutoArchive?: boolean;
  configSchema: ZodType<AlertTroubleshooterConfig>;
  runtimeSchema: ZodType<AlertTroubleshooterRuntime>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function targetId(target: AlertTroubleshooterTarget): string | null {
  if (target.kind === "assistant") return target.assistantId;
  if (target.kind === "team") return target.teamId;
  return null;
}

// oxlint-disable-next-line complexity -- Coordinates the Project-scoped Lark, identity, schedule, and persistence form.
function AlertTroubleshooterProject({
  active,
  serverId,
  spec,
  project,
}: {
  active: boolean;
  serverId: string;
  spec: AlertTroubleshooterPanelSpec;
  project: PluginProjectContext;
}) {
  const client = useHostRuntimeClient(serverId);
  const channel = useLarkChannel(serverId, { enabled: active });
  const assistants = useAssistants(serverId, { enabled: active });
  const supportsTeams = useHostFeature(serverId, "teams");
  const teams = useTeams(serverId, { enabled: active && supportsTeams });
  const initialConfig = spec.configSchema.safeParse(project.data[spec.configDataKey]);
  const [enabled, setEnabled] = useState(initialConfig.success ? initialConfig.data.enabled : true);
  const [listenEnabled, setListenEnabled] = useState(
    initialConfig.success ? initialConfig.data.listenEnabled : true,
  );
  const [troubleshootingEnabled, setTroubleshootingEnabled] = useState(
    initialConfig.success ? initialConfig.data.troubleshootingEnabled : true,
  );
  const [autoArchiveAgents, setAutoArchiveAgents] = useState(
    initialConfig.success ? initialConfig.data.autoArchiveAgents : false,
  );
  const [botId, setBotId] = useState(initialConfig.success ? initialConfig.data.botId : "");
  const [botKind, setBotKind] = useState<"existing" | "custom">(
    initialConfig.success ? initialConfig.data.bot.kind : "existing",
  );
  const [customBotAppId, setCustomBotAppId] = useState(
    initialConfig.success && initialConfig.data.bot.kind === "custom"
      ? initialConfig.data.bot.appId
      : "",
  );
  const [customBotAppSecret, setCustomBotAppSecret] = useState("");
  const [customBotHasAppSecret, setCustomBotHasAppSecret] = useState(
    initialConfig.success &&
      initialConfig.data.bot.kind === "custom" &&
      initialConfig.data.bot.hasAppSecret,
  );
  const [chats, setChats] = useState<AlertTroubleshooterChat[]>(
    initialConfig.success ? initialConfig.data.chats : [],
  );
  const [pendingChatId, setPendingChatId] = useState("");
  const [target, setTarget] = useState<AlertTroubleshooterTarget>(
    initialConfig.success ? initialConfig.data.target : DEFAULT_CONFIG.target,
  );
  const [agent, setAgent] = useState(project.defaultAgent);
  const [sopDoc, setSopDoc] = useState(
    initialConfig.success ? initialConfig.data.troubleshootingSopDoc : "",
  );
  const [recordRoot, setRecordRoot] = useState(
    initialConfig.success ? initialConfig.data.attributionRecordRoot : "",
  );
  const [promptTemplate, setPromptTemplate] = useState(
    initialConfig.success ? initialConfig.data.promptTemplate : "",
  );
  const [queuePollIntervalMinutes, setQueuePollIntervalMinutes] = useState(
    String(initialConfig.success ? initialConfig.data.queuePollIntervalMinutes : 5),
  );
  const [debugRecordValue, setDebugRecordValue] = useState("");
  const [queueingRecord, setQueueingRecord] = useState(false);
  const [queuedRecord, setQueuedRecord] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(
    initialConfig.success ? initialConfig.data.schedule.enabled : true,
  );
  const [intervalMinutes, setIntervalMinutes] = useState(
    String(initialConfig.success ? initialConfig.data.schedule.intervalMinutes : 30),
  );
  const [lookbackMinutes, setLookbackMinutes] = useState(
    String(initialConfig.success ? initialConfig.data.schedule.lookbackMinutes : 120),
  );
  const [excludeRecentMinutes, setExcludeRecentMinutes] = useState(
    String(initialConfig.success ? initialConfig.data.schedule.excludeRecentMinutes : 0),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = channel.status;
  const botOptions = useMemo(
    () =>
      (status?.bots ?? []).map((bot) => ({
        id: bot.id,
        value: bot.id,
        label: bot.name ?? bot.bot?.name ?? bot.id,
        description: bot.appId ?? undefined,
      })),
    [status?.bots],
  );
  const selectedBot = useMemo(
    () => status?.bots.find((bot) => bot.id === botId) ?? null,
    [botId, status?.bots],
  );
  const directoryChats = useMemo(() => status?.directory?.chats ?? [], [status?.directory?.chats]);
  const selectedBotDisplay = useMemo(() => {
    const option = botOptions.find((candidate) => candidate.value === botId);
    return option ? { label: option.label, description: option.description } : null;
  }, [botId, botOptions]);
  const assistantOptions = useMemo(
    () =>
      assistants.assistants.map((assistant) => ({
        id: assistant.id,
        value: assistant.id,
        label: assistant.name,
        description: assistant.description || assistant.id,
      })),
    [assistants.assistants],
  );
  const teamOptions = useMemo(
    () =>
      teams.teams.map((team) => ({
        id: team.id,
        value: team.id,
        label: team.name,
        description: team.id,
      })),
    [teams.teams],
  );
  const identityOptions = useMemo(
    () => [
      { value: "default" as const, label: "不指定" },
      { value: "assistant" as const, label: "助手" },
      { value: "team" as const, label: "团队", disabled: !supportsTeams },
    ],
    [supportsTeams],
  );
  const runtime = spec.runtimeSchema.safeParse(project.data[spec.runtimeDataKey]);
  const debugByResultId = spec.manualDebugSelector === "resultId";

  useEffect(() => {
    if (botKind !== "existing" || botId || !status?.activeBotId) return;
    setBotId(status.activeBotId);
  }, [botId, botKind, status?.activeBotId]);

  const addChat = useCallback(() => {
    if (!pendingChatId || chats.some((chat) => chat.chatId === pendingChatId)) return;
    const directoryChat = directoryChats.find(
      (chat) => chat.appId === selectedBot?.appId && chat.chatId === pendingChatId,
    );
    setChats((current) => [
      ...current,
      {
        chatId: pendingChatId,
        ...(directoryChat?.name ? { name: directoryChat.name } : {}),
        ...(directoryChat?.groupId ? { groupId: directoryChat.groupId } : {}),
      },
    ]);
    setPendingChatId("");
  }, [chats, directoryChats, pendingChatId, selectedBot?.appId]);

  const removeChat = useCallback((chatId: string) => {
    setChats((current) => current.filter((chat) => chat.chatId !== chatId));
  }, []);

  const changeTargetKind = useCallback(
    (kind: AlertTroubleshooterTarget["kind"]) => {
      if (kind === "assistant") {
        setTarget({ kind, assistantId: assistants.assistants[0]?.id ?? "" });
      } else if (kind === "team") {
        setTarget({ kind, teamId: teams.teams[0]?.id ?? "" });
      } else {
        setTarget({ kind });
      }
    },
    [assistants.assistants, teams.teams],
  );

  const save = useCallback(async () => {
    if (!client) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const provider = agent.provider.trim();
      const model = agent.model.trim();
      if (!provider || !model) {
        setError("请选择排查 Provider 和模型");
        return;
      }
      const validation = validateAlertTroubleshooterConfig(spec.configSchema, {
        enabled,
        listenEnabled,
        troubleshootingEnabled,
        autoArchiveAgents,
        botId,
        botKind,
        customBotAppId,
        customBotCredentialId: project.projectId,
        customBotHasAppSecret: customBotHasAppSecret || !!customBotAppSecret.trim(),
        chats,
        target,
        troubleshootingSopDoc: sopDoc,
        attributionRecordRoot: recordRoot,
        promptTemplate,
        queuePollIntervalMinutes,
        schedule: {
          enabled: scheduleEnabled,
          intervalMinutes,
          lookbackMinutes,
          excludeRecentMinutes,
        },
      });
      if (!validation.success) {
        setError(validation.message);
        return;
      }
      const response = await client.configurePluginApp({
        pluginId: spec.pluginId,
        appId: spec.appId,
        projectId: project.projectId,
        defaultAgent: { provider, model },
        data: { [spec.configDataKey]: validation.config },
        ...(botKind === "custom" && customBotAppSecret.trim()
          ? { credentials: { bambooBotAppSecret: customBotAppSecret.trim() } }
          : {}),
      });
      if (response.error || !response.app) throw new Error(response.error ?? "保存配置失败");
      if (botKind === "custom" && customBotAppSecret.trim()) {
        setCustomBotHasAppSecret(true);
        setCustomBotAppSecret("");
      }
      setSaved(true);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }, [
    agent,
    autoArchiveAgents,
    botId,
    botKind,
    chats,
    client,
    customBotAppId,
    customBotAppSecret,
    customBotHasAppSecret,
    enabled,
    excludeRecentMinutes,
    intervalMinutes,
    listenEnabled,
    lookbackMinutes,
    promptTemplate,
    project.projectId,
    recordRoot,
    queuePollIntervalMinutes,
    scheduleEnabled,
    sopDoc,
    spec,
    target,
    troubleshootingEnabled,
  ]);

  const enqueueDebugRecord = useCallback(async () => {
    if (!client) return;
    const value = debugRecordValue.trim();
    if (!value) {
      setError(debugByResultId ? "请输入 Bamboo result_id" : "请输入多维表格 unique_id");
      return;
    }
    setQueueingRecord(true);
    setQueuedRecord(null);
    setError(null);
    try {
      const response = await client.enqueueAlertTroubleshooterRecord({
        pluginId: spec.pluginId,
        appId: spec.appId,
        projectId: project.projectId,
        ...(debugByResultId ? { resultId: value } : { uniqueId: value }),
      });
      if (response.error || !response.queued) {
        throw new Error(response.error ?? "加入处理队列失败");
      }
      setQueuedRecord(debugByResultId ? (response.resultId ?? value) : response.uniqueId);
    } catch (queueError) {
      setError(errorMessage(queueError));
    } finally {
      setQueueingRecord(false);
    }
  }, [client, debugByResultId, debugRecordValue, project.projectId, spec.appId, spec.pluginId]);

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.heading}>自动排查项目</Text>
            <Text style={styles.description}>
              统一控制 {spec.productName} 消息入表、队列和异步排查。
            </Text>
          </View>
          <Switch value={enabled} onValueChange={setEnabled} accessibilityLabel="启用自动排查" />
        </View>
        {spec.allowCustomBot ? (
          <Field label="机器人来源">
            <SegmentedControl
              value={botKind}
              onValueChange={(value) => setBotKind(value)}
              options={[
                { value: "existing", label: "已有机器人" },
                { value: "custom", label: "自定义机器人" },
              ]}
            />
          </Field>
        ) : null}
        {botKind === "existing" ? (
          <SelectField
            label="飞书机器人"
            value={botId || null}
            selectedDisplay={selectedBotDisplay}
            options={botOptions}
            onChange={setBotId}
            placeholder="选择机器人"
            emptyText="请先在渠道中配置飞书机器人"
          />
        ) : (
          <>
            <Field
              label="自定义机器人 App ID"
              hint="该机器人只保存于当前 Bamboo 对账项目，不会出现在渠道聊天、替身或提醒中。"
            >
              <FormTextInput
                value={customBotAppId}
                onChangeText={setCustomBotAppId}
                autoCapitalize="none"
                placeholder="cli_xxx"
              />
            </Field>
            <Field
              label="自定义机器人 App Secret"
              hint={
                customBotHasAppSecret
                  ? "已配置。留空将保留原 App Secret。"
                  : "首次配置必须填写，保存后不会回显。"
              }
            >
              <FormTextInput
                value={customBotAppSecret}
                onChangeText={setCustomBotAppSecret}
                autoCapitalize="none"
                secureTextEntry
                placeholder={customBotHasAppSecret ? "留空保留现有密钥" : "输入 App Secret"}
              />
            </Field>
          </>
        )}
        <View style={styles.toggleRow}>
          <View style={styles.flex}>
            <Text style={styles.label}>群消息监听</Text>
            <Text style={styles.description}>实时监听报警消息，写入多维表格和本地队列。</Text>
          </View>
          <Switch
            value={listenEnabled}
            onValueChange={setListenEnabled}
            accessibilityLabel="启用群消息监听"
          />
        </View>
        <LarkChatDirectoryField
          label="添加监听群"
          hint={
            botKind === "custom"
              ? "自定义机器人请输入 oc_xxx；一个项目可监听多个群。"
              : "支持按群名称或 oc_xxx 搜索；一个项目可监听多个群。"
          }
          appId={botKind === "existing" ? (selectedBot?.appId ?? "") : customBotAppId.trim()}
          chatId={pendingChatId}
          chats={directoryChats}
          onChange={setPendingChatId}
          resolveChats={channel.resolveDirectoryChats}
          allowDirectChatId={botKind === "custom"}
        />
        <Button variant="outline" leftIcon={Plus} disabled={!pendingChatId} onPress={addChat}>
          添加监听群
        </Button>
        {chats.map((chat) => (
          <View key={chat.chatId} style={styles.chatRow}>
            <Text selectable style={styles.chatText}>
              {formatLarkChatIdentity({ name: chat.name ?? "飞书群", chatId: chat.chatId })}
            </Text>
            <Button
              size="xs"
              variant="ghost"
              leftIcon={Trash2}
              onPress={() => removeChat(chat.chatId)}
            >
              删除
            </Button>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>排查上下文</Text>
        <Field label="排查 SOP 飞书文档链接">
          <FormTextInput
            value={sopDoc}
            onChangeText={setSopDoc}
            placeholder="https://.../wiki/..."
          />
        </Field>
        <Field label="归因记录根目录" hint="系统会在该目录下一层按日期自动创建或复用日报多维表格。">
          <FormTextInput
            value={recordRoot}
            onChangeText={setRecordRoot}
            placeholder="https://.../wiki/..."
          />
        </Field>
        <PluginProjectDefaultAgentField
          active={active}
          serverId={serverId}
          cwd={project.sourceDirectory}
          value={agent}
          onChange={setAgent}
          disabled={saving}
          label="排查 Provider 和模型（必填）"
          hint="为当前自动排查项目指定实际使用的 Provider 和模型，不再只能沿用已有默认模型。"
        />
        <Field label="执行主体（选填）" hint="可不指定，或在助手和团队中选择一个。">
          <SegmentedControl
            value={target.kind}
            onValueChange={changeTargetKind}
            options={identityOptions}
          />
        </Field>
        {target.kind === "assistant" ? (
          <SelectField
            label="助手"
            value={targetId(target)}
            selectedDisplay={
              assistantOptions.find((option) => option.value === target.assistantId) ?? null
            }
            options={assistantOptions}
            onChange={(assistantId) => setTarget({ kind: "assistant", assistantId })}
            placeholder="选择助手"
            emptyText="暂无助手"
          />
        ) : null}
        {target.kind === "team" ? (
          <SelectField
            label="团队"
            value={targetId(target)}
            selectedDisplay={teamOptions.find((option) => option.value === target.teamId) ?? null}
            options={teamOptions}
            onChange={(teamId) => setTarget({ kind: "team", teamId })}
            placeholder="选择团队"
            emptyText="暂无团队"
          />
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.heading}>定时补偿扫描</Text>
            <Text style={styles.description}>按照回看范围和排除最近消息配置，定时扫描群消息。</Text>
          </View>
          <Switch
            value={scheduleEnabled}
            onValueChange={setScheduleEnabled}
            accessibilityLabel="启用定时扫描"
          />
        </View>
        <Field label="扫描间隔（分钟）">
          <FormTextInput
            value={intervalMinutes}
            onChangeText={setIntervalMinutes}
            keyboardType="number-pad"
          />
        </Field>
        <Field label="回看范围（分钟）">
          <FormTextInput
            value={lookbackMinutes}
            onChangeText={setLookbackMinutes}
            keyboardType="number-pad"
          />
        </Field>
        <Field label="排除最近消息（分钟）">
          <FormTextInput
            value={excludeRecentMinutes}
            onChangeText={setExcludeRecentMinutes}
            keyboardType="number-pad"
          />
        </Field>
        {runtime.success ? (
          <Text style={styles.meta}>
            运行状态：{runtime.data.status}
            {runtime.data.lastScanFinishedAt
              ? ` · 最近完成：${runtime.data.lastScanFinishedAt}`
              : ""}
            {runtime.data.lastError ? ` · 错误：${runtime.data.lastError}` : ""}
            {` · 队列：${runtime.data.queuedCount}`}
            {runtime.data.activeRecordId ? ` · 当前记录：${runtime.data.activeRecordId}` : ""}
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.heading}>异步排查</Text>
            <Text style={styles.description}>
              从本地队列逐条处理；队列为空时定时认领多维表格中的未认领记录。Bamboo
              任务失败后也按该间隔重试，最多自动重试 3 次。
            </Text>
          </View>
          <Switch
            value={troubleshootingEnabled}
            onValueChange={setTroubleshootingEnabled}
            accessibilityLabel="启用异步排查"
          />
        </View>
        <Field label="队列轮询/失败重试间隔（分钟）">
          <FormTextInput
            value={queuePollIntervalMinutes}
            onChangeText={setQueuePollIntervalMinutes}
            keyboardType="number-pad"
          />
        </Field>
        {spec.allowAgentAutoArchive ? (
          <View style={styles.toggleRow}>
            <View style={styles.flex}>
              <Text style={styles.label}>Agent 执行完成后自动归档</Text>
              <Text style={styles.description}>
                每次任务尝试结束后，自动归档本次创建的排查、SOP 汇总和审核 Agent。
              </Text>
            </View>
            <Switch
              value={autoArchiveAgents}
              onValueChange={setAutoArchiveAgents}
              accessibilityLabel="Agent 执行完成后自动归档"
            />
          </View>
        ) : null}
        <Field
          label="处理任务提示词"
          hint="留空使用内置提示词。支持下方内置变量和 Project 配置中的自定义变量。"
        >
          <FormTextInput
            multiline
            value={promptTemplate}
            onChangeText={setPromptTemplate}
            placeholder="例如：请处理记录 {{record_id}}，原始消息：{{message_text}}"
            textInputStyle={styles.promptInput}
          />
        </Field>
        <Text selectable style={styles.variables}>
          可用变量：
          {ALERT_TROUBLESHOOTER_PROMPT_VARIABLES.map((name) => `{{${name}}}`).join("、")}
          ；Project 自定义变量也统一使用下划线名称，例如 {"{{service_owner}}"}。
        </Text>
        <Field
          label={debugByResultId ? "指定 Bamboo 对账 result_id" : "指定多维表格 unique_id"}
          hint={
            debugByResultId
              ? "输入原始 result_id；系统会在当天归因多维表格创建或复用记录，并立即加入处理队列。"
              : "从今天或昨天的日报多维表格查找并加入处理队列，便于调试。"
          }
        >
          <FormTextInput
            value={debugRecordValue}
            onChangeText={setDebugRecordValue}
            placeholder={debugByResultId ? "例如：123456" : "result_id:123456 或 message_id:om_xxx"}
          />
        </Field>
        <Button
          variant="outline"
          leftIcon={Play}
          loading={queueingRecord}
          disabled={!debugRecordValue.trim()}
          onPress={enqueueDebugRecord}
        >
          {debugByResultId ? "按 result_id 调试" : "加入处理队列"}
        </Button>
        {queuedRecord ? (
          <Text style={styles.success}>
            {debugByResultId
              ? `Bamboo result_id ${queuedRecord} 已加入处理队列。`
              : `记录 ${queuedRecord} 已加入处理队列。`}
          </Text>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {saved ? (
        <Text style={styles.success}>配置已保存，后台监听将在下一次同步时生效。</Text>
      ) : null}
      <Button variant="default" leftIcon={Save} loading={saving} onPress={save}>
        保存自动排查配置
      </Button>
    </View>
  );
}

export function AlertTroubleshooterPanel({
  active,
  serverId,
  appDefinition,
  spec,
  initialProjectId,
}: {
  active: boolean;
  serverId: string;
  plugin: PluginSummary;
  appDefinition: PluginAppDefinition;
  spec: AlertTroubleshooterPanelSpec;
  initialProjectId?: string;
}) {
  const [taskProjectId, setTaskProjectId] = useState<string | null>(null);
  const channel = useLarkChannel(serverId, { enabled: active });
  const botAppIds = useMemo(
    () => new Map((channel.status?.bots ?? []).map((bot) => [bot.id, bot.appId])),
    [channel.status?.bots],
  );
  const closeTasks = useCallback(() => setTaskProjectId(null), []);
  const renderTaskAction = useCallback(
    (project: PluginProjectContext) => (
      <Button
        size="sm"
        variant="outline"
        leftIcon={ClipboardList}
        onPress={() => setTaskProjectId(project.projectId)}
      >
        任务执行记录
      </Button>
    ),
    [],
  );

  return (
    <PluginProjectBoundary
      active={active}
      serverId={serverId}
      pluginId={spec.pluginId}
      appDefinition={appDefinition}
      initialProjectId={initialProjectId}
      renderDetailActions={renderTaskAction}
    >
      {(project) =>
        (() => {
          const config = spec.configSchema.safeParse(project.data[spec.configDataKey]);
          let larkAppId = "";
          if (config.success) {
            larkAppId =
              config.data.bot.kind === "custom"
                ? config.data.bot.appId
                : (botAppIds.get(config.data.bot.botId)?.trim() ?? "");
          }
          return taskProjectId === project.projectId ? (
            <AlertTroubleshooterTaskListPage
              key={`${project.projectId}:tasks`}
              active={active}
              serverId={serverId}
              pluginId={spec.pluginId}
              appId={spec.appId}
              larkAppId={larkAppId}
              larkBotId={
                config.success && config.data.bot.kind === "existing" ? config.data.bot.botId : ""
              }
              projectId={project.projectId}
              projectName={project.projectName}
              onBack={closeTasks}
            />
          ) : (
            <AlertTroubleshooterProject
              key={project.projectId}
              active={active}
              serverId={serverId}
              spec={spec}
              project={project}
            />
          );
        })()
      }
    </PluginProjectBoundary>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    gap: theme.spacing[4],
  },
  card: {
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  heading: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  meta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingTop: theme.spacing[2],
  },
  flex: {
    flex: 1,
    gap: theme.spacing[1],
  },
  label: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  chatText: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  success: {
    color: theme.colors.success,
    fontSize: theme.fontSize.sm,
  },
  promptInput: {
    minHeight: 140,
    textAlignVertical: "top",
  },
  variables: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
  },
}));
