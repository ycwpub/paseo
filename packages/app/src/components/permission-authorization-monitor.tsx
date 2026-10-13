import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { DEFAULT_LARK_USER_OAUTH_REDIRECT_URI } from "@getpaseo/protocol/messages";
import { useHostRuntimeClient, useHostRuntimeIsConnected, useHosts } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { openExternalUrl } from "@/utils/open-external-url";

const DAILY_PERMISSION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;

interface AuthorizationNotice {
  key: string;
  title: string;
  message: string;
  actionLabel: string;
  openAuthorization: () => Promise<void>;
  setupAuthorization?: () => Promise<void>;
  setupLabel?: string;
  setupRedirectUri?: string;
  verifyAuthorization?: () => Promise<void>;
}

function LarkUserOAuthMonitor({ serverId }: { serverId: string }) {
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const [notice, setNotice] = useState<AuthorizationNotice | null>(null);
  const [authorizationOpened, setAuthorizationOpened] = useState(false);

  const check = useCallback(async () => {
    if (!client || !connected) return;
    const channel = await client.getLarkChannelStatus();
    if (channel.error) return;
    for (const bot of channel.status?.bots ?? []) {
      const appId = bot.appId?.trim();
      if (!appId) continue;
      const oauth = await client.getLarkUserOAuthStatus({ appId });
      const requiresAuthorization =
        Boolean(oauth.error) ||
        !oauth.status ||
        oauth.status.needsAuthorization ||
        !(await client.verifyLarkUserOAuth({ appId })).status?.authorized;
      if (!requiresAuthorization) continue;
      setNotice({
        key: `lark-user-oauth:${serverId}:${appId}`,
        title: "飞书用户授权已失效",
        message: `机器人“${bot.name ?? appId}”需要重新授权，群消息扫描、替身和相关任务将在授权前无法继续。\n\n请先在飞书开发者后台打开应用“${appId}”，在“开发配置 → 安全设置 → 重定向 URL”中添加并保存以下地址；完成发布后，再点击“立即授权”。`,
        actionLabel: authorizationOpened ? "重新打开授权链接" : "立即授权",
        setupLabel: "打开开发者后台",
        setupRedirectUri: DEFAULT_LARK_USER_OAUTH_REDIRECT_URI,
        setupAuthorization: async () => await openExternalUrl("https://open.feishu.cn/app"),
        openAuthorization: async () => {
          const started = await client.startLarkUserOAuth({
            appId,
            redirectUri: DEFAULT_LARK_USER_OAUTH_REDIRECT_URI,
          });
          if (started.error || !started.authorizationUrl) {
            throw new Error(started.error ?? "无法生成飞书授权链接");
          }
          await openExternalUrl(started.authorizationUrl);
          setAuthorizationOpened(true);
        },
        verifyAuthorization: async () => {
          const verified = await client.verifyLarkUserOAuth({ appId });
          if (verified.error || !verified.status?.authorized) {
            throw new Error(verified.error ?? "飞书授权校验未通过，请重新授权");
          }
          setAuthorizationOpened(false);
          setNotice(null);
        },
      });
      return;
    }
  }, [authorizationOpened, client, connected, serverId]);

  useEffect(() => {
    void check().catch(() => undefined);
    const timer = setInterval(
      () => void check().catch(() => undefined),
      DAILY_PERMISSION_CHECK_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [check]);

  const dismiss = useCallback(() => {
    setAuthorizationOpened(false);
    setNotice(null);
  }, []);
  return <AuthorizationNoticeDialog notice={notice} onDismiss={dismiss} />;
}

function CloudKnowledgePermissionMonitor() {
  const sessions = useSessionStore((state) => state.sessions);
  const notice = useMemo<AuthorizationNotice | null>(() => {
    for (const [serverId, session] of Object.entries(sessions)) {
      for (const pending of session.pendingPermissions.values()) {
        const metadata = pending.request.metadata;
        if (metadata?.permissionType !== "cloud-knowledge-auth") continue;
        const loginUrl = typeof metadata.loginUrl === "string" ? metadata.loginUrl : null;
        if (!loginUrl) continue;
        return {
          key: `cloud-knowledge:${serverId}:${pending.key}`,
          title: "云文档需要重新授权",
          message: pending.request.description ?? "云文档读取需要重新完成授权。",
          actionLabel: "打开授权链接",
          openAuthorization: async () => await openExternalUrl(loginUrl),
        };
      }
    }
    return null;
  }, [sessions]);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const visibleNotice = notice?.key === dismissedKey ? null : notice;
  const dismiss = useCallback(() => setDismissedKey(notice?.key ?? null), [notice?.key]);
  return <AuthorizationNoticeDialog notice={visibleNotice} onDismiss={dismiss} />;
}

function AuthorizationNoticeDialog({
  notice,
  onDismiss,
}: {
  notice: AuthorizationNotice | null;
  onDismiss: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const setup = useCallback(async () => {
    if (!notice?.setupAuthorization) return;
    setError(null);
    setSettingUp(true);
    try {
      await notice.setupAuthorization();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSettingUp(false);
    }
  }, [notice]);
  const setupPressed = useCallback(() => void setup(), [setup]);
  const authorize = useCallback(async () => {
    if (!notice) return;
    setError(null);
    setOpening(true);
    try {
      await notice.openAuthorization();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setOpening(false);
    }
  }, [notice]);
  const authorizePressed = useCallback(() => void authorize(), [authorize]);
  const verify = useCallback(async () => {
    if (!notice?.verifyAuthorization) return;
    setError(null);
    setVerifying(true);
    try {
      await notice.verifyAuthorization();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setVerifying(false);
    }
  }, [notice]);
  const verifyPressed = useCallback(() => void verify(), [verify]);
  if (!notice) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{notice.title}</Text>
          <Text selectable style={styles.message}>
            {notice.message}
          </Text>
          {notice.setupRedirectUri ? (
            <Text selectable style={styles.redirectUri}>
              {notice.setupRedirectUri}
            </Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.secondary}>
              <Text style={styles.secondaryText}>稍后处理</Text>
            </Pressable>
            {notice.setupAuthorization ? (
              <Pressable
                accessibilityRole="button"
                disabled={settingUp}
                onPress={setupPressed}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>
                  {settingUp ? "正在打开…" : (notice.setupLabel ?? "打开设置")}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={opening}
              onPress={authorizePressed}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>{opening ? "正在打开…" : notice.actionLabel}</Text>
            </Pressable>
            {notice.verifyAuthorization ? (
              <Pressable
                accessibilityRole="button"
                disabled={verifying}
                onPress={verifyPressed}
                style={styles.primary}
              >
                <Text style={styles.primaryText}>{verifying ? "正在校验…" : "已授权，校验"}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function PermissionAuthorizationMonitor() {
  const hosts = useHosts();
  return (
    <>
      {hosts.map((host) => (
        <LarkUserOAuthMonitor key={host.serverId} serverId={host.serverId} />
      ))}
      <CloudKnowledgePermissionMonitor />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: theme.spacing[6],
  },
  dialog: {
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    gap: theme.spacing[3],
    maxWidth: 560,
    padding: theme.spacing[4],
    width: "100%",
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  message: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  redirectUri: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
  error: { color: theme.colors.destructive, fontSize: theme.fontSize.sm },
  actions: { flexDirection: "row", gap: theme.spacing[2], justifyContent: "flex-end" },
  primary: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  primaryText: { color: theme.colors.accentForeground, fontSize: theme.fontSize.sm },
  secondary: {
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  secondaryText: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
}));
