import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Linking, Text, View } from "react-native";
import * as QRCode from "qrcode";
import { SvgXml } from "react-native-svg";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Bot, ExternalLink } from "lucide-react-native";
import type {
  Assistant,
  LarkChannelAuthorizedUser,
  LarkChannelBotStatus,
  LarkChannelPendingPairing,
  LarkChannelStatus,
  LarkDirectory,
  LarkDirectoryUser,
  LarkGroupMessageProcessor,
  LarkReminder,
  LarkSubstituteMode,
  Team,
} from "@getpaseo/protocol/messages";
import type { ConfigureLarkChannelOptions } from "@getpaseo/client";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useAssistants } from "@/hooks/use-assistants";
import { registerProjectDescriptor } from "@/hooks/open-project";
import { useTeams } from "@/hooks/use-teams";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import type { AgentModelDefinition, ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import { useProjects } from "@/hooks/use-projects";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { SettingsSection } from "@/screens/settings/settings-section";
import { useSessionStore } from "@/stores/session-store";
import { settingsStyles } from "@/styles/settings";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { formatAgentModeLabel, formatThinkingOptionLabel } from "@/agent-controls/labels";
import { type UseLarkChannelResult, useLarkChannel } from "./use-lark-channel";
import { useLarkBotDirectoryChatHydration } from "./use-lark-directory-chat-hydration";
import {
  LarkContactDirectoryEntry,
  LarkContactDirectoryPage,
  LarkContactEditorPage,
  type LarkContactDirectoryUpdateInput,
} from "./lark-contact-directory-section";
import { formatLarkChatId, formatLarkUserOpenId } from "./lark-directory-format";
import { LarkReminderEditor, LarkReminderSection } from "./lark-reminder-section";
import {
  LarkProjectBindingFields,
  type LarkProjectBindingMode,
} from "./lark-project-binding-fields";
import {
  createLarkProjectBinding,
  findLarkProjectIdByCwd,
  rollbackLarkProjectBinding,
} from "./lark-project-binding";
import {
  LarkSubstituteModeEditor,
  LarkSubstituteModeSection,
} from "./lark-substitute-mode-section";
import { LarkSubstituteTaskListPage } from "./lark-substitute-task-list-page";
import { LarkGroupMessageProcessorSection } from "./lark-group-message-processor-section";
import { LarkGroupMessageProcessorEditor } from "./lark-group-message-processor-editor";
import { LarkGroupMessageProcessorTaskListPage } from "./lark-group-message-processor-task-list-page";

const LARK_DOCS_URL = "https://open.larkoffice.com/document/server-docs/server-side-sdk";
const LEGACY_LARK_BOT_ID = "__legacy_lark_bot__";
const EMPTY_PAIRINGS: LarkChannelPendingPairing[] = [];
const EMPTY_AUTHORIZED_USERS: LarkChannelAuthorizedUser[] = [];
const ASSISTANT_TARGET_PREFIX = "assistant:";
const TEAM_TARGET_PREFIX = "team:";

function parseTargetValue(value: string): {
  assistantId: string | null;
  teamId: string | null;
} {
  if (value.startsWith(TEAM_TARGET_PREFIX)) {
    return { assistantId: null, teamId: value.slice(TEAM_TARGET_PREFIX.length) };
  }
  if (value.startsWith(ASSISTANT_TARGET_PREFIX)) {
    return { assistantId: value.slice(ASSISTANT_TARGET_PREFIX.length), teamId: null };
  }
  return { assistantId: null, teamId: null };
}

function buildProjectOptions(
  projects: ReturnType<typeof useProjects>["projects"],
  serverId: string,
): SelectFieldOption<string>[] {
  const options: SelectFieldOption<string>[] = [];
  for (const project of projects) {
    const host = project.hosts.find(
      (entry) => entry.serverId === serverId && entry.isOnline && entry.repoRoot.trim().length > 0,
    );
    if (!host) continue;
    const label = project.projectCustomName ?? project.projectName;
    options.push({
      id: `${project.viewKey}:${host.repoRoot}`,
      value: host.repoRoot,
      label,
      description: host.repoRoot,
      testID: `host-page-lark-project-option-${project.viewKey}`,
    });
  }
  return options;
}

function canDeleteSelectedBot(
  status: LarkChannelStatus | null,
  selectedBotStatus: LarkChannelBotStatus | null,
): boolean {
  return Boolean(
    selectedBotStatus?.id && status?.bots.some((bot) => bot.id === selectedBotStatus.id),
  );
}

function hasPendingBotMutation(channelSaving: boolean, projectSaving: boolean): boolean {
  return channelSaving || projectSaving;
}

function getStatusDirectory(status: LarkChannelStatus | null): LarkDirectory | null {
  return status?.directory ?? null;
}

function getBotAppId(status: LarkChannelBotStatus | null): string | null {
  return status?.appId ?? null;
}

const ThemedBot = withUnistyles(Bot);
const foregroundIconMapping = (theme: Theme) => ({ color: theme.colors.foreground });

interface LarkChannelSectionProps {
  serverId: string;
  onDetailNavigationChange?: (navigation: LarkChannelDetailNavigation | null) => void;
}

interface LarkChannelLoadedContentProps {
  serverId: string;
  channel: UseLarkChannelResult;
  onDetailNavigationChange?: (navigation: LarkChannelDetailNavigation | null) => void;
}

interface StatusCardProps {
  channel: UseLarkChannelResult;
  status: LarkChannelBotStatus | null;
  onEnabledChange: (enabled: boolean) => void;
}

interface BotListCardProps {
  bots: LarkChannelBotStatus[];
  creating: boolean;
  onEdit: (botId: string) => void;
  onAdd: () => void;
}

type LarkChannelPage =
  | "overview"
  | "bot"
  | "directory"
  | "contact-edit"
  | "substitute-create"
  | "substitute-edit"
  | "substitute-tasks"
  | "group-processor-create"
  | "group-processor-edit"
  | "group-processor-tasks"
  | "reminder-create"
  | "reminder-edit";

export interface LarkChannelDetailNavigation {
  title: string;
  onBack: () => void;
}

const LARK_CHANNEL_PAGE_TITLES: Record<Exclude<LarkChannelPage, "overview">, string> = {
  bot: "编辑飞书机器人",
  directory: "通讯录",
  "contact-edit": "编辑联系人",
  "substitute-create": "创建替身模式",
  "substitute-edit": "编辑替身模式",
  "substitute-tasks": "替身任务",
  "group-processor-create": "创建群消息处理器",
  "group-processor-edit": "编辑群消息处理器",
  "group-processor-tasks": "群消息处理任务",
  "reminder-create": "创建定时任务",
  "reminder-edit": "编辑定时任务",
};

function BotApplicationCard({ channel }: { channel: UseLarkChannelResult }) {
  const application = channel.application ?? null;
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!application?.qrUrl) {
      setQrSvg(null);
      return;
    }
    void QRCode.toString(application.qrUrl, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
    })
      .then((value) => {
        if (active) setQrSvg(value);
        return value;
      })
      .catch(() => {
        if (active) setQrSvg(null);
      });
    return () => {
      active = false;
    };
  }, [application?.qrUrl]);

  useEffect(() => {
    if (!application || application.status === "completed" || application.status === "failed") {
      return;
    }
    const timer = setInterval(() => {
      void channel.refreshApplication().catch(() => undefined);
    }, 1200);
    return () => clearInterval(timer);
  }, [application, channel]);

  const handleApply = useCallback(() => {
    void channel.applyBot();
  }, [channel]);

  return (
    <SettingsSection title="申请飞书机器人">
      <View style={styles.formCard} testID="host-page-lark-apply-card">
        <Text style={settingsStyles.rowTitle}>一键申请并开通群消息监听</Text>
        <Text style={settingsStyles.rowHint}>
          扫码后，Paseo
          会自动填充并申请所需权限、事件订阅和回调白名单，保存凭证并启动群消息长连接监听。
        </Text>
        {qrSvg ? (
          <View style={styles.applicationQr}>
            <SvgXml xml={qrSvg} width={240} height={240} />
          </View>
        ) : null}
        {application?.message ? (
          <Text style={settingsStyles.rowHint}>{application.message}</Text>
        ) : null}
        {application?.error ? (
          <Text style={settingsStyles.rowError}>{application.error}</Text>
        ) : null}
        {application?.appId ? (
          <Text style={settingsStyles.rowHint} selectable>
            App ID: {application.appId}
          </Text>
        ) : null}
        {application?.requirements ? (
          <>
            <Text style={settingsStyles.rowHint}>
              已随申请提交：机器人权限 {application.requirements.tenantScopes.length} 项、用户权限{" "}
              {application.requirements.userScopes.length} 项
            </Text>
            <Text style={settingsStyles.rowHint} selectable>
              事件与回调白名单：
              {[...application.requirements.events, ...application.requirements.callbacks].join(
                "、",
              )}
            </Text>
          </>
        ) : null}
        <View style={styles.actionsRow}>
          <Button
            variant="default"
            onPress={handleApply}
            loading={channel.isApplying}
            disabled={
              !channel.isConnected ||
              channel.isApplying ||
              (application !== null &&
                application.status !== "completed" &&
                application.status !== "failed")
            }
            testID="host-page-lark-apply-bot"
          >
            {application?.status === "failed" ? "重新申请" : "申请飞书机器人"}
          </Button>
          {application ? (
            <Button variant="outline" onPress={channel.clearApplication}>
              关闭申请状态
            </Button>
          ) : null}
        </View>
      </View>
    </SettingsSection>
  );
}

interface CredentialsCardProps {
  status: LarkChannelBotStatus | null;
  botName: string;
  creating: boolean;
  canDelete: boolean;
  formRevision: number;
  appId: string;
  appSecret: string;
  encryptKey: string;
  verificationToken: string;
  targetValue: string | null;
  provider: string | null;
  model: string | null;
  modeId: string | null;
  thinkingOptionId: string | null;
  cwd: string;
  projectMode: LarkProjectBindingMode;
  newProjectName: string;
  newProjectNameRevision: number;
  supportsDirectorylessProjects: boolean;
  showOptional: boolean;
  targetOptions: SelectFieldOption<string>[];
  selectedTargetDisplay: SelectFieldDisplay | null;
  targetsLoading: boolean;
  providerOptions: SelectFieldOption<string>[];
  selectedProviderDisplay: SelectFieldDisplay | null;
  modelOptions: SelectFieldOption<string>[];
  selectedModelDisplay: SelectFieldDisplay | null;
  modeOptions: SelectFieldOption<string>[];
  selectedModeDisplay: SelectFieldDisplay | null;
  thinkingOptions: SelectFieldOption<string>[];
  selectedThinkingDisplay: SelectFieldDisplay | null;
  providersLoading: boolean;
  projectOptions: SelectFieldOption<string>[];
  selectedProjectDisplay: SelectFieldDisplay | null;
  saveError: string | null;
  saving: boolean;
  connected: boolean;
  onBotNameChange: (value: string) => void;
  onAppIdChange: (value: string) => void;
  onAppSecretChange: (value: string) => void;
  onEncryptKeyChange: (value: string) => void;
  onVerificationTokenChange: (value: string) => void;
  onTargetChange: (value: string) => void;
  onProviderChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onModeChange: (value: string) => void;
  onThinkingChange: (value: string) => void;
  onCwdChange: (value: string) => void;
  onProjectModeChange: (value: LarkProjectBindingMode) => void;
  onNewProjectNameChange: (value: string) => void;
  onToggleOptional: () => void;
  onSave: () => void;
  onTest: () => void;
  onDelete: () => void;
  onOpenDocs: () => void;
}

interface PairingRowProps {
  pairing: LarkChannelPendingPairing;
  isFirst: boolean;
  appId: string | null;
  directory: LarkDirectory | null;
  onApprove: (code: string) => void;
  onReject: (code: string) => void;
}

interface AuthorizedUserRowProps {
  user: LarkChannelAuthorizedUser;
  isFirst: boolean;
  appId: string | null;
  directory: LarkDirectory | null;
  onRevoke: (userId: string) => void;
}

function getStatusLabel(status: LarkChannelBotStatus | LarkChannelStatus | null): string {
  if (!status) return "未配置";
  switch (status.connectionStatus) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "error":
      return "Error";
    case "disabled":
      return "Disabled";
    default:
      return "Idle";
  }
}

function getStatusTone(
  status: LarkChannelBotStatus | LarkChannelStatus | null,
): "success" | "warning" | "danger" | "muted" {
  if (!status) return "muted";
  if (status.connectionStatus === "connected") return "success";
  if (status.connectionStatus === "connecting") return "warning";
  if (status.connectionStatus === "error") return "danger";
  return "muted";
}

function getStatusDotStyle(status: LarkChannelBotStatus | LarkChannelStatus | null) {
  const tone = getStatusTone(status);
  if (tone === "success") return [styles.statusDot, styles.statusDotSuccess];
  if (tone === "warning") return [styles.statusDot, styles.statusDotWarning];
  if (tone === "danger") return [styles.statusDot, styles.statusDotDanger];
  return [styles.statusDot, styles.statusDotMuted];
}

function getLarkChannelPageTitle(page: LarkChannelPage, creatingBot: boolean): string {
  if (page === "overview") return "渠道";
  if (page === "bot" && creatingBot) return "添加飞书机器人";
  return LARK_CHANNEL_PAGE_TITLES[page];
}

function getLarkChannelBackPage(page: LarkChannelPage): LarkChannelPage {
  return page === "contact-edit" ? "directory" : "overview";
}

function getActiveBotId(status: LarkChannelStatus | null): string | null {
  return status?.activeBotId ?? null;
}

function addTrimmedField<T extends string>(
  target: Record<string, string>,
  key: T,
  value: string,
): void {
  const trimmed = value.trim();
  if (trimmed.length > 0) {
    target[key] = trimmed;
  }
}

function buildConfigureInput(input: {
  botId: string | null;
  botName: string;
  creating: boolean;
  appId: string;
  appSecret: string;
  encryptKey: string;
  verificationToken: string;
  assistantId: string | null;
  teamId: string | null;
  provider: string | null;
  model: string | null;
  modeId: string | null;
  thinkingOptionId: string | null;
  cwd: string;
  projectId: string | null;
  status: LarkChannelBotStatus | null;
}): ConfigureLarkChannelOptions {
  const secrets: Record<string, string> = {};
  addTrimmedField(secrets, "appId", input.appId);
  addTrimmedField(secrets, "appSecret", input.appSecret);
  addTrimmedField(secrets, "encryptKey", input.encryptKey);
  addTrimmedField(secrets, "verificationToken", input.verificationToken);
  const cwd = input.cwd.trim();
  return {
    ...(input.creating || !input.botId ? { createNew: true } : { botId: input.botId }),
    name: input.botName,
    ...secrets,
    domain: input.status?.domain ?? "feishu",
    substitute: {
      enabled: false,
      openId: null,
      name: null,
    },
    target: input.teamId
      ? {
          kind: "team",
          teamId: input.teamId,
          provider: input.provider,
          model: input.model,
          modeId: input.modeId,
          thinkingOptionId: input.thinkingOptionId,
          cwd: cwd.length > 0 ? cwd : null,
          workspaceId: input.status?.target.workspaceId ?? null,
          projectId: input.projectId,
        }
      : {
          kind: "assistant",
          assistantId: input.assistantId,
          provider: input.provider,
          model: input.model,
          modeId: input.modeId,
          thinkingOptionId: input.thinkingOptionId,
          cwd: cwd.length > 0 ? cwd : null,
          workspaceId: input.status?.target.workspaceId ?? null,
          projectId: input.projectId,
        },
  };
}

function UpgradeRequiredCard() {
  return (
    <SettingsSection title="渠道">
      <View style={settingsStyles.card} testID="host-page-channels-upgrade-card">
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>飞书/Lark 需要更新主机</Text>
            <Text style={settingsStyles.rowHint}>请更新所选 Paseo Daemon 后再配置渠道。</Text>
          </View>
        </View>
      </View>
    </SettingsSection>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <SettingsSection title="渠道">
      <View style={settingsStyles.card} testID="host-page-channels-error-card">
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>无法加载飞书/Lark</Text>
            <Text style={settingsStyles.rowError}>{message}</Text>
          </View>
        </View>
      </View>
    </SettingsSection>
  );
}

function LoadingCard() {
  return (
    <SettingsSection title="渠道">
      <View style={styles.loadingRow}>
        <LoadingSpinner size={16} color={styles.spinnerColor.color} />
        <Text style={settingsStyles.rowHint}>正在加载飞书频道…</Text>
      </View>
    </SettingsSection>
  );
}

function StatusCard({ channel, status, onEnabledChange }: StatusCardProps) {
  const statusDotStyle = useMemo(() => getStatusDotStyle(status), [status]);
  const mutationError = channel.mutationError?.message ?? null;

  return (
    <SettingsSection title="飞书 / Lark 连接状态">
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <View style={styles.titleRow}>
              <ThemedBot size={ICON_SIZE.md} uniProps={foregroundIconMapping} />
              <Text style={settingsStyles.rowTitle}>当前机器人连接</Text>
            </View>
            <View style={styles.statusRow}>
              <View style={statusDotStyle} />
              <Text style={settingsStyles.rowHint}>{getStatusLabel(status)}</Text>
            </View>
            {status?.error ? <Text style={settingsStyles.rowError}>{status.error}</Text> : null}
            {channel.error ? (
              <Text style={settingsStyles.rowError}>{channel.error.message}</Text>
            ) : null}
            {mutationError ? <Text style={settingsStyles.rowError}>{mutationError}</Text> : null}
          </View>
          <Switch
            value={status?.enabled ?? false}
            onValueChange={onEnabledChange}
            disabled={channel.isMutating || !channel.isConnected || !status}
            accessibilityLabel="启用飞书频道"
            testID="host-page-lark-enabled-switch"
          />
        </View>
      </View>
    </SettingsSection>
  );
}

function getBotDisplayName(bot: LarkChannelBotStatus): string {
  return bot.bot?.name || bot.name || bot.appId || "未命名飞书机器人";
}

function getBotListDescription(bot: LarkChannelBotStatus): string {
  const configuredName = bot.name && bot.name !== bot.bot?.name ? `本地备注：${bot.name}` : null;
  return [configuredName, bot.appId ?? "无 App ID", getStatusLabel(bot)]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

function hasLegacyStatusConfig(status: LarkChannelStatus): boolean {
  return Boolean(
    status.appId ||
    status.hasAppSecret ||
    status.hasEncryptKey ||
    status.hasVerificationToken ||
    status.pendingPairings.length > 0 ||
    status.authorizedUsers.length > 0 ||
    status.target.cwd ||
    (status.target.kind === "assistant" && status.target.assistantId) ||
    status.connectionStatus !== "disabled",
  );
}

function buildBotStatuses(status: LarkChannelStatus | null): LarkChannelBotStatus[] {
  if (!status) return [];
  if (status.bots.length > 0) return status.bots;
  if (!hasLegacyStatusConfig(status)) return [];
  return [
    {
      id: status.activeBotId ?? LEGACY_LARK_BOT_ID,
      name: status.bot?.name ?? null,
      enabled: status.enabled,
      connectionStatus: status.connectionStatus,
      error: status.error,
      appId: status.appId,
      hasAppSecret: status.hasAppSecret,
      hasEncryptKey: status.hasEncryptKey,
      hasVerificationToken: status.hasVerificationToken,
      domain: status.domain,
      target: status.target,
      substitute: status.substitute,
      bot: status.bot,
      pendingPairings: status.pendingPairings,
      authorizedUsers: status.authorizedUsers,
    },
  ];
}

function resolveSelectedBotStatus(input: {
  botStatuses: LarkChannelBotStatus[];
  creatingBot: boolean;
  selectedBotId: string | null;
  activeBotId: string | null | undefined;
}): LarkChannelBotStatus | null {
  if (input.creatingBot) return null;
  if (input.selectedBotId) {
    return input.botStatuses.find((bot) => bot.id === input.selectedBotId) ?? null;
  }
  if (input.activeBotId) {
    return input.botStatuses.find((bot) => bot.id === input.activeBotId) ?? null;
  }
  return input.botStatuses[0] ?? null;
}

function BotListRow({
  bot,
  isFirst,
  onEdit,
}: {
  bot: LarkChannelBotStatus;
  isFirst: boolean;
  onEdit: (botId: string) => void;
}) {
  const handleEdit = useCallback(() => onEdit(bot.id), [bot.id, onEdit]);

  return (
    <View style={isFirst ? settingsStyles.row : [settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{getBotDisplayName(bot)}</Text>
        <Text style={settingsStyles.rowHint}>{getBotListDescription(bot)}</Text>
      </View>
      <View style={styles.inlineActions}>
        <Button
          size="sm"
          variant="outline"
          onPress={handleEdit}
          testID={`host-page-lark-bot-edit-${bot.id}`}
        >
          编辑
        </Button>
      </View>
    </View>
  );
}

function BotListCard({ bots, creating, onEdit, onAdd }: BotListCardProps) {
  return (
    <SettingsSection title={`飞书机器人列表（${bots.length}）`}>
      <View style={settingsStyles.card}>
        {bots.length > 0 ? (
          bots.map((bot, index) => (
            <BotListRow key={bot.id} bot={bot} isFirst={index === 0} onEdit={onEdit} />
          ))
        ) : (
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>暂无已配置的飞书机器人。</Text>
          </View>
        )}
        <View
          style={
            bots.length > 0 ? [settingsStyles.row, settingsStyles.rowBorder] : settingsStyles.row
          }
        >
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>
              {creating ? "正在添加新的飞书机器人" : "添加飞书机器人"}
            </Text>
            <Text style={settingsStyles.rowHint}>
              每个机器人都可以单独配置 App ID、凭证、助手和项目。
            </Text>
          </View>
          <Button
            size="sm"
            variant={creating ? "default" : "outline"}
            onPress={onAdd}
            testID="host-page-lark-add-bot"
          >
            添加
          </Button>
        </View>
      </View>
    </SettingsSection>
  );
}

function CredentialsCard(props: CredentialsCardProps) {
  const selectedBotName = props.status ? getBotDisplayName(props.status) : null;
  return (
    <SettingsSection title={props.creating ? "新机器人配置" : "机器人配置"}>
      <View style={styles.formCard}>
        {selectedBotName ? (
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>正在编辑：{selectedBotName}</Text>
            <Text style={settingsStyles.rowHint}>
              下方连接、模型与项目配置只对这个飞书机器人生效
              {props.status?.appId ? ` · ${props.status.appId}` : ""}。
            </Text>
          </View>
        ) : null}
        <Field label="机器人名称" testID="host-page-lark-bot-name">
          <FormTextInput
            initialValue={props.botName}
            resetKey={`bot-name:${props.formRevision}`}
            onChangeText={props.onBotNameChange}
            placeholder="机器人名称"
          />
        </Field>
        <Field label="应用 ID" testID="host-page-lark-app-id">
          <FormTextInput
            initialValue={props.appId}
            resetKey={`app-id:${props.formRevision}`}
            onChangeText={props.onAppIdChange}
            placeholder="cli_xxxxxxxxxx"
          />
        </Field>
        <Field
          label="应用密钥"
          hint={
            props.status?.hasAppSecret
              ? "Configured. Leave blank to keep existing secret."
              : undefined
          }
          testID="host-page-lark-app-secret"
        >
          <FormTextInput
            initialValue={props.appSecret}
            resetKey={`app-secret:${props.formRevision}`}
            onChangeText={props.onAppSecretChange}
            placeholder={props.status?.hasAppSecret ? "••••••••••••••••" : "应用密钥"}
            secureTextEntry
          />
        </Field>
        <Button variant="ghost" size="sm" onPress={props.onToggleOptional}>
          {props.showOptional ? "隐藏可选设置" : "显示可选设置"}
        </Button>
        {props.showOptional ? <OptionalCredentialFields {...props} /> : null}
        <SelectField
          label="模型提供方"
          value={props.provider}
          selectedDisplay={props.selectedProviderDisplay}
          options={props.providerOptions}
          onChange={props.onProviderChange}
          placeholder="选择模型提供方"
          emptyText="该主机没有可用模型提供方"
          loading={props.providersLoading}
          searchable
          testID="host-page-lark-provider"
        />
        <SelectField
          label="模型"
          value={props.model}
          selectedDisplay={props.selectedModelDisplay}
          options={props.modelOptions}
          onChange={props.onModelChange}
          placeholder="选择模型"
          emptyText="该模型提供方 没有可用模型"
          loading={props.providersLoading}
          searchable
          testID="host-page-lark-model"
          disabled={!props.provider}
        />
        <SelectField
          label="思考模式"
          value={props.thinkingOptionId}
          selectedDisplay={props.selectedThinkingDisplay}
          options={props.thinkingOptions}
          onChange={props.onThinkingChange}
          placeholder="选择思考模式"
          emptyText="该模型没有可用思考模式"
          loading={props.providersLoading}
          testID="host-page-lark-thinking-mode"
          disabled={!props.model || props.thinkingOptions.length === 0}
        />
        <SelectField
          label="安全模式"
          value={props.modeId}
          selectedDisplay={props.selectedModeDisplay}
          options={props.modeOptions}
          onChange={props.onModeChange}
          placeholder="选择安全模式"
          emptyText="该模型提供方 没有可用安全模式"
          loading={props.providersLoading}
          testID="host-page-lark-safety-mode"
          disabled={!props.provider || props.modeOptions.length === 0}
        />
        <SelectField
          label="助手或团队"
          value={props.targetValue}
          selectedDisplay={props.selectedTargetDisplay}
          options={props.targetOptions}
          onChange={props.onTargetChange}
          placeholder="选择助手或团队"
          emptyText="该主机没有可用助手或团队"
          loading={props.targetsLoading}
          searchable
          testID="host-page-lark-target"
        />
        <LarkProjectBindingFields
          mode={props.projectMode}
          cwd={props.cwd}
          newProjectName={props.newProjectName}
          newProjectNameRevision={props.newProjectNameRevision}
          supportsDirectorylessProjects={props.supportsDirectorylessProjects}
          projectOptions={props.projectOptions}
          selectedProjectDisplay={props.selectedProjectDisplay}
          defaultNameDescription="默认与飞书机器人同名"
          testIDPrefix="host-page-lark"
          onModeChange={props.onProjectModeChange}
          onCwdChange={props.onCwdChange}
          onNewProjectNameChange={props.onNewProjectNameChange}
        />
        {props.saveError ? <Text style={settingsStyles.rowError}>{props.saveError}</Text> : null}
        <View style={styles.actionsRow}>
          <Button
            variant="default"
            onPress={props.onSave}
            loading={props.saving}
            disabled={!props.connected}
          >
            Save
          </Button>
          <Button
            variant="outline"
            onPress={props.onTest}
            loading={props.saving}
            disabled={!props.connected}
          >
            Test & Connect
          </Button>
          <Button
            variant="destructive"
            onPress={props.onDelete}
            disabled={!props.canDelete || props.saving || !props.connected}
          >
            Delete bot
          </Button>
          <Button variant="ghost" onPress={props.onOpenDocs} leftIcon={ExternalLink}>
            Lark docs
          </Button>
        </View>
      </View>
    </SettingsSection>
  );
}

function SecondaryPageIntro({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.secondaryPageHeader}>
      <View style={settingsStyles.rowContent}>
        <Text style={styles.secondaryPageTitle}>{title}</Text>
        <Text style={settingsStyles.rowHint}>{description}</Text>
      </View>
    </View>
  );
}

function ReminderEditPage({
  serverId,
  bots,
  directory,
  directorySupported,
  reminder,
  resolveDirectoryUsers,
  resolveDirectoryChats,
  onSaved,
}: {
  serverId: string;
  bots: LarkChannelBotStatus[];
  directory: LarkDirectory | null;
  directorySupported: boolean;
  reminder: LarkReminder | null;
  resolveDirectoryUsers: UseLarkChannelResult["resolveDirectoryUsers"];
  resolveDirectoryChats: UseLarkChannelResult["resolveDirectoryChats"];
  onSaved: () => void;
}) {
  return (
    <View testID="host-page-channels-reminder-edit">
      <SecondaryPageIntro title="编辑定时任务" description="修改并保存当前飞书定时提醒。" />
      {reminder ? (
        <LarkReminderEditor
          key={reminder.id}
          serverId={serverId}
          bots={bots}
          directory={directory}
          directorySupported={directorySupported}
          resolveDirectoryUsers={resolveDirectoryUsers}
          resolveDirectoryChats={resolveDirectoryChats}
          reminder={reminder}
          onSaved={onSaved}
        />
      ) : (
        <SettingsSection title="定时任务">
          <View style={settingsStyles.card}>
            <View style={settingsStyles.row}>
              <Text style={settingsStyles.rowHint}>未找到要编辑的定时任务，请返回列表重试。</Text>
            </View>
          </View>
        </SettingsSection>
      )}
    </View>
  );
}

function OptionalCredentialFields(props: CredentialsCardProps) {
  return (
    <>
      <Field label="加密密钥" testID="host-page-lark-encrypt-key">
        <FormTextInput
          initialValue={props.encryptKey}
          resetKey={`encrypt-key:${props.formRevision}`}
          onChangeText={props.onEncryptKeyChange}
          placeholder={props.status?.hasEncryptKey ? "已配置" : "可选"}
          secureTextEntry
        />
      </Field>
      <Field label="校验令牌" testID="host-page-lark-verification-token">
        <FormTextInput
          initialValue={props.verificationToken}
          resetKey={`verification-token:${props.formRevision}`}
          onChangeText={props.onVerificationTokenChange}
          placeholder={props.status?.hasVerificationToken ? "已配置" : "可选"}
          secureTextEntry
        />
      </Field>
    </>
  );
}

function PairingRow({ pairing, isFirst, appId, directory, onApprove, onReject }: PairingRowProps) {
  const handleApprove = useCallback(() => {
    onApprove(pairing.code);
  }, [onApprove, pairing.code]);
  const handleReject = useCallback(() => {
    onReject(pairing.code);
  }, [onReject, pairing.code]);

  return (
    <View style={isFirst ? settingsStyles.row : [settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>
          {pairing.openId
            ? formatLarkUserOpenId(
                directory?.users ?? [],
                appId,
                pairing.openId,
                pairing.displayName,
              )
            : pairing.displayName}
        </Text>
        <Text style={settingsStyles.rowHint}>
          {formatLarkChatId(directory?.chats ?? [], appId, pairing.chatId)} · 配对码 {pairing.code}
        </Text>
      </View>
      <View style={styles.inlineActions}>
        <Button size="sm" variant="default" onPress={handleApprove}>
          Approve
        </Button>
        <Button size="sm" variant="outline" onPress={handleReject}>
          Reject
        </Button>
      </View>
    </View>
  );
}

function PairingRequestsCard(props: {
  pairings: LarkChannelPendingPairing[];
  appId: string | null;
  directory: LarkDirectory | null;
  onApprove: (code: string) => void;
  onReject: (code: string) => void;
}) {
  return (
    <SettingsSection title="待处理的配对请求">
      <View style={settingsStyles.card}>
        {props.pairings.length > 0 ? (
          props.pairings.map((pairing, index) => (
            <PairingRow
              key={pairing.code}
              pairing={pairing}
              isFirst={index === 0}
              appId={props.appId}
              directory={props.directory}
              onApprove={props.onApprove}
              onReject={props.onReject}
            />
          ))
        ) : (
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>
              No pending requests. Send a message to the bot to pair.
            </Text>
          </View>
        )}
      </View>
    </SettingsSection>
  );
}

function AuthorizedUserRow({ user, isFirst, appId, directory, onRevoke }: AuthorizedUserRowProps) {
  const handleRevoke = useCallback(() => {
    onRevoke(user.id);
  }, [onRevoke, user.id]);

  return (
    <View style={isFirst ? settingsStyles.row : [settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>
          {user.openId
            ? formatLarkUserOpenId(directory?.users ?? [], appId, user.openId, user.displayName)
            : user.displayName}
        </Text>
        <Text style={settingsStyles.rowHint}>
          {formatLarkChatId(directory?.chats ?? [], appId, user.chatId)}
        </Text>
      </View>
      <Button size="sm" variant="outline" onPress={handleRevoke}>
        Revoke
      </Button>
    </View>
  );
}

function AuthorizedUsersCard(props: {
  users: LarkChannelAuthorizedUser[];
  appId: string | null;
  directory: LarkDirectory | null;
  onRevoke: (userId: string) => void;
}) {
  return (
    <SettingsSection title="已授权用户">
      <View style={settingsStyles.card}>
        {props.users.length > 0 ? (
          props.users.map((user, index) => (
            <AuthorizedUserRow
              key={user.id}
              user={user}
              isFirst={index === 0}
              appId={props.appId}
              directory={props.directory}
              onRevoke={props.onRevoke}
            />
          ))
        ) : (
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>暂无已授权用户。</Text>
          </View>
        )}
      </View>
    </SettingsSection>
  );
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
  return models.map((m) => ({
    id: m.id,
    value: m.id,
    label: m.label,
    description: m.description ?? m.id,
  }));
}

function buildModeOptions(
  modes: NonNullable<ProviderSnapshotEntry["modes"]>,
): SelectFieldOption<string>[] {
  return modes.map((mode) => ({
    id: mode.id,
    value: mode.id,
    label: formatAgentModeLabel(mode),
    description: mode.description ?? mode.id,
  }));
}

function buildThinkingOptions(model: AgentModelDefinition | null): SelectFieldOption<string>[] {
  return (model?.thinkingOptions ?? []).map((option) => ({
    id: option.id,
    value: option.id,
    label: formatThinkingOptionLabel(option),
    description: option.description ?? option.id,
  }));
}

function getDefaultModeId(entry: ProviderSnapshotEntry | null): string | null {
  const modes = entry?.modes ?? [];
  if (entry?.defaultModeId && modes.some((mode) => mode.id === entry.defaultModeId)) {
    return entry.defaultModeId;
  }
  return modes[0]?.id ?? null;
}

function getDefaultThinkingOptionId(model: AgentModelDefinition | null): string | null {
  return (
    model?.defaultThinkingOptionId ??
    model?.thinkingOptions?.find((option) => option.isDefault)?.id ??
    model?.thinkingOptions?.[0]?.id ??
    null
  );
}

function optionDisplay(option: SelectFieldOption<string> | undefined): SelectFieldDisplay | null {
  return option ? { label: option.label, description: option.description } : null;
}

function resolveTargetValue(assistantId: string | null, teamId: string | null): string | null {
  if (teamId) return `${TEAM_TARGET_PREFIX}${teamId}`;
  if (assistantId) return `${ASSISTANT_TARGET_PREFIX}${assistantId}`;
  return null;
}

function useLarkTargetControls(input: {
  assistants: Assistant[];
  teams: Team[];
  assistantId: string | null;
  teamId: string | null;
}) {
  const targetOptions = useMemo<SelectFieldOption<string>[]>(() => {
    const assistantOptions = input.assistants.map((assistant) => ({
      id: `${ASSISTANT_TARGET_PREFIX}${assistant.id}`,
      value: `${ASSISTANT_TARGET_PREFIX}${assistant.id}`,
      label: assistant.name,
      description: `Assistant · ${assistant.description || assistant.name}`,
    }));
    const teamOptions = input.teams.map((team) => {
      const leader = input.assistants.find((assistant) => assistant.id === team.leaderAssistantId);
      return {
        id: `${TEAM_TARGET_PREFIX}${team.id}`,
        value: `${TEAM_TARGET_PREFIX}${team.id}`,
        label: team.name,
        description: `团队 · 负责人：${leader?.name || "助手不存在"}`,
      };
    });
    return [...assistantOptions, ...teamOptions];
  }, [input.assistants, input.teams]);
  const targetValue = resolveTargetValue(input.assistantId, input.teamId);
  const selectedTargetDisplay = useMemo<SelectFieldDisplay | null>(() => {
    const selected = targetOptions.find((option) => option.value === targetValue);
    return optionDisplay(selected);
  }, [targetOptions, targetValue]);
  return { targetOptions, targetValue, selectedTargetDisplay };
}

function useLarkModelControls(input: {
  entries: ProviderSnapshotEntry[];
  provider: string | null;
  model: string | null;
  modeId: string | null;
  thinkingOptionId: string | null;
}) {
  const providerOptions = useMemo(() => buildProviderOptions(input.entries), [input.entries]);
  const selectedProviderEntry = useMemo(
    () => input.entries.find((entry) => entry.provider === input.provider) ?? null,
    [input.entries, input.provider],
  );
  const modelOptions = useMemo(
    () => buildModelOptions(selectedProviderEntry?.models ?? []),
    [selectedProviderEntry?.models],
  );
  const selectedModelEntry = useMemo(
    () => selectedProviderEntry?.models?.find((entry) => entry.id === input.model) ?? null,
    [input.model, selectedProviderEntry?.models],
  );
  const modeOptions = useMemo(
    () => buildModeOptions(selectedProviderEntry?.modes ?? []),
    [selectedProviderEntry?.modes],
  );
  const thinkingOptions = useMemo(
    () => buildThinkingOptions(selectedModelEntry),
    [selectedModelEntry],
  );
  const effectiveModeId = input.modeId ?? getDefaultModeId(selectedProviderEntry);
  const effectiveThinkingOptionId =
    input.thinkingOptionId ?? getDefaultThinkingOptionId(selectedModelEntry);
  const selectedProviderDisplay = useMemo(
    () => optionDisplay(providerOptions.find((option) => option.value === input.provider)),
    [input.provider, providerOptions],
  );
  const selectedModelDisplay = useMemo(
    () => optionDisplay(modelOptions.find((option) => option.value === input.model)),
    [input.model, modelOptions],
  );
  const selectedModeDisplay = useMemo(
    () => optionDisplay(modeOptions.find((option) => option.value === effectiveModeId)),
    [effectiveModeId, modeOptions],
  );
  const selectedThinkingDisplay = useMemo(
    () =>
      optionDisplay(thinkingOptions.find((option) => option.value === effectiveThinkingOptionId)),
    [effectiveThinkingOptionId, thinkingOptions],
  );

  return {
    effectiveModeId,
    effectiveThinkingOptionId,
    modeOptions,
    modelOptions,
    providerOptions,
    selectedModeDisplay,
    selectedModelDisplay,
    selectedProviderDisplay,
    selectedProviderEntry,
    selectedThinkingDisplay,
    thinkingOptions,
  };
}

function LarkSubstituteTasksPage({
  serverId,
  mode,
  bots,
}: {
  serverId: string;
  mode: LarkSubstituteMode | null;
  bots: readonly LarkChannelBotStatus[];
}) {
  if (!mode) {
    return (
      <View testID="host-page-channels-substitute-tasks">
        <SecondaryPageIntro
          title="替身任务"
          description="未选择替身模式，请返回后重新打开任务列表。"
        />
      </View>
    );
  }
  return (
    <View testID="host-page-channels-substitute-tasks">
      <SecondaryPageIntro
        title={`${mode.name} · 任务列表`}
        description="仅查看当前替身的群消息监听、群消息扫描和私聊扫描任务，并批量暂停或删除。"
      />
      <LarkSubstituteTaskListPage serverId={serverId} mode={mode} bots={bots} />
    </View>
  );
}

function LarkGroupMessageProcessorTasksPage({
  serverId,
  processor,
}: {
  serverId: string;
  processor: LarkGroupMessageProcessor | null;
}) {
  if (!processor) {
    return (
      <View testID="host-page-channels-group-processor-tasks">
        <SecondaryPageIntro
          title="群消息处理任务"
          description="未选择群消息处理器，请返回后重试。"
        />
      </View>
    );
  }
  return (
    <View testID="host-page-channels-group-processor-tasks">
      <SecondaryPageIntro
        title={`${processor.name} · 任务列表`}
        description="查看当前处理器的监听和扫描任务，并手动扫描、暂停、重试或删除。"
      />
      <LarkGroupMessageProcessorTaskListPage serverId={serverId} processor={processor} />
    </View>
  );
}

function useSelectedLarkBotId(input: {
  status: LarkChannelStatus | null;
  creatingBot: boolean;
  botStatuses: readonly LarkChannelBotStatus[];
  selectedBotId: string | null;
  activeBotId: string | null;
  setSelectedBotId: (botId: string | null) => void;
}): void {
  const { status, creatingBot, botStatuses, selectedBotId, activeBotId, setSelectedBotId } = input;
  useEffect(() => {
    if (!status || creatingBot) return;
    let nextBotId = botStatuses[0]?.id ?? null;
    if (selectedBotId && botStatuses.some((bot) => bot.id === selectedBotId)) {
      nextBotId = selectedBotId;
    } else if (activeBotId && botStatuses.some((bot) => bot.id === activeBotId)) {
      nextBotId = activeBotId;
    }
    if (nextBotId !== selectedBotId) {
      setSelectedBotId(nextBotId);
    }
  }, [activeBotId, botStatuses, creatingBot, selectedBotId, setSelectedBotId, status]);
}

function useLarkBotFormSynchronization(input: {
  creatingBot: boolean;
  selectedBotStatus: LarkChannelBotStatus | null;
  setBotName: (value: string) => void;
  setAppId: (value: string) => void;
  setAppSecret: (value: string) => void;
  setEncryptKey: (value: string) => void;
  setVerificationToken: (value: string) => void;
  setAssistantId: (value: string | null) => void;
  setTeamId: (value: string | null) => void;
  setProvider: (value: string | null) => void;
  setModel: (value: string | null) => void;
  setModeId: (value: string | null) => void;
  setThinkingOptionId: (value: string | null) => void;
  setCwd: (value: string) => void;
  setProjectMode: (value: LarkProjectBindingMode) => void;
  setNewProjectName: (value: string) => void;
  setNewProjectNameEdited: (value: boolean) => void;
  incrementNewProjectNameRevision: () => void;
  incrementFormRevision: () => void;
}): void {
  const {
    creatingBot,
    selectedBotStatus,
    setBotName,
    setAppId,
    setAppSecret,
    setEncryptKey,
    setVerificationToken,
    setAssistantId,
    setTeamId,
    setProvider,
    setModel,
    setModeId,
    setThinkingOptionId,
    setCwd,
    setProjectMode,
    setNewProjectName,
    setNewProjectNameEdited,
    incrementNewProjectNameRevision,
    incrementFormRevision,
  } = input;
  useEffect(() => {
    if (creatingBot) return;
    if (!selectedBotStatus) {
      setBotName("");
      setAppId("");
      setAppSecret("");
      setEncryptKey("");
      setVerificationToken("");
      setAssistantId(null);
      setTeamId(null);
      setProvider(null);
      setModel(null);
      setModeId(null);
      setThinkingOptionId(null);
      setCwd("");
      setProjectMode("existing");
      setNewProjectName("");
      setNewProjectNameEdited(false);
      incrementNewProjectNameRevision();
      incrementFormRevision();
      return;
    }
    setBotName(selectedBotStatus.name ?? "");
    setAppId(selectedBotStatus.appId ?? "");
    setAppSecret("");
    setEncryptKey("");
    setVerificationToken("");
    setAssistantId(
      selectedBotStatus.target.kind === "assistant" ? selectedBotStatus.target.assistantId : null,
    );
    setTeamId(selectedBotStatus.target.kind === "team" ? selectedBotStatus.target.teamId : null);
    setProvider(
      selectedBotStatus.target.kind !== "workspace"
        ? (selectedBotStatus.target.provider ?? null)
        : null,
    );
    setModel(
      selectedBotStatus.target.kind !== "workspace"
        ? (selectedBotStatus.target.model ?? null)
        : null,
    );
    setModeId(selectedBotStatus.target.modeId ?? null);
    setThinkingOptionId(selectedBotStatus.target.thinkingOptionId ?? null);
    setCwd(selectedBotStatus.target.cwd ?? "");
    setProjectMode("existing");
    setNewProjectName(selectedBotStatus.name ?? "");
    setNewProjectNameEdited(false);
    incrementNewProjectNameRevision();
    incrementFormRevision();
  }, [
    creatingBot,
    incrementFormRevision,
    incrementNewProjectNameRevision,
    selectedBotStatus,
    setAppId,
    setAppSecret,
    setAssistantId,
    setBotName,
    setCwd,
    setEncryptKey,
    setModeId,
    setModel,
    setNewProjectName,
    setNewProjectNameEdited,
    setProjectMode,
    setProvider,
    setTeamId,
    setThinkingOptionId,
    setVerificationToken,
  ]);
}

function LarkChannelLoadedContent({
  serverId,
  channel,
  onDetailNavigationChange,
}: LarkChannelLoadedContentProps) {
  const assistants = useAssistants(serverId);
  const supportsTeams = useHostFeature(serverId, "teams");
  const supportsLarkDirectory = useHostFeature(serverId, "larkDirectory");
  const supportsLarkDirectoryOpenIdLookup = useHostFeature(serverId, "larkDirectoryOpenIdLookup");
  const supportsLarkDirectoryPrivateUserScan = useHostFeature(
    serverId,
    "larkDirectoryPrivateUserScan",
  );
  const supportsLarkDirectoryClearFirstMessages = useHostFeature(
    serverId,
    "larkDirectoryClearFirstMessages",
  );
  const teams = useTeams(serverId, { enabled: supportsTeams });
  const providersSnapshot = useProvidersSnapshot(serverId);
  const client = useHostRuntimeClient(serverId);
  const supportsDirectorylessProjects = useHostFeature(serverId, "projectCreateDirectoryless");
  const { projects } = useProjects();
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [creatingBot, setCreatingBot] = useState(false);
  const [botName, setBotName] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [encryptKey, setEncryptKey] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [modeId, setModeId] = useState<string | null>(null);
  const [thinkingOptionId, setThinkingOptionId] = useState<string | null>(null);
  const [cwd, setCwd] = useState("");
  const [projectMode, setProjectMode] = useState<LarkProjectBindingMode>("existing");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectNameEdited, setNewProjectNameEdited] = useState(false);
  const [newProjectNameRevision, setNewProjectNameRevision] = useState(0);
  const [showOptional, setShowOptional] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formRevision, setFormRevision] = useState(0);
  const [page, setPage] = useState<LarkChannelPage>("overview");
  const [editingReminder, setEditingReminder] = useState<LarkReminder | null>(null);
  const [editingContact, setEditingContact] = useState<LarkDirectoryUser | null>(null);
  const [editingSubstituteMode, setEditingSubstituteMode] = useState<LarkSubstituteMode | null>(
    null,
  );
  const [taskListSubstituteMode, setTaskListSubstituteMode] = useState<LarkSubstituteMode | null>(
    null,
  );
  const [editingGroupMessageProcessor, setEditingGroupMessageProcessor] =
    useState<LarkGroupMessageProcessor | null>(null);
  const [taskListGroupMessageProcessor, setTaskListGroupMessageProcessor] =
    useState<LarkGroupMessageProcessor | null>(null);
  const upsertProject = useSessionStore((state) => state.upsertProject);
  const removeProject = useSessionStore((state) => state.removeProject);
  const setHasHydratedWorkspaces = useSessionStore((state) => state.setHasHydratedWorkspaces);
  const status = channel.status;
  const activeBotId = getActiveBotId(status);
  const directory = getStatusDirectory(status);
  const botStatuses = useMemo(() => buildBotStatuses(status), [status]);
  const selectedBotStatus = useMemo(
    () =>
      resolveSelectedBotStatus({
        botStatuses,
        creatingBot,
        selectedBotId,
        activeBotId,
      }),
    [activeBotId, botStatuses, creatingBot, selectedBotId],
  );
  const selectedBotAppId = getBotAppId(selectedBotStatus);
  const savingBot = hasPendingBotMutation(channel.isMutating, isSaving);
  useLarkBotDirectoryChatHydration({
    active: page === "bot",
    supported: supportsLarkDirectory,
    bot: selectedBotStatus,
    directory,
    resolveChats: channel.resolveDirectoryChats,
  });

  useSelectedLarkBotId({
    status,
    creatingBot,
    botStatuses,
    selectedBotId,
    activeBotId,
    setSelectedBotId,
  });

  const incrementNewProjectNameRevision = useCallback(
    () => setNewProjectNameRevision((value) => value + 1),
    [],
  );
  const incrementFormRevision = useCallback(() => setFormRevision((value) => value + 1), []);
  useLarkBotFormSynchronization({
    creatingBot,
    selectedBotStatus,
    setBotName,
    setAppId,
    setAppSecret,
    setEncryptKey,
    setVerificationToken,
    setAssistantId,
    setTeamId,
    setProvider,
    setModel,
    setModeId,
    setThinkingOptionId,
    setCwd,
    setProjectMode,
    setNewProjectName,
    setNewProjectNameEdited,
    incrementNewProjectNameRevision,
    incrementFormRevision,
  });

  const { targetOptions, targetValue, selectedTargetDisplay } = useLarkTargetControls({
    assistants: assistants.assistants,
    teams: teams.teams,
    assistantId,
    teamId,
  });

  const {
    effectiveModeId,
    effectiveThinkingOptionId,
    modeOptions,
    modelOptions,
    providerOptions,
    selectedModeDisplay,
    selectedModelDisplay,
    selectedProviderDisplay,
    selectedProviderEntry,
    selectedThinkingDisplay,
    thinkingOptions,
  } = useLarkModelControls({
    entries: providersSnapshot.entries ?? [],
    provider,
    model,
    modeId,
    thinkingOptionId,
  });

  const projectOptions = useMemo(
    () => buildProjectOptions(projects, serverId),
    [projects, serverId],
  );

  const selectedProjectDisplay = useMemo<SelectFieldDisplay | null>(() => {
    const selected = projectOptions.find((option) => option.value === cwd);
    return selected ? { label: selected.label, description: selected.description } : null;
  }, [cwd, projectOptions]);

  const clearFormForNewBot = useCallback(() => {
    setBotName("");
    setAppId("");
    setAppSecret("");
    setEncryptKey("");
    setVerificationToken("");
    setAssistantId(null);
    setTeamId(null);
    setProvider(null);
    setModel(null);
    setModeId(null);
    setThinkingOptionId(null);
    setCwd("");
    setProjectMode("existing");
    setNewProjectName("");
    setNewProjectNameEdited(false);
    setNewProjectNameRevision((value) => value + 1);
    setSaveError(null);
    setFormRevision((value) => value + 1);
  }, []);
  const handleSelectBot = useCallback((botId: string) => {
    setCreatingBot(false);
    setSelectedBotId(botId);
    setSaveError(null);
  }, []);
  const handleEditBot = useCallback(
    (botId: string) => {
      handleSelectBot(botId);
      setPage("bot");
    },
    [handleSelectBot],
  );
  const handleAddBot = useCallback(() => {
    setCreatingBot(true);
    setSelectedBotId(null);
    clearFormForNewBot();
    setPage("bot");
  }, [clearFormForNewBot]);
  const handleCreateReminder = useCallback(() => {
    setEditingReminder(null);
    setPage("reminder-create");
  }, []);
  const handleOpenDirectory = useCallback(() => {
    setEditingContact(null);
    setPage("directory");
  }, []);
  const handleEditContact = useCallback((user: LarkDirectoryUser) => {
    setEditingContact(user);
    setPage("contact-edit");
  }, []);
  const handleSaveContact = useCallback(
    async (input: LarkContactDirectoryUpdateInput) => {
      await channel.updateDirectoryUser(input);
      setEditingContact(null);
      setPage("directory");
    },
    [channel],
  );
  const handleCreateSubstituteMode = useCallback(() => {
    setEditingSubstituteMode(null);
    setPage("substitute-create");
  }, []);
  const handleEditSubstituteMode = useCallback((mode: LarkSubstituteMode) => {
    setEditingSubstituteMode(mode);
    setPage("substitute-edit");
  }, []);
  const handleOpenSubstituteTasks = useCallback((mode: LarkSubstituteMode) => {
    setTaskListSubstituteMode(mode);
    setPage("substitute-tasks");
  }, []);
  const handleSubstituteModeSaved = useCallback(() => {
    setEditingSubstituteMode(null);
    setPage("overview");
  }, []);
  const handleCreateGroupMessageProcessor = useCallback(() => {
    setEditingGroupMessageProcessor(null);
    setPage("group-processor-create");
  }, []);
  const handleEditGroupMessageProcessor = useCallback((processor: LarkGroupMessageProcessor) => {
    setEditingGroupMessageProcessor(processor);
    setPage("group-processor-edit");
  }, []);
  const handleOpenGroupMessageProcessorTasks = useCallback(
    (processor: LarkGroupMessageProcessor) => {
      setTaskListGroupMessageProcessor(processor);
      setPage("group-processor-tasks");
    },
    [],
  );
  const handleGroupMessageProcessorSaved = useCallback(() => {
    setEditingGroupMessageProcessor(null);
    setPage("overview");
  }, []);
  const handleEditReminder = useCallback((reminder: LarkReminder) => {
    setEditingReminder(reminder);
    setPage("reminder-edit");
  }, []);
  const handleReminderSaved = useCallback(() => {
    setEditingReminder(null);
    setEditingSubstituteMode(null);
    setPage("overview");
  }, []);
  const handleDetailBack = useCallback(() => {
    setEditingReminder(null);
    setEditingContact(null);
    setTaskListSubstituteMode(null);
    setEditingGroupMessageProcessor(null);
    setTaskListGroupMessageProcessor(null);
    setSaveError(null);
    setPage(getLarkChannelBackPage(page));
  }, [page]);

  useEffect(() => {
    if (!onDetailNavigationChange) return;
    if (page === "overview") {
      onDetailNavigationChange(null);
      return;
    }
    onDetailNavigationChange({
      title: getLarkChannelPageTitle(page, creatingBot),
      onBack: handleDetailBack,
    });
    return () => onDetailNavigationChange(null);
  }, [creatingBot, handleDetailBack, onDetailNavigationChange, page]);
  const handleBotNameChange = useCallback(
    (value: string) => {
      setBotName(value);
      if (!newProjectNameEdited) {
        setNewProjectName(value);
        if (projectMode === "create") {
          setNewProjectNameRevision((revision) => revision + 1);
        }
      }
      setSaveError(null);
    },
    [newProjectNameEdited, projectMode],
  );
  const handleTargetChange = useCallback((value: string) => {
    const target = parseTargetValue(value);
    setAssistantId(target.assistantId);
    setTeamId(target.teamId);
    setSaveError(null);
  }, []);
  const handleProviderChange = useCallback((value: string) => {
    setProvider(value);
    setModel(null);
    setModeId(null);
    setThinkingOptionId(null);
    setSaveError(null);
  }, []);
  const handleModelChange = useCallback(
    (value: string) => {
      setModel(value);
      const nextModel = selectedProviderEntry?.models?.find((entry) => entry.id === value) ?? null;
      setThinkingOptionId(getDefaultThinkingOptionId(nextModel));
      setSaveError(null);
    },
    [selectedProviderEntry?.models],
  );

  const handleProjectChange = useCallback((value: string) => {
    setCwd(value);
    setSaveError(null);
  }, []);
  const handleProjectModeChange = useCallback(
    (value: LarkProjectBindingMode) => {
      setProjectMode(value);
      if (value === "create" && !newProjectNameEdited) {
        setNewProjectName(botName);
        setNewProjectNameRevision((revision) => revision + 1);
      }
      setSaveError(null);
    },
    [botName, newProjectNameEdited],
  );
  const handleNewProjectNameChange = useCallback((value: string) => {
    setNewProjectName(value);
    setNewProjectNameEdited(true);
    setSaveError(null);
  }, []);

  const handleToggleOptional = useCallback(() => {
    setShowOptional((value) => !value);
  }, []);
  const save = useCallback(async () => {
    if (isSaving || channel.isMutating) return;
    setIsSaving(true);
    let createdProjectId: string | null = null;
    let createdProjectCwd: string | null = null;
    try {
      setSaveError(null);
      let targetCwd = cwd;
      let targetProjectId =
        findLarkProjectIdByCwd(projects, serverId, cwd) ??
        (selectedBotStatus?.target.cwd === cwd
          ? (selectedBotStatus.target.projectId ?? null)
          : null);
      if (projectMode === "create") {
        const project = await createLarkProjectBinding({
          name: newProjectName,
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
        createdProjectId = project.projectId;
        createdProjectCwd = project.cwd;
        targetCwd = project.cwd;
        targetProjectId = project.projectId;
      }
      const nextStatus = await channel.configure(
        buildConfigureInput({
          botId: selectedBotStatus?.id ?? selectedBotId,
          botName,
          creating: creatingBot,
          appId,
          appSecret,
          encryptKey,
          verificationToken,
          assistantId,
          teamId,
          provider,
          model,
          modeId: effectiveModeId,
          thinkingOptionId: effectiveThinkingOptionId,
          cwd: targetCwd,
          projectId: targetProjectId,
          status: selectedBotStatus,
        }),
      );
      const nextBotId = nextStatus.activeBotId ?? nextStatus.bots[0]?.id ?? null;
      setCreatingBot(false);
      setSelectedBotId(nextBotId);
      if (createdProjectCwd) {
        setCwd(createdProjectCwd);
        setProjectMode("existing");
        setNewProjectNameEdited(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const rolledBack = await rollbackLarkProjectBinding({
        projectId: createdProjectId,
        client,
        unregisterProject: (projectId) => removeProject(serverId, projectId),
      });
      if (!rolledBack && createdProjectCwd) {
        setCwd(createdProjectCwd);
        setProjectMode("existing");
      }
      setSaveError(
        rolledBack ? message : `${message}；自动创建的 Project 回滚失败，已保留并绑定到表单`,
      );
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [
    appId,
    appSecret,
    assistantId,
    botName,
    channel,
    client,
    creatingBot,
    cwd,
    encryptKey,
    effectiveModeId,
    effectiveThinkingOptionId,
    isSaving,
    model,
    newProjectName,
    provider,
    projectMode,
    projects,
    removeProject,
    serverId,
    selectedBotId,
    selectedBotStatus,
    setHasHydratedWorkspaces,
    supportsDirectorylessProjects,
    teamId,
    upsertProject,
    verificationToken,
  ]);
  const handleSave = useCallback(async () => {
    try {
      await save();
    } catch {
      // `save` already surfaces the message in the form.
    }
  }, [save]);
  const handleTest = useCallback(async () => {
    try {
      setSaveError(null);
      await save();
      await channel.testConnection(selectedBotStatus?.id ?? selectedBotId);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  }, [channel, save, selectedBotId, selectedBotStatus?.id]);
  const handleEnabledChange = useCallback(
    (enabled: boolean) => {
      void channel.setEnabled(enabled, selectedBotStatus?.id ?? selectedBotId);
    },
    [channel, selectedBotId, selectedBotStatus?.id],
  );
  const handleApprovePairing = useCallback(
    (code: string) => {
      void channel.approvePairing(code, selectedBotStatus?.id ?? selectedBotId);
    },
    [channel, selectedBotId, selectedBotStatus?.id],
  );
  const handleRejectPairing = useCallback(
    (code: string) => {
      void channel.rejectPairing(code, selectedBotStatus?.id ?? selectedBotId);
    },
    [channel, selectedBotId, selectedBotStatus?.id],
  );
  const handleRevokeUser = useCallback(
    (userId: string) => {
      void channel.revokeUser(userId, selectedBotStatus?.id ?? selectedBotId);
    },
    [channel, selectedBotId, selectedBotStatus?.id],
  );
  const handleDeleteBot = useCallback(async () => {
    const botId = selectedBotStatus?.id ?? selectedBotId;
    if (!botId) return;
    try {
      setSaveError(null);
      const nextStatus = await channel.deleteBot(botId);
      const nextBotId = nextStatus.activeBotId ?? nextStatus.bots[0]?.id ?? null;
      setSelectedBotId(nextBotId);
      setCreatingBot(nextBotId === null);
      if (!nextBotId) {
        clearFormForNewBot();
      }
      setPage("overview");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  }, [channel, clearFormForNewBot, selectedBotId, selectedBotStatus?.id]);
  const openDocs = useCallback(() => {
    void Linking.openURL(LARK_DOCS_URL);
  }, []);

  const credentialsCard = (
    <CredentialsCard
      status={selectedBotStatus}
      botName={botName}
      creating={creatingBot}
      canDelete={canDeleteSelectedBot(status, selectedBotStatus)}
      formRevision={formRevision}
      appId={appId}
      appSecret={appSecret}
      encryptKey={encryptKey}
      verificationToken={verificationToken}
      targetValue={targetValue}
      provider={provider}
      model={model}
      modeId={effectiveModeId}
      thinkingOptionId={effectiveThinkingOptionId}
      cwd={cwd}
      projectMode={projectMode}
      newProjectName={newProjectName}
      newProjectNameRevision={newProjectNameRevision}
      supportsDirectorylessProjects={supportsDirectorylessProjects}
      showOptional={showOptional}
      targetOptions={targetOptions}
      selectedTargetDisplay={selectedTargetDisplay}
      targetsLoading={assistants.isLoading || teams.isLoading}
      providerOptions={providerOptions}
      selectedProviderDisplay={selectedProviderDisplay}
      modelOptions={modelOptions}
      selectedModelDisplay={selectedModelDisplay}
      modeOptions={modeOptions}
      selectedModeDisplay={selectedModeDisplay}
      thinkingOptions={thinkingOptions}
      selectedThinkingDisplay={selectedThinkingDisplay}
      providersLoading={providersSnapshot.isLoading || providersSnapshot.isFetching}
      projectOptions={projectOptions}
      selectedProjectDisplay={selectedProjectDisplay}
      saveError={saveError}
      saving={savingBot}
      connected={channel.isConnected}
      onBotNameChange={handleBotNameChange}
      onAppIdChange={setAppId}
      onAppSecretChange={setAppSecret}
      onEncryptKeyChange={setEncryptKey}
      onVerificationTokenChange={setVerificationToken}
      onTargetChange={handleTargetChange}
      onProviderChange={handleProviderChange}
      onModelChange={handleModelChange}
      onModeChange={setModeId}
      onThinkingChange={setThinkingOptionId}
      onCwdChange={handleProjectChange}
      onProjectModeChange={handleProjectModeChange}
      onNewProjectNameChange={handleNewProjectNameChange}
      onToggleOptional={handleToggleOptional}
      onSave={handleSave}
      onTest={handleTest}
      onDelete={handleDeleteBot}
      onOpenDocs={openDocs}
    />
  );

  const pages: Record<LarkChannelPage, ReactElement> = {
    overview: (
      <View testID="host-page-channels">
        <BotApplicationCard channel={channel} />
        <BotListCard
          bots={botStatuses}
          creating={creatingBot}
          onEdit={handleEditBot}
          onAdd={handleAddBot}
        />
        <LarkContactDirectoryEntry
          bots={botStatuses}
          directory={directory}
          onOpen={handleOpenDirectory}
        />
        <LarkSubstituteModeSection
          serverId={serverId}
          bots={botStatuses}
          directory={directory}
          onCreate={handleCreateSubstituteMode}
          onEdit={handleEditSubstituteMode}
          onOpenTasks={handleOpenSubstituteTasks}
        />
        <LarkGroupMessageProcessorSection
          serverId={serverId}
          onCreate={handleCreateGroupMessageProcessor}
          onEdit={handleEditGroupMessageProcessor}
          onOpenTasks={handleOpenGroupMessageProcessorTasks}
        />
        <View testID="host-page-lark-reminders-section">
          <LarkReminderSection
            serverId={serverId}
            bots={botStatuses}
            directory={directory}
            directorySupported={supportsLarkDirectory}
            resolveDirectoryUsers={channel.resolveDirectoryUsers}
            resolveDirectoryChats={channel.resolveDirectoryChats}
            onCreate={handleCreateReminder}
            onEdit={handleEditReminder}
          />
        </View>
      </View>
    ),
    bot: (
      <View testID="host-page-channels-bot">
        <SecondaryPageIntro
          title={creatingBot ? "添加飞书机器人" : "编辑飞书机器人"}
          description="配置机器人凭证、默认模型、助手或团队以及项目。"
        />
        <StatusCard
          channel={channel}
          status={selectedBotStatus}
          onEnabledChange={handleEnabledChange}
        />
        {credentialsCard}
        <PairingRequestsCard
          pairings={selectedBotStatus?.pendingPairings ?? EMPTY_PAIRINGS}
          appId={selectedBotAppId}
          directory={directory}
          onApprove={handleApprovePairing}
          onReject={handleRejectPairing}
        />
        <AuthorizedUsersCard
          users={selectedBotStatus?.authorizedUsers ?? EMPTY_AUTHORIZED_USERS}
          appId={selectedBotAppId}
          directory={directory}
          onRevoke={handleRevokeUser}
        />
      </View>
    ),
    directory: (
      <View testID="host-page-channels-directory">
        <SecondaryPageIntro
          title="通讯录"
          description="按飞书机器人查看和搜索联系人，并补充用户名与邮箱。"
        />
        <LarkContactDirectoryPage
          bots={botStatuses}
          directory={directory}
          selectedBotId={selectedBotStatus?.id ?? selectedBotId}
          connected={channel.isConnected}
          supportsOpenIdLookup={supportsLarkDirectoryOpenIdLookup}
          supportsPrivateUserScan={supportsLarkDirectoryPrivateUserScan}
          supportsClearFirstMessages={supportsLarkDirectoryClearFirstMessages}
          onSelectBot={handleSelectBot}
          onEdit={handleEditContact}
          onResolve={channel.resolveDirectoryUser}
          onResolveUsers={channel.resolveDirectoryUsers}
          onCreate={channel.createDirectoryUser}
          onDeleteMany={channel.deleteDirectoryUsers}
          onScanPrivateUsers={channel.scanDirectoryPrivateUsers}
          onAddPrivateUser={channel.addDirectoryPrivateUser}
          onClearFirstMessages={channel.clearDirectoryFirstMessages}
        />
      </View>
    ),
    "contact-edit": (
      <View testID="host-page-channels-contact-edit">
        <SecondaryPageIntro
          title="编辑联系人"
          description="根据首次消息内容和时间核对联系人身份，并补充用户名或邮箱。"
        />
        <LarkContactEditorPage
          user={editingContact}
          connected={channel.isConnected}
          onSave={handleSaveContact}
        />
      </View>
    ),
    "substitute-create": (
      <View testID="host-page-channels-substitute-create">
        <SecondaryPageIntro
          title="创建替身模式"
          description="配置被替身用户、回答身份、规则、时间段和默认 Agent。"
        />
        <LarkSubstituteModeEditor
          key="create-substitute"
          serverId={serverId}
          bots={botStatuses}
          directory={directory}
          resolveDirectoryUsers={channel.resolveDirectoryUsers}
          resolveDirectoryChats={channel.resolveDirectoryChats}
          onSaved={handleSubstituteModeSaved}
        />
      </View>
    ),
    "substitute-edit": (
      <View testID="host-page-channels-substitute-edit">
        <SecondaryPageIntro
          title="编辑替身模式"
          description="修改当前替身模式的触发规则和回答方式。"
        />
        <LarkSubstituteModeEditor
          key={editingSubstituteMode?.id ?? "missing-substitute"}
          serverId={serverId}
          bots={botStatuses}
          directory={directory}
          resolveDirectoryUsers={channel.resolveDirectoryUsers}
          resolveDirectoryChats={channel.resolveDirectoryChats}
          mode={editingSubstituteMode}
          onSaved={handleSubstituteModeSaved}
        />
      </View>
    ),
    "substitute-tasks": (
      <LarkSubstituteTasksPage
        serverId={serverId}
        mode={taskListSubstituteMode}
        bots={botStatuses}
      />
    ),
    "group-processor-create": (
      <View testID="host-page-channels-group-processor-create">
        <SecondaryPageIntro
          title="创建群消息处理器"
          description="配置机器人、消息过滤、上下文、提示词和 Agent 目标。"
        />
        <LarkGroupMessageProcessorEditor
          key="create-group-processor"
          serverId={serverId}
          bots={botStatuses}
          onSaved={handleGroupMessageProcessorSaved}
        />
      </View>
    ),
    "group-processor-edit": (
      <View testID="host-page-channels-group-processor-edit">
        <SecondaryPageIntro
          title="编辑群消息处理器"
          description="修改群消息监听、扫描、过滤和回复策略。"
        />
        <LarkGroupMessageProcessorEditor
          serverId={serverId}
          bots={botStatuses}
          processor={editingGroupMessageProcessor}
          onSaved={handleGroupMessageProcessorSaved}
        />
      </View>
    ),
    "group-processor-tasks": (
      <LarkGroupMessageProcessorTasksPage
        serverId={serverId}
        processor={taskListGroupMessageProcessor}
      />
    ),
    "reminder-create": (
      <View testID="host-page-channels-reminder-create">
        <SecondaryPageIntro
          title="创建定时任务"
          description="配置提醒群、被提醒人、频率和发送身份。"
        />
        <LarkReminderEditor
          key="create"
          serverId={serverId}
          bots={botStatuses}
          directory={directory}
          directorySupported={supportsLarkDirectory}
          resolveDirectoryUsers={channel.resolveDirectoryUsers}
          resolveDirectoryChats={channel.resolveDirectoryChats}
          onSaved={handleReminderSaved}
        />
      </View>
    ),
    "reminder-edit": (
      <ReminderEditPage
        serverId={serverId}
        bots={botStatuses}
        directory={directory}
        directorySupported={supportsLarkDirectory}
        reminder={editingReminder}
        resolveDirectoryUsers={channel.resolveDirectoryUsers}
        resolveDirectoryChats={channel.resolveDirectoryChats}
        onSaved={handleReminderSaved}
      />
    ),
  };

  return pages[page];
}

export function LarkChannelSection({
  serverId,
  onDetailNavigationChange,
}: LarkChannelSectionProps) {
  const supportsLark = useHostFeature(serverId, "larkChannel");
  const channel = useLarkChannel(serverId, { enabled: supportsLark });

  if (!supportsLark) return <UpgradeRequiredCard />;
  if (channel.isLoading) return <LoadingCard />;
  if (channel.error && !channel.status) return <ErrorCard message={channel.error.message} />;
  return (
    <LarkChannelLoadedContent
      serverId={serverId}
      channel={channel}
      onDetailNavigationChange={onDetailNavigationChange}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  loadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
    padding: theme.spacing[4],
  },
  spinnerColor: {
    color: theme.colors.foregroundMuted,
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statusDotSuccess: {
    backgroundColor: theme.colors.statusSuccess,
  },
  statusDotWarning: {
    backgroundColor: theme.colors.statusWarning,
  },
  statusDotDanger: {
    backgroundColor: theme.colors.statusDanger,
  },
  statusDotMuted: {
    backgroundColor: theme.colors.foregroundMuted,
  },
  formCard: {
    gap: theme.spacing[4],
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  applicationQr: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    borderRadius: theme.borderRadius.md,
    justifyContent: "center",
    padding: theme.spacing[2],
  },
  inlineActions: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  secondaryPageHeader: {
    gap: theme.spacing[3],
    marginBottom: theme.spacing[6],
  },
  secondaryPageTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.medium,
  },
}));
