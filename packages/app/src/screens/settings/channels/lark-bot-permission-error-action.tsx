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
  verifying: boolean;
  verified: boolean;
  verificationFailed: boolean;
}): string {
  if (input.starting) return "正在生成权限链接…";
  if (input.application?.qrUrl) return "重新打开权限链接";
  if (input.application?.status === "completed" && input.verifying) return "正在验证并重新执行…";
  if (input.application?.status === "completed" && input.verified)
    return "权限已生效，任务已重新执行";
  if (input.application?.status === "completed" && input.verificationFailed)
    return "重新验证并执行";
  if (input.application?.status === "completed") return "权限配置已提交";
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
  onAuthorized?: () => Promise<void> | void;
}) {
  const client = useHostRuntimeClient(serverId);
  const [application, setApplication] = useState<LarkBotApplication | null>(null);
  const [starting, setStarting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const openedQrUrl = useRef<string | null>(null);
  const verifiedApplicationId = useRef<string | null>(null);

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

  const verifyAndContinue = useCallback(async () => {
    if (!onAuthorized || verifying) return;
    setVerifying(true);
    setVerified(false);
    setLocalError(null);
    try {
      await onAuthorized();
      setVerified(true);
    } catch (error) {
      setLocalError(
        `权限配置已提交，但重新执行任务失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setVerifying(false);
    }
  }, [onAuthorized, verifying]);

  useEffect(() => {
    if (application?.status !== "completed" || verifiedApplicationId.current === application.id) {
      return;
    }
    verifiedApplicationId.current = application.id;
    void verifyAndContinue();
  }, [application, verifyAndContinue]);

  const reopen = useCallback(() => {
    if (application?.qrUrl) void openExternalUrl(application.qrUrl);
  }, [application?.qrUrl]);

  const handlePress = useCallback(() => {
    if (application?.status === "completed") {
      void verifyAndContinue();
      return;
    }
    if (application?.qrUrl) {
      reopen();
      return;
    }
    void start();
  }, [application?.qrUrl, application?.status, reopen, start, verifyAndContinue]);

  if (!appId.trim() || !botId.trim() || !isLarkBotPermissionRequiredError(errorMessage)) {
    return null;
  }
  const linkLabel = permissionActionLabel({
    starting,
    application,
    verifying,
    verified,
    verificationFailed: Boolean(localError),
  });

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="更新飞书机器人权限"
        disabled={
          starting ||
          verifying ||
          (application?.status === "completed" && (verified || !onAuthorized))
        }
        onPress={handlePress}
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
