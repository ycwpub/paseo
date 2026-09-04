import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
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

export function LarkUserOAuthCard({ serverId, appId }: { serverId: string; appId: string }) {
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

  const disconnect = useCallback(async () => {
    setLocalError(null);
    try {
      await oauth.disconnect();
      setAuthorizationState("");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  }, [oauth]);

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
          群搜索、邀请机器人入群和替身模式用户身份回复使用当前用户授权。Access Token 过期前会通过
          Refresh Token 自动续期。
        </Text>
        <Text style={settingsStyles.rowHint}>
          飞书应用需开通用户权限：读取群信息、添加和移除群成员、以用户身份发送消息、离线访问授权数据。
        </Text>
        <Text style={settingsStyles.rowTitle}>{formatAuthorizedIdentity(oauth.status)}</Text>
        <AuthorizationStartFields
          appId={appId}
          authorizationState={authorizationState}
          isAuthorized={isAuthorized}
          isMutating={oauth.isMutating}
          onStart={startAuthorization}
        />
        {isAuthorized ? (
          <Button variant="outline" size="sm" onPress={disconnect} loading={oauth.isMutating}>
            解除授权
          </Button>
        ) : null}
        <OAuthErrorMessages
          queryError={oauth.error}
          mutationError={oauth.mutationError}
          localError={localError}
        />
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    gap: theme.spacing[3],
  },
}));
