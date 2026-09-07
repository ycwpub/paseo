import { type ComponentProps, useCallback, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  LarkDirectoryRecentPrivateUser,
  LarkDirectoryUser,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";

const DEFAULT_LOOKBACK_MINUTES = 30;
const MAX_LOOKBACK_MINUTES = 10_080;

function parseLookbackMinutes(value: string): number {
  const minutes = Number(value.trim());
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_LOOKBACK_MINUTES) {
    throw new Error("扫描时间范围必须是 1 到 10080 分钟");
  }
  return minutes;
}

function formatMessageTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function RecentPrivateUserRow({
  user,
  connected,
  adding,
  onAdd,
}: {
  user: LarkDirectoryRecentPrivateUser;
  connected: boolean;
  adding: boolean;
  onAdd: (user: LarkDirectoryRecentPrivateUser) => void;
}) {
  const handleAdd = useCallback(() => onAdd(user), [onAdd, user]);
  return (
    <View style={settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{user.displayName?.trim() || "未识别用户"}</Text>
        <Text selectable style={settingsStyles.rowHint}>
          {user.openId}
        </Text>
        <Text style={styles.messageText}>最近消息：{user.lastMessageContent}</Text>
        <Text style={settingsStyles.rowHint}>
          {formatMessageTime(user.lastMessageAt)} · 共 {user.messageCount} 条消息
        </Text>
      </View>
      <Button
        size="sm"
        variant="outline"
        onPress={handleAdd}
        loading={adding}
        disabled={!connected || adding || user.inDirectory}
        testID={`host-page-lark-contact-private-add-${user.openId}`}
      >
        {user.inDirectory ? "已在通讯录" : "加入通讯录"}
      </Button>
    </View>
  );
}

export function LarkContactPrivateUserScan({
  appId,
  connected,
  onScan,
  onAdd,
}: {
  appId: string | null;
  connected: boolean;
  onScan: (appId: string, lookbackMinutes: number) => Promise<LarkDirectoryRecentPrivateUser[]>;
  onAdd: (user: LarkDirectoryRecentPrivateUser) => Promise<LarkDirectoryUser>;
}) {
  const [lookbackMinutes, setLookbackMinutes] = useState(String(DEFAULT_LOOKBACK_MINUTES));
  const [results, setResults] = useState<LarkDirectoryRecentPrivateUser[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [addingOpenId, setAddingOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScan = useCallback(async () => {
    const normalizedAppId = appId?.trim();
    if (!normalizedAppId) {
      setError("请先选择已配置 App ID 的飞书机器人");
      return;
    }
    let minutes: number;
    try {
      minutes = parseLookbackMinutes(lookbackMinutes);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : String(scanError));
      return;
    }
    setScanning(true);
    setError(null);
    try {
      setResults(await onScan(normalizedAppId, minutes));
    } catch (scanError) {
      setResults(null);
      setError(scanError instanceof Error ? scanError.message : String(scanError));
    } finally {
      setScanning(false);
    }
  }, [appId, lookbackMinutes, onScan]);

  const handleAdd = useCallback(
    async (candidate: LarkDirectoryRecentPrivateUser) => {
      setAddingOpenId(candidate.openId);
      setError(null);
      try {
        await onAdd(candidate);
        setResults(
          (current) =>
            current?.map((user) =>
              user.appId === candidate.appId && user.openId === candidate.openId
                ? { ...user, inDirectory: true }
                : user,
            ) ?? null,
        );
      } catch (addError) {
        setError(addError instanceof Error ? addError.message : String(addError));
      } finally {
        setAddingOpenId(null);
      }
    },
    [onAdd],
  );

  return (
    <SettingsSection title="扫描最近私聊用户">
      <View style={styles.formCard}>
        <Field
          label="扫描时间范围（分钟）"
          hint="扫描授权用户最近的飞书私聊消息，默认最近 30 分钟。"
          error={error}
        >
          <View style={styles.scanRow}>
            <View style={styles.scanInput}>
              <FormTextInput
                value={lookbackMinutes}
                onChangeText={setLookbackMinutes}
                keyboardType="number-pad"
                placeholder="30"
                testID="host-page-lark-contact-private-lookback"
              />
            </View>
            <Button
              variant="outline"
              onPress={handleScan}
              loading={scanning}
              disabled={!connected || scanning || !appId}
              testID="host-page-lark-contact-private-scan"
            >
              扫描
            </Button>
          </View>
        </Field>
        {results ? (
          <View testID="host-page-lark-contact-private-results">
            <Text style={settingsStyles.rowTitle}>扫描结果（{results.length}）</Text>
            {results.length > 0 ? (
              <View style={settingsStyles.card}>
                {results.map((user) => (
                  <RecentPrivateUserRow
                    key={`${user.appId}:${user.openId}`}
                    user={user}
                    connected={connected}
                    adding={addingOpenId === user.openId}
                    onAdd={handleAdd}
                  />
                ))}
              </View>
            ) : (
              <Text style={settingsStyles.rowHint}>指定时间范围内没有发现私聊用户。</Text>
            )}
          </View>
        ) : null}
      </View>
    </SettingsSection>
  );
}

export function OptionalLarkContactPrivateUserScan({
  supported,
  ...props
}: ComponentProps<typeof LarkContactPrivateUserScan> & {
  supported: boolean;
}) {
  if (!supported) return null;
  return <LarkContactPrivateUserScan {...props} />;
}

const styles = StyleSheet.create((theme) => ({
  formCard: {
    gap: theme.spacing[4],
  },
  scanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  scanInput: {
    flex: 1,
    minWidth: 0,
  },
  messageText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[2],
  },
}));
