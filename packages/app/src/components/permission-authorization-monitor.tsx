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
}

function LarkUserOAuthMonitor({ serverId }: { serverId: string }) {
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const [notice, setNotice] = useState<AuthorizationNotice | null>(null);

  const check = useCallback(async () => {
    if (!client || !connected) return;
    const channel = await client.getLarkChannelStatus();
    if (channel.error) return;
    for (const bot of channel.status?.bots ?? []) {
      const appId = bot.appId?.trim();
      if (!appId) continue;
      const oauth = await client.getLarkUserOAuthStatus({ appId });
      if (oauth.error || !oauth.status?.needsAuthorization) continue;
      setNotice({
        key: `lark-user-oauth:${serverId}:${appId}`,
        title: "飞书用户授权已失效",
        message: `机器人“${bot.name ?? appId}”需要重新授权，群消息扫描、替身和相关任务将在授权前无法继续。`,
        actionLabel: "立即授权",
        openAuthorization: async () => {
          const started = await client.startLarkUserOAuth({
            appId,
            redirectUri: DEFAULT_LARK_USER_OAUTH_REDIRECT_URI,
          });
          if (started.error || !started.authorizationUrl) {
            throw new Error(started.error ?? "无法生成飞书授权链接");
          }
          await openExternalUrl(started.authorizationUrl);
        },
      });
      return;
    }
  }, [client, connected, serverId]);

  useEffect(() => {
    void check().catch(() => undefined);
    const timer = setInterval(
      () => void check().catch(() => undefined),
      DAILY_PERMISSION_CHECK_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [check]);

  const dismiss = useCallback(() => setNotice(null), []);
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
  if (!notice) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{notice.title}</Text>
          <Text selectable style={styles.message}>
            {notice.message}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.secondary}>
              <Text style={styles.secondaryText}>稍后处理</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={opening}
              onPress={authorizePressed}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>{opening ? "正在打开…" : notice.actionLabel}</Text>
            </Pressable>
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
