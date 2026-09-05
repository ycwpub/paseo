/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Dynamic group rows and identity selectors bind to the active Project draft. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Plus, Save, Trash2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { ZodType } from "zod";
import type {
  AlertTroubleshooterChat,
  AlertTroubleshooterConfig,
  AlertTroubleshooterRuntime,
  AlertTroubleshooterTarget,
  PluginAppDefinition,
  PluginSummary,
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
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { LarkChatDirectoryField } from "@/screens/settings/channels/lark-directory-fields";
import { useLarkChannel } from "@/screens/settings/channels/use-lark-channel";
import { validateAlertTroubleshooterConfig } from "./alert-troubleshooter-form-validation";

const DEFAULT_CONFIG: Omit<
  AlertTroubleshooterConfig,
  "botId" | "chats" | "troubleshootingSopDoc" | "attributionRecordRoot"
> = {
  version: 1,
  enabled: true,
  target: { kind: "default" },
  schedule: {
    enabled: true,
    intervalMinutes: 30,
    lookbackMinutes: 120,
    excludeRecentMinutes: 30,
  },
};

export interface AlertTroubleshooterPanelSpec {
  pluginId: string;
  appId: string;
  configDataKey: string;
  runtimeDataKey: string;
  productName: string;
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
  const [botId, setBotId] = useState(initialConfig.success ? initialConfig.data.botId : "");
  const [chats, setChats] = useState<AlertTroubleshooterChat[]>(
    initialConfig.success ? initialConfig.data.chats : [],
  );
  const [pendingChatId, setPendingChatId] = useState("");
  const [target, setTarget] = useState<AlertTroubleshooterTarget>(
    initialConfig.success ? initialConfig.data.target : DEFAULT_CONFIG.target,
  );
  const [sopDoc, setSopDoc] = useState(
    initialConfig.success ? initialConfig.data.troubleshootingSopDoc : "",
  );
  const [recordRoot, setRecordRoot] = useState(
    initialConfig.success ? initialConfig.data.attributionRecordRoot : "",
  );
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
    String(initialConfig.success ? initialConfig.data.schedule.excludeRecentMinutes : 30),
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
      { value: "default" as const, label: "默认模型" },
      { value: "assistant" as const, label: "助手" },
      { value: "team" as const, label: "团队", disabled: !supportsTeams },
    ],
    [supportsTeams],
  );
  const runtime = spec.runtimeSchema.safeParse(project.data[spec.runtimeDataKey]);

  useEffect(() => {
    if (botId || !status?.activeBotId) return;
    setBotId(status.activeBotId);
  }, [botId, status?.activeBotId]);

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
      const validation = validateAlertTroubleshooterConfig(spec.configSchema, {
        enabled,
        botId,
        chats,
        target,
        troubleshootingSopDoc: sopDoc,
        attributionRecordRoot: recordRoot,
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
        defaultAgent: project.defaultAgent,
        data: { [spec.configDataKey]: validation.config },
      });
      if (response.error || !response.app) throw new Error(response.error ?? "保存配置失败");
      setSaved(true);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }, [
    botId,
    chats,
    client,
    enabled,
    excludeRecentMinutes,
    intervalMinutes,
    lookbackMinutes,
    project.defaultAgent,
    project.projectId,
    recordRoot,
    scheduleEnabled,
    sopDoc,
    spec,
    target,
  ]);

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.heading}>自动排查</Text>
            <Text style={styles.description}>
              监听 {spec.productName} 报警卡片，并定时补偿扫描遗漏消息。
            </Text>
          </View>
          <Switch value={enabled} onValueChange={setEnabled} accessibilityLabel="启用自动排查" />
        </View>
        <Text style={styles.meta}>
          排查模型：{project.defaultAgent.provider} · {project.defaultAgent.model}
        </Text>
        <SelectField
          label="飞书机器人"
          value={botId || null}
          selectedDisplay={selectedBotDisplay}
          options={botOptions}
          onChange={setBotId}
          placeholder="选择机器人"
          emptyText="请先在渠道中配置飞书机器人"
        />
        <LarkChatDirectoryField
          label="添加监听群"
          hint="支持按群名称、群 ID 或 oc_xxx 搜索；一个项目可监听多个群。"
          appId={selectedBot?.appId ?? ""}
          chatId={pendingChatId}
          chats={directoryChats}
          onChange={setPendingChatId}
          resolveChats={channel.resolveDirectoryChats}
        />
        <Button variant="outline" leftIcon={Plus} disabled={!pendingChatId} onPress={addChat}>
          添加监听群
        </Button>
        {chats.map((chat) => (
          <View key={chat.chatId} style={styles.chatRow}>
            <Text selectable style={styles.chatText}>
              {chat.name ?? "飞书群"} · {chat.groupId ?? "未获取群 ID"} · {chat.chatId}
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
        <Field label="归因记录飞书文档或目录链接">
          <FormTextInput
            value={recordRoot}
            onChangeText={setRecordRoot}
            placeholder="https://.../wiki/..."
          />
        </Field>
        <SegmentedControl
          value={target.kind}
          onValueChange={changeTargetKind}
          options={identityOptions}
        />
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
            <Text style={styles.description}>默认扫描 2 小时内、排除最近半小时的消息。</Text>
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
  return (
    <PluginProjectBoundary
      active={active}
      serverId={serverId}
      pluginId={spec.pluginId}
      appDefinition={appDefinition}
      initialProjectId={initialProjectId}
    >
      {(project) => (
        <AlertTroubleshooterProject
          key={project.projectId}
          active={active}
          serverId={serverId}
          spec={spec}
          project={project}
        />
      )}
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
  flex: {
    flex: 1,
    gap: theme.spacing[1],
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
}));
