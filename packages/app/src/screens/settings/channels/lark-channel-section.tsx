import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useTeams } from "@/hooks/use-teams";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import type { AgentModelDefinition, ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import { useProjects } from "@/hooks/use-projects";
import { useHostFeature } from "@/runtime/host-features";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { formatAgentModeLabel, formatThinkingOptionLabel } from "@/composer/agent-controls/utils";
import { type UseLarkChannelResult, useLarkChannel } from "./use-lark-channel";
import { LarkReminderSection } from "./lark-reminder-section";

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

const ThemedBot = withUnistyles(Bot);
const foregroundIconMapping = (theme: Theme) => ({ color: theme.colors.foreground });

interface LarkChannelSectionProps {
  serverId: string;
}

interface LarkChannelLoadedContentProps {
  serverId: string;
  channel: UseLarkChannelResult;
}

interface StatusCardProps {
  channel: UseLarkChannelResult;
  status: LarkChannelBotStatus | null;
  onEnabledChange: (enabled: boolean) => void;
}

interface BotListCardProps {
  bots: LarkChannelBotStatus[];
  selectedBotId: string | null;
  creating: boolean;
  onSelect: (botId: string) => void;
  onAdd: () => void;
}

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
          扫码后，Paseo 会自动创建机器人、保存凭证并启动群消息长连接监听。
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
  substituteEnabled: boolean;
  substituteOpenId: string;
  substituteName: string;
  targetValue: string | null;
  provider: string | null;
  model: string | null;
  modeId: string | null;
  thinkingOptionId: string | null;
  cwd: string;
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
  onSubstituteEnabledChange: (value: boolean) => void;
  onSubstituteOpenIdChange: (value: string) => void;
  onSubstituteNameChange: (value: string) => void;
  onTargetChange: (value: string) => void;
  onProviderChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onModeChange: (value: string) => void;
  onThinkingChange: (value: string) => void;
  onCwdChange: (value: string) => void;
  onToggleOptional: () => void;
  onSave: () => void;
  onTest: () => void;
  onDelete: () => void;
  onOpenDocs: () => void;
}

interface PairingRowProps {
  pairing: LarkChannelPendingPairing;
  isFirst: boolean;
  onApprove: (code: string) => void;
  onReject: (code: string) => void;
}

interface AuthorizedUserRowProps {
  user: LarkChannelAuthorizedUser;
  isFirst: boolean;
  onRevoke: (userId: string) => void;
}

function getStatusLabel(status: LarkChannelBotStatus | LarkChannelStatus | null): string {
  if (!status) return "Not configured";
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
  substituteEnabled: boolean;
  substituteOpenId: string;
  substituteName: string;
  assistantId: string | null;
  teamId: string | null;
  provider: string | null;
  model: string | null;
  modeId: string | null;
  thinkingOptionId: string | null;
  cwd: string;
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
      enabled: input.substituteEnabled,
      openId: input.substituteOpenId.trim() || null,
      name: input.substituteName.trim() || null,
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
        },
  };
}

function UpgradeRequiredCard() {
  return (
    <SettingsSection title="Channels">
      <View style={settingsStyles.card} testID="host-page-channels-upgrade-card">
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>Feishu/Lark requires a newer host</Text>
            <Text style={settingsStyles.rowHint}>
              Update the selected Paseo daemon to configure channels.
            </Text>
          </View>
        </View>
      </View>
    </SettingsSection>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <SettingsSection title="Channels">
      <View style={settingsStyles.card} testID="host-page-channels-error-card">
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>Could not load Feishu/Lark</Text>
            <Text style={settingsStyles.rowError}>{message}</Text>
          </View>
        </View>
      </View>
    </SettingsSection>
  );
}

function LoadingCard() {
  return (
    <SettingsSection title="Channels">
      <View style={styles.loadingRow}>
        <LoadingSpinner size={16} color={styles.spinnerColor.color} />
        <Text style={settingsStyles.rowHint}>Loading Lark channel…</Text>
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
            accessibilityLabel="Enable Lark channel"
            testID="host-page-lark-enabled-switch"
          />
        </View>
      </View>
    </SettingsSection>
  );
}

function getBotDisplayName(bot: LarkChannelBotStatus): string {
  return bot.bot?.name || bot.name || bot.appId || "Untitled Lark bot";
}

function getBotListDescription(bot: LarkChannelBotStatus): string {
  const configuredName = bot.name && bot.name !== bot.bot?.name ? `本地备注：${bot.name}` : null;
  return [configuredName, bot.appId ?? "No App ID", getStatusLabel(bot)]
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
  selected,
  isFirst,
  onSelect,
}: {
  bot: LarkChannelBotStatus;
  selected: boolean;
  isFirst: boolean;
  onSelect: (botId: string) => void;
}) {
  const handleSelect = useCallback(() => {
    onSelect(bot.id);
  }, [bot.id, onSelect]);

  return (
    <View style={isFirst ? settingsStyles.row : [settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{getBotDisplayName(bot)}</Text>
        <Text style={settingsStyles.rowHint}>{getBotListDescription(bot)}</Text>
      </View>
      <Button
        size="sm"
        variant={selected ? "default" : "outline"}
        onPress={handleSelect}
        testID={`host-page-lark-bot-select-${bot.id}`}
      >
        {selected ? "Editing" : "Edit"}
      </Button>
    </View>
  );
}

function BotListCard({ bots, selectedBotId, creating, onSelect, onAdd }: BotListCardProps) {
  return (
    <SettingsSection title={`飞书机器人列表（${bots.length}）`}>
      <View style={settingsStyles.card}>
        {bots.length > 0 ? (
          bots.map((bot, index) => (
            <BotListRow
              key={bot.id}
              bot={bot}
              selected={!creating && bot.id === selectedBotId}
              isFirst={index === 0}
              onSelect={onSelect}
            />
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
              下方配置（包括替身模式）只对这个飞书机器人生效
              {props.status?.appId ? ` · ${props.status.appId}` : ""}。
            </Text>
          </View>
        ) : null}
        <Field label="机器人名称" testID="host-page-lark-bot-name">
          <FormTextInput
            initialValue={props.botName}
            resetKey={`bot-name:${props.formRevision}`}
            onChangeText={props.onBotNameChange}
            placeholder="bot name"
          />
        </Field>
        <Field label="App ID" testID="host-page-lark-app-id">
          <FormTextInput
            initialValue={props.appId}
            resetKey={`app-id:${props.formRevision}`}
            onChangeText={props.onAppIdChange}
            placeholder="cli_xxxxxxxxxx"
          />
        </Field>
        <Field
          label="App Secret"
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
            placeholder={props.status?.hasAppSecret ? "••••••••••••••••" : "App Secret"}
            secureTextEntry
          />
        </Field>
        <Button variant="ghost" size="sm" onPress={props.onToggleOptional}>
          {props.showOptional ? "Hide optional settings" : "Show optional settings"}
        </Button>
        {props.showOptional ? <OptionalCredentialFields {...props} /> : null}
        <View style={styles.substituteHeader}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>替身模式</Text>
            <Text style={settingsStyles.rowHint}>
              群聊中有人 @ 当前机器人或被附身用户时，由当前机器人代其回复。
              {selectedBotName ? ` 当前机器人：${selectedBotName}。` : ""}
            </Text>
          </View>
          <Switch
            value={props.substituteEnabled}
            onValueChange={props.onSubstituteEnabledChange}
            accessibilityLabel="启用替身模式"
            testID="host-page-lark-substitute-enabled"
          />
        </View>
        <Field
          label="被附身用户 Open ID"
          hint="被附身用户仅按 Open ID 匹配；@ 当前机器人也会触发替身回复。"
          testID="host-page-lark-substitute-open-id"
        >
          <FormTextInput
            initialValue={props.substituteOpenId}
            resetKey={`substitute-open-id:${props.formRevision}`}
            onChangeText={props.onSubstituteOpenIdChange}
            placeholder="ou_xxxxxxxxxx"
            editable={props.substituteEnabled}
          />
        </Field>
        <Field
          label="用户名（备注）"
          hint="仅作为备注和回复上下文，不参与身份匹配。"
          testID="host-page-lark-substitute-name"
        >
          <FormTextInput
            initialValue={props.substituteName}
            resetKey={`substitute-name:${props.formRevision}`}
            onChangeText={props.onSubstituteNameChange}
            placeholder="例如：张三"
            editable={props.substituteEnabled}
          />
        </Field>
        <SelectField
          label="Provider"
          value={props.provider}
          selectedDisplay={props.selectedProviderDisplay}
          options={props.providerOptions}
          onChange={props.onProviderChange}
          placeholder="Select provider"
          emptyText="No providers on this host"
          loading={props.providersLoading}
          searchable
          testID="host-page-lark-provider"
        />
        <SelectField
          label="Model"
          value={props.model}
          selectedDisplay={props.selectedModelDisplay}
          options={props.modelOptions}
          onChange={props.onModelChange}
          placeholder="Select model"
          emptyText="No models for this provider"
          loading={props.providersLoading}
          searchable
          testID="host-page-lark-model"
          disabled={!props.provider}
        />
        <SelectField
          label="Thinking mode"
          value={props.thinkingOptionId}
          selectedDisplay={props.selectedThinkingDisplay}
          options={props.thinkingOptions}
          onChange={props.onThinkingChange}
          placeholder="Select thinking mode"
          emptyText="No thinking modes for this model"
          loading={props.providersLoading}
          testID="host-page-lark-thinking-mode"
          disabled={!props.model || props.thinkingOptions.length === 0}
        />
        <SelectField
          label="Safety mode"
          value={props.modeId}
          selectedDisplay={props.selectedModeDisplay}
          options={props.modeOptions}
          onChange={props.onModeChange}
          placeholder="Select safety mode"
          emptyText="No safety modes for this provider"
          loading={props.providersLoading}
          testID="host-page-lark-safety-mode"
          disabled={!props.provider || props.modeOptions.length === 0}
        />
        <SelectField
          label="Assistant or team"
          value={props.targetValue}
          selectedDisplay={props.selectedTargetDisplay}
          options={props.targetOptions}
          onChange={props.onTargetChange}
          placeholder="Select an assistant or team"
          emptyText="No assistants or teams on this host"
          loading={props.targetsLoading}
          searchable
          testID="host-page-lark-target"
        />
        <SelectField
          label="Project path"
          value={props.cwd || null}
          selectedDisplay={props.selectedProjectDisplay}
          options={props.projectOptions}
          onChange={props.onCwdChange}
          placeholder="Select a project"
          emptyText="No opened projects on this host"
          searchable
          testID="host-page-lark-project-path"
          hint="Each Lark topic creates its own Paseo session in this project."
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

function OptionalCredentialFields(props: CredentialsCardProps) {
  return (
    <>
      <Field label="Encrypt Key" testID="host-page-lark-encrypt-key">
        <FormTextInput
          initialValue={props.encryptKey}
          resetKey={`encrypt-key:${props.formRevision}`}
          onChangeText={props.onEncryptKeyChange}
          placeholder={props.status?.hasEncryptKey ? "Configured" : "Optional"}
          secureTextEntry
        />
      </Field>
      <Field label="Verification Token" testID="host-page-lark-verification-token">
        <FormTextInput
          initialValue={props.verificationToken}
          resetKey={`verification-token:${props.formRevision}`}
          onChangeText={props.onVerificationTokenChange}
          placeholder={props.status?.hasVerificationToken ? "Configured" : "Optional"}
          secureTextEntry
        />
      </Field>
    </>
  );
}

function PairingRow({ pairing, isFirst, onApprove, onReject }: PairingRowProps) {
  const handleApprove = useCallback(() => {
    onApprove(pairing.code);
  }, [onApprove, pairing.code]);
  const handleReject = useCallback(() => {
    onReject(pairing.code);
  }, [onReject, pairing.code]);

  return (
    <View style={isFirst ? settingsStyles.row : [settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{pairing.displayName}</Text>
        <Text style={settingsStyles.rowHint}>Code {pairing.code}</Text>
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
  onApprove: (code: string) => void;
  onReject: (code: string) => void;
}) {
  return (
    <SettingsSection title="Pending pairing requests">
      <View style={settingsStyles.card}>
        {props.pairings.length > 0 ? (
          props.pairings.map((pairing, index) => (
            <PairingRow
              key={pairing.code}
              pairing={pairing}
              isFirst={index === 0}
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

function AuthorizedUserRow({ user, isFirst, onRevoke }: AuthorizedUserRowProps) {
  const handleRevoke = useCallback(() => {
    onRevoke(user.id);
  }, [onRevoke, user.id]);

  return (
    <View style={isFirst ? settingsStyles.row : [settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{user.displayName}</Text>
        <Text style={settingsStyles.rowHint}>{user.chatId}</Text>
      </View>
      <Button size="sm" variant="outline" onPress={handleRevoke}>
        Revoke
      </Button>
    </View>
  );
}

function AuthorizedUsersCard(props: {
  users: LarkChannelAuthorizedUser[];
  onRevoke: (userId: string) => void;
}) {
  return (
    <SettingsSection title="Authorized users">
      <View style={settingsStyles.card}>
        {props.users.length > 0 ? (
          props.users.map((user, index) => (
            <AuthorizedUserRow
              key={user.id}
              user={user}
              isFirst={index === 0}
              onRevoke={props.onRevoke}
            />
          ))
        ) : (
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>No authorized users yet.</Text>
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
        description: `Team · Leader: ${leader?.name || "Missing assistant"}`,
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

function LarkChannelLoadedContent({ serverId, channel }: LarkChannelLoadedContentProps) {
  const assistants = useAssistants(serverId);
  const supportsTeams = useHostFeature(serverId, "teams");
  const teams = useTeams(serverId, { enabled: supportsTeams });
  const providersSnapshot = useProvidersSnapshot(serverId);
  const { projects } = useProjects();
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [creatingBot, setCreatingBot] = useState(false);
  const [botName, setBotName] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [encryptKey, setEncryptKey] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [substituteEnabled, setSubstituteEnabled] = useState(false);
  const [substituteOpenId, setSubstituteOpenId] = useState("");
  const [substituteName, setSubstituteName] = useState("");
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [modeId, setModeId] = useState<string | null>(null);
  const [thinkingOptionId, setThinkingOptionId] = useState<string | null>(null);
  const [cwd, setCwd] = useState("");
  const [showOptional, setShowOptional] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [formRevision, setFormRevision] = useState(0);
  const status = channel.status;
  const botStatuses = useMemo(() => buildBotStatuses(status), [status]);
  const selectedBotStatus = useMemo(
    () =>
      resolveSelectedBotStatus({
        botStatuses,
        creatingBot,
        selectedBotId,
        activeBotId: status?.activeBotId,
      }),
    [botStatuses, creatingBot, selectedBotId, status?.activeBotId],
  );

  useEffect(() => {
    if (!status || creatingBot) return;
    let nextBotId = botStatuses[0]?.id ?? null;
    if (selectedBotId && botStatuses.some((bot) => bot.id === selectedBotId)) {
      nextBotId = selectedBotId;
    } else if (status.activeBotId && botStatuses.some((bot) => bot.id === status.activeBotId)) {
      nextBotId = status.activeBotId;
    }
    if (nextBotId !== selectedBotId) {
      setSelectedBotId(nextBotId);
    }
  }, [botStatuses, creatingBot, selectedBotId, status]);

  useEffect(() => {
    if (creatingBot) return;
    if (!selectedBotStatus) {
      setBotName("");
      setAppId("");
      setAppSecret("");
      setEncryptKey("");
      setVerificationToken("");
      setSubstituteEnabled(false);
      setSubstituteOpenId("");
      setSubstituteName("");
      setAssistantId(null);
      setTeamId(null);
      setProvider(null);
      setModel(null);
      setModeId(null);
      setThinkingOptionId(null);
      setCwd("");
      setFormRevision((value) => value + 1);
      return;
    }
    setBotName(selectedBotStatus.name ?? "");
    setAppId(selectedBotStatus.appId ?? "");
    setAppSecret("");
    setEncryptKey("");
    setVerificationToken("");
    setSubstituteEnabled(selectedBotStatus.substitute.enabled);
    setSubstituteOpenId(selectedBotStatus.substitute.openId ?? "");
    setSubstituteName(selectedBotStatus.substitute.name ?? "");
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
    setFormRevision((value) => value + 1);
  }, [creatingBot, selectedBotStatus]);

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
    setSubstituteEnabled(false);
    setSubstituteOpenId("");
    setSubstituteName("");
    setAssistantId(null);
    setTeamId(null);
    setProvider(null);
    setModel(null);
    setModeId(null);
    setThinkingOptionId(null);
    setCwd("");
    setSaveError(null);
    setFormRevision((value) => value + 1);
  }, []);
  const handleSelectBot = useCallback((botId: string) => {
    setCreatingBot(false);
    setSelectedBotId(botId);
    setSaveError(null);
  }, []);
  const handleAddBot = useCallback(() => {
    setCreatingBot(true);
    setSelectedBotId(null);
    clearFormForNewBot();
  }, [clearFormForNewBot]);
  const handleBotNameChange = useCallback((value: string) => {
    setBotName(value);
    setSaveError(null);
  }, []);
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

  const handleToggleOptional = useCallback(() => {
    setShowOptional((value) => !value);
  }, []);
  const save = useCallback(async () => {
    try {
      setSaveError(null);
      if (substituteEnabled && substituteOpenId.trim().length === 0) {
        throw new Error("启用替身模式时必须填写被附身用户 Open ID");
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
          substituteEnabled,
          substituteOpenId,
          substituteName,
          assistantId,
          teamId,
          provider,
          model,
          modeId: effectiveModeId,
          thinkingOptionId: effectiveThinkingOptionId,
          cwd,
          status: selectedBotStatus,
        }),
      );
      const nextBotId = nextStatus.activeBotId ?? nextStatus.bots[0]?.id ?? null;
      setCreatingBot(false);
      setSelectedBotId(nextBotId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveError(message);
      throw error;
    }
  }, [
    appId,
    appSecret,
    assistantId,
    botName,
    channel,
    creatingBot,
    cwd,
    encryptKey,
    effectiveModeId,
    effectiveThinkingOptionId,
    model,
    provider,
    selectedBotId,
    selectedBotStatus,
    substituteEnabled,
    substituteName,
    substituteOpenId,
    teamId,
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
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  }, [channel, clearFormForNewBot, selectedBotId, selectedBotStatus?.id]);
  const openDocs = useCallback(() => {
    void Linking.openURL(LARK_DOCS_URL);
  }, []);

  return (
    <View testID="host-page-channels">
      <BotApplicationCard channel={channel} />
      <BotListCard
        bots={botStatuses}
        selectedBotId={selectedBotStatus?.id ?? selectedBotId}
        creating={creatingBot}
        onSelect={handleSelectBot}
        onAdd={handleAddBot}
      />
      <StatusCard
        channel={channel}
        status={selectedBotStatus}
        onEnabledChange={handleEnabledChange}
      />
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
        substituteEnabled={substituteEnabled}
        substituteOpenId={substituteOpenId}
        substituteName={substituteName}
        targetValue={targetValue}
        provider={provider}
        model={model}
        modeId={effectiveModeId}
        thinkingOptionId={effectiveThinkingOptionId}
        cwd={cwd}
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
        saving={channel.isMutating}
        connected={channel.isConnected}
        onBotNameChange={handleBotNameChange}
        onAppIdChange={setAppId}
        onAppSecretChange={setAppSecret}
        onEncryptKeyChange={setEncryptKey}
        onVerificationTokenChange={setVerificationToken}
        onSubstituteEnabledChange={setSubstituteEnabled}
        onSubstituteOpenIdChange={setSubstituteOpenId}
        onSubstituteNameChange={setSubstituteName}
        onTargetChange={handleTargetChange}
        onProviderChange={handleProviderChange}
        onModelChange={handleModelChange}
        onModeChange={setModeId}
        onThinkingChange={setThinkingOptionId}
        onCwdChange={handleProjectChange}
        onToggleOptional={handleToggleOptional}
        onSave={handleSave}
        onTest={handleTest}
        onDelete={handleDeleteBot}
        onOpenDocs={openDocs}
      />
      <PairingRequestsCard
        pairings={selectedBotStatus?.pendingPairings ?? EMPTY_PAIRINGS}
        onApprove={handleApprovePairing}
        onReject={handleRejectPairing}
      />
      <AuthorizedUsersCard
        users={selectedBotStatus?.authorizedUsers ?? EMPTY_AUTHORIZED_USERS}
        onRevoke={handleRevokeUser}
      />
      <LarkReminderSection serverId={serverId} bots={botStatuses} />
    </View>
  );
}

export function LarkChannelSection({ serverId }: LarkChannelSectionProps) {
  const supportsLark = useHostFeature(serverId, "larkChannel");
  const channel = useLarkChannel(serverId, { enabled: supportsLark });

  if (!supportsLark) return <UpgradeRequiredCard />;
  if (channel.isLoading) return <LoadingCard />;
  if (channel.error && !channel.status) return <ErrorCard message={channel.error.message} />;
  return <LarkChannelLoadedContent serverId={serverId} channel={channel} />;
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
  substituteHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[3],
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
}));
