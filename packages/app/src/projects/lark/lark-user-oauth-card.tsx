import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { LarkUserOAuthStatus } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { openExternalUrl } from "@/utils/open-external-url";
import { useLarkUserOAuth } from "@/screens/settings/channels/use-lark-user-oauth";

const DEFAULT_REDIRECT_URI = "paseo://oauth/lark";

function formatAuthorizedIdentity(status: LarkUserOAuthStatus | null): string {
  if (!status?.authorized) return "尚未授权";
  if (status.displayName && status.email) {
    return `已授权：${status.displayName}（${status.email}）`;
  }
  const identity = status.displayName || status.email;
  return identity ? `已授权：${identity}` : "已授权";
}

interface AuthorizationStartFieldsProps {
  appId: string;
  authorizationState: string;
  isAuthorized: boolean;
  isMutating: boolean;
  redirectUri: string;
  onRedirectUriChange: (value: string) => void;
  onStart: () => void;
}

function AuthorizationStartFields({
  appId,
  authorizationState,
  isAuthorized,
  isMutating,
  redirectUri,
  onRedirectUriChange,
  onStart,
}: AuthorizationStartFieldsProps) {
  if (isAuthorized && !authorizationState) return null;
  return (
    <>
      <Field label="OAuth 回调地址" hint="需要与飞书开发者后台配置的重定向 URL 完全一致。">
        <FormTextInput
          value={redirectUri}
          onChangeText={onRedirectUriChange}
          editable={!isMutating}
          autoCapitalize="none"
        />
      </Field>
      <Button
        variant="outline"
        size="sm"
        onPress={onStart}
        loading={isMutating}
        disabled={!appId.trim() || !redirectUri.trim()}
      >
        {authorizationState ? "重新打开授权页面" : "授权飞书用户"}
      </Button>
    </>
  );
}

interface AuthorizationCompleteFieldsProps {
  authorizationState: string;
  callbackValue: string;
  isMutating: boolean;
  onCallbackValueChange: (value: string) => void;
  onComplete: () => void;
}

function AuthorizationCompleteFields({
  authorizationState,
  callbackValue,
  isMutating,
  onCallbackValueChange,
  onComplete,
}: AuthorizationCompleteFieldsProps) {
  if (!authorizationState) return null;
  return (
    <>
      <Field
        label="授权回调"
        hint="授权完成后，粘贴浏览器地址栏中的完整回调地址；也可以只粘贴 code。"
      >
        <FormTextInput
          value={callbackValue}
          onChangeText={onCallbackValueChange}
          editable={!isMutating}
          autoCapitalize="none"
          placeholder="paseo://oauth/lark?code=...&state=..."
        />
      </Field>
      <Button size="sm" onPress={onComplete} loading={isMutating} disabled={!callbackValue.trim()}>
        完成授权
      </Button>
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
  const [redirectUri, setRedirectUri] = useState(DEFAULT_REDIRECT_URI);
  const [authorizationState, setAuthorizationState] = useState("");
  const [callbackValue, setCallbackValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const startAuthorization = useCallback(async () => {
    setLocalError(null);
    try {
      const result = await oauth.start(redirectUri.trim());
      setAuthorizationState(result.state);
      await openExternalUrl(result.authorizationUrl);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  }, [oauth, redirectUri]);

  const completeAuthorization = useCallback(async () => {
    setLocalError(null);
    try {
      await oauth.complete({
        codeOrCallbackUrl: callbackValue.trim(),
        state: authorizationState,
      });
      setCallbackValue("");
      setAuthorizationState("");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  }, [authorizationState, callbackValue, oauth]);

  const disconnect = useCallback(async () => {
    setLocalError(null);
    try {
      await oauth.disconnect();
      setAuthorizationState("");
      setCallbackValue("");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  }, [oauth]);

  const isAuthorized = oauth.status?.authorized === true;

  return (
    <SettingsSection title="飞书用户身份授权">
      <View style={styles.content}>
        <Text style={settingsStyles.rowHint}>
          群搜索和邀请机器人入群使用当前用户身份。Access Token 过期前会通过 Refresh Token 自动续期。
        </Text>
        <Text style={settingsStyles.rowHint}>
          飞书应用需开通用户权限：读取群信息、添加和移除群成员、离线访问授权数据。
        </Text>
        <Text style={settingsStyles.rowTitle}>{formatAuthorizedIdentity(oauth.status)}</Text>
        <AuthorizationStartFields
          appId={appId}
          authorizationState={authorizationState}
          isAuthorized={isAuthorized}
          isMutating={oauth.isMutating}
          redirectUri={redirectUri}
          onRedirectUriChange={setRedirectUri}
          onStart={startAuthorization}
        />
        <AuthorizationCompleteFields
          authorizationState={authorizationState}
          callbackValue={callbackValue}
          isMutating={oauth.isMutating}
          onCallbackValueChange={setCallbackValue}
          onComplete={completeAuthorization}
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
