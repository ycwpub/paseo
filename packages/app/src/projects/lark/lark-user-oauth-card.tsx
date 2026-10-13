import { useCallback, useEffect, useState } from "react";
import { Modal, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  DEFAULT_LARK_USER_OAUTH_REDIRECT_URI,
  type LarkUserOAuthStatus,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { openExternalUrl } from "@/utils/open-external-url";
import { formatLarkUserIdentity } from "@/screens/settings/channels/lark-directory-format";
import { isLarkUserOAuthRequiredError } from "@/screens/settings/channels/lark-permission-error";
import { useLarkUserOAuth } from "@/screens/settings/channels/use-lark-user-oauth";

function formatAuthorizedIdentity(status: LarkUserOAuthStatus | null): string {
  if (!status?.authorized) return "尚未授权";
  const identity = formatLarkUserIdentity(status);
  return identity ? `已授权：${identity}` : "已授权";
}

interface AuthorizationStartFieldsProps {
  appId: string;
  authorizationState: string;
  isAuthorized: boolean;
  isMutating: boolean;
  onStart: () => void;
}

function AuthorizationStartFields({
  appId,
  authorizationState,
  isAuthorized,
  isMutating,
  onStart,
}: AuthorizationStartFieldsProps) {
  if (isAuthorized && !authorizationState) return null;
  return (
    <>
      <Field
        label="OAuth 回调地址"
        hint="请将该地址添加到飞书开发者后台的重定向 URL。授权完成后 Paseo 会自动处理回调。"
      >
        <FormTextInput
          value={DEFAULT_LARK_USER_OAUTH_REDIRECT_URI}
          editable={false}
          selectTextOnFocus
          autoCapitalize="none"
        />
      </Field>
      <Button
        variant="outline"
        size="sm"
        onPress={onStart}
        loading={isMutating}
        disabled={!appId.trim()}
      >
        {authorizationState ? "重新打开授权页面" : "授权飞书用户"}
      </Button>
      {authorizationState ? (
        <Text style={settingsStyles.rowHint}>等待浏览器完成授权，成功后本页面会自动更新。</Text>
      ) : null}
    </>
  );
}

function OAuthErrorMessages({
  queryError,
  mutationError,
  localError,
}: {
  queryError: Error | null;
  mutationError: Error | null;
  localError: string | null;
}) {
  return (
    <>
      {queryError ? <Text style={settingsStyles.rowError}>{queryError.message}</Text> : null}
      {mutationError ? <Text style={settingsStyles.rowError}>{mutationError.message}</Text> : null}
      {localError ? <Text style={settingsStyles.rowError}>{localError}</Text> : null}
    </>
  );
}

function ExpiredAuthorizationDialog({
  appId,
  error,
  onAuthorize,
  onDismiss,
  onOpenDeveloperConsole,
}: {
  appId: string;
  error: string | null;
  onAuthorize: () => void;
  onDismiss: () => void;
  onOpenDeveloperConsole: () => void;
}) {
  if (!error) return null;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>飞书用户授权已失效</Text>
          <Text selectable style={styles.dialogMessage}>
            App ID “{appId}”的用户授权已过期、被撤销或缺少所需权限。请先在飞书开发者后台的 “开发配置
            → 安全设置 → 重定向 URL”中登记以下地址，保存并发布后再重新授权。
          </Text>
          <Text selectable style={styles.redirectUri}>
            {DEFAULT_LARK_USER_OAUTH_REDIRECT_URI}
          </Text>
          <Text selectable style={styles.dialogError}>
            {error}
          </Text>
          <View style={styles.dialogActions}>
            <Button variant="outline" size="sm" onPress={onDismiss}>
              稍后处理
            </Button>
            <Button variant="outline" size="sm" onPress={onOpenDeveloperConsole}>
              打开开发者后台
            </Button>
            <Button variant="default" size="sm" onPress={onAuthorize}>
              立即授权
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function LarkUserOAuthCard({ serverId, appId }: { serverId: string; appId: string }) {
  const oauth = useLarkUserOAuth(serverId, appId);
  const refreshOAuthStatus = oauth.refreshStatus;
  const [authorizationState, setAuthorizationState] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [expiredAuthorizationError, setExpiredAuthorizationError] = useState<string | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);

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

  const disconnect = useCallback(async () => {
    setLocalError(null);
    setVerificationMessage(null);
    try {
      await oauth.disconnect();
      setAuthorizationState("");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  }, [oauth]);

  const verifyAuthorization = useCallback(async () => {
    setLocalError(null);
    setVerificationMessage(null);
    setExpiredAuthorizationError(null);
    try {
      const status = await oauth.verify();
      if (!status.authorized || status.needsAuthorization) {
        setExpiredAuthorizationError("飞书用户授权已失效，请重新完成授权。");
        return;
      }
      setVerificationMessage("权限校验通过，当前用户授权有效。");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isLarkUserOAuthRequiredError(message)) {
        setExpiredAuthorizationError(message);
        return;
      }
      setLocalError(message);
    }
  }, [oauth]);
  const handleVerifyAuthorization = useCallback(() => {
    void verifyAuthorization();
  }, [verifyAuthorization]);

  const openDeveloperConsole = useCallback(() => {
    void openExternalUrl("https://open.feishu.cn/app");
  }, []);

  const dismissExpiredAuthorization = useCallback(() => {
    setExpiredAuthorizationError(null);
  }, []);

  const authorizeFromExpiredDialog = useCallback(() => {
    void startAuthorization().then(() => setExpiredAuthorizationError(null));
  }, [startAuthorization]);

  const isAuthorized = oauth.status?.authorized === true;

  useEffect(() => {
    if (!authorizationState || isAuthorized) return;
    const timer = setInterval(() => {
      void refreshOAuthStatus();
    }, 1_000);
    return () => clearInterval(timer);
  }, [authorizationState, isAuthorized, refreshOAuthStatus]);

  useEffect(() => {
    if (isAuthorized) setAuthorizationState("");
  }, [isAuthorized]);

  return (
    <SettingsSection title="飞书用户身份授权">
      <View style={styles.content}>
        <Text style={settingsStyles.rowHint}>
          当前授权用户即替身用户。Paseo 使用该身份搜索消息、读取私聊、创建转发群并邀请机器人入群；
          回答始终由机器人发送。Access Token 过期前会通过 Refresh Token 自动续期。
        </Text>
        <Text style={settingsStyles.rowHint}>
          飞书应用需开通用户权限：读取群信息、添加群成员、读取消息（im:message:readonly）、
          读取私聊消息、搜索消息和离线访问授权数据。
        </Text>
        {oauth.status?.needsAuthorization && oauth.status.scope ? (
          <Text style={settingsStyles.rowError}>
            当前用户授权缺少最新权限或已失效，请点击下方按钮重新授权。
          </Text>
        ) : null}
        <Text style={settingsStyles.rowTitle}>{formatAuthorizedIdentity(oauth.status)}</Text>
        <AuthorizationStartFields
          appId={appId}
          authorizationState={authorizationState}
          isAuthorized={isAuthorized}
          isMutating={oauth.isMutating}
          onStart={startAuthorization}
        />
        {isAuthorized ? (
          <>
            <View style={styles.actions}>
              <Button
                variant="outline"
                size="sm"
                onPress={handleVerifyAuthorization}
                loading={oauth.isMutating}
              >
                一键校验权限
              </Button>
              <Button variant="outline" size="sm" onPress={disconnect} loading={oauth.isMutating}>
                解除授权
              </Button>
            </View>
            {verificationMessage ? (
              <Text style={settingsStyles.rowHint}>{verificationMessage}</Text>
            ) : null}
          </>
        ) : null}
        <OAuthErrorMessages
          queryError={oauth.error}
          mutationError={oauth.mutationError}
          localError={localError}
        />
      </View>
      <ExpiredAuthorizationDialog
        appId={appId}
        error={expiredAuthorizationError}
        onAuthorize={authorizeFromExpiredDialog}
        onDismiss={dismissExpiredAuthorization}
        onOpenDeveloperConsole={openDeveloperConsole}
      />
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    gap: theme.spacing[3],
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
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
  dialogTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  dialogMessage: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  redirectUri: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
  dialogError: { color: theme.colors.destructive, fontSize: theme.fontSize.sm },
  dialogActions: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] },
}));
