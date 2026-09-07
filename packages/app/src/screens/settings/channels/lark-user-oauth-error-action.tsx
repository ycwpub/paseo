import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { DEFAULT_LARK_USER_OAUTH_REDIRECT_URI } from "@getpaseo/protocol/messages";
import { settingsStyles } from "@/styles/settings";
import { openExternalUrl } from "@/utils/open-external-url";
import { useLarkUserOAuth } from "./use-lark-user-oauth";

const OAUTH_REQUIRED_ERROR_MARKERS = [
  "飞书用户身份未授权或已失效",
  "请先完成 OAuth 授权",
  "请先为 App ID",
  "用户身份权限",
  "缺少",
  "未授权",
  "已过期",
  "重新授权",
  "99991679",
];

export function isLarkUserOAuthRequiredError(message: string): boolean {
  return (
    (message.includes("OAuth") || message.includes("用户身份权限")) &&
    OAUTH_REQUIRED_ERROR_MARKERS.some((marker) => message.includes(marker))
  );
}

export function LarkUserOAuthErrorAction({
  serverId,
  appId,
  errorMessage,
  onAuthorized,
}: {
  serverId: string;
  appId: string;
  errorMessage: string;
  onAuthorized?: () => void;
}) {
  const oauth = useLarkUserOAuth(serverId, appId);
  const refreshOAuthStatus = oauth.refreshStatus;
  const [authorizationState, setAuthorizationState] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const startAuthorization = useCallback(async () => {
    setLocalError(null);
    try {
      const result = await oauth.start(DEFAULT_LARK_USER_OAUTH_REDIRECT_URI);
      setAuthorizationState(result.state);
      await openExternalUrl(result.authorizationUrl);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  }, [oauth]);

  useEffect(() => {
    if (!authorizationState || oauth.status?.authorized) return;
    const timer = setInterval(() => {
      void refreshOAuthStatus();
    }, 1_000);
    return () => clearInterval(timer);
  }, [authorizationState, oauth.status?.authorized, refreshOAuthStatus]);

  useEffect(() => {
    if (!authorizationState || !oauth.status?.authorized) return;
    setAuthorizationState("");
    onAuthorized?.();
  }, [authorizationState, oauth.status?.authorized, onAuthorized]);

  if (!appId.trim() || !isLarkUserOAuthRequiredError(errorMessage)) return null;

  const actionError = localError ?? oauth.mutationError?.message ?? null;
  let linkLabel = "立即授权";
  if (oauth.isMutating) {
    linkLabel = "正在生成授权链接…";
  } else if (authorizationState) {
    linkLabel = "重新打开授权链接";
  }

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="立即授权飞书用户身份"
        disabled={oauth.isMutating}
        onPress={startAuthorization}
        style={styles.link}
      >
        <Text style={styles.linkText}>{linkLabel}</Text>
      </Pressable>
      {authorizationState ? (
        <Text style={settingsStyles.rowHint}>已打开飞书授权页面，完成后将自动刷新。</Text>
      ) : null}
      {actionError ? <Text style={settingsStyles.rowError}>{actionError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    alignItems: "flex-start",
    gap: theme.spacing[1],
  },
  link: {
    alignSelf: "flex-start",
  },
  linkText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    textDecorationLine: "underline",
  },
}));
