import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { LarkBotApplication } from "@getpaseo/protocol/messages";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { settingsStyles } from "@/styles/settings";
import { openExternalUrl } from "@/utils/open-external-url";
import { isLarkBotPermissionRequiredError } from "./lark-permission-error";

export { isLarkBotPermissionRequiredError } from "./lark-permission-error";

function permissionActionLabel(input: {
  starting: boolean;
  application: LarkBotApplication | null;
}): string {
  if (input.starting) return "正在生成权限链接…";
  if (input.application?.qrUrl) return "重新打开权限链接";
  if (input.application?.status === "completed") return "权限更新完成";
  return "更新机器人权限";
}

export function LarkBotPermissionErrorAction({
  serverId,
  appId,
  botId,
  errorMessage,
  onAuthorized,
}: {
  serverId: string;
  appId: string;
  botId: string;
  errorMessage: string;
  onAuthorized?: () => void;
}) {
  const client = useHostRuntimeClient(serverId);
  const [application, setApplication] = useState<LarkBotApplication | null>(null);
  const [starting, setStarting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const openedQrUrl = useRef<string | null>(null);

  const start = useCallback(async () => {
    if (!client) return;
    setStarting(true);
    setLocalError(null);
    try {
      const result = await client.applyLarkBot({ appId, botId });
      if (result.error) throw new Error(result.error);
      if (!result.application) throw new Error("未能生成飞书机器人权限更新链接");
      setApplication(result.application);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  }, [appId, botId, client]);

  useEffect(() => {
    if (
      !client ||
      !application ||
      application.status === "completed" ||
      application.status === "failed"
    ) {
      return;
    }
    const timer = setInterval(() => {
      void (async () => {
        try {
          const result = await client.getLarkBotApplication({
            applicationId: application.id,
          });
          if (result.error) throw new Error(result.error);
          setApplication(result.application);
        } catch (error) {
          setLocalError(error instanceof Error ? error.message : String(error));
        }
      })();
    }, 1_000);
    return () => clearInterval(timer);
  }, [application, client]);

  useEffect(() => {
    const qrUrl = application?.qrUrl;
    if (!qrUrl || openedQrUrl.current === qrUrl) return;
    openedQrUrl.current = qrUrl;
    void openExternalUrl(qrUrl);
  }, [application?.qrUrl]);

  useEffect(() => {
    if (application?.status === "completed") onAuthorized?.();
  }, [application?.status, onAuthorized]);

  const reopen = useCallback(() => {
    if (application?.qrUrl) void openExternalUrl(application.qrUrl);
  }, [application?.qrUrl]);

  if (!appId.trim() || !botId.trim() || !isLarkBotPermissionRequiredError(errorMessage)) {
    return null;
  }
  const linkLabel = permissionActionLabel({ starting, application });

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="更新飞书机器人权限"
        disabled={starting || application?.status === "completed"}
        onPress={application?.qrUrl ? reopen : start}
        style={styles.link}
      >
        <Text style={styles.linkText}>{linkLabel}</Text>
      </Pressable>
      {application?.message ? (
        <Text style={settingsStyles.rowHint}>{application.message}</Text>
      ) : null}
      {application?.error || localError ? (
        <Text style={settingsStyles.rowError}>{application?.error ?? localError}</Text>
      ) : null}
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
