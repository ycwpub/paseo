import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Button } from "@/components/ui/button";
import { settingsStyles } from "@/styles/settings";

export function LarkContactFirstMessageCleanup({
  supported,
  appId,
  contactCount,
  connected,
  onClear,
}: {
  supported: boolean;
  appId: string | null;
  contactCount: number;
  connected: boolean;
  onClear: (appId: string) => Promise<number>;
}) {
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleClear = useCallback(async () => {
    const normalizedAppId = appId?.trim();
    if (!normalizedAppId || contactCount === 0) return;
    const { confirmDialog } = await import("@/utils/confirm-dialog");
    const confirmed = await confirmDialog({
      title: "清空全部首次消息？",
      message:
        "将清空当前机器人下所有联系人的首次消息内容，用户名、邮箱、ou_id 和首次消息时间不会删除。此操作无法撤销。",
      confirmLabel: "清空",
      cancelLabel: "取消",
      destructive: true,
    });
    if (!confirmed) return;
    setClearing(true);
    setError(null);
    setNotice(null);
    try {
      const clearedCount = await onClear(normalizedAppId);
      setNotice(`已清空 ${clearedCount} 个联系人的首次消息内容。`);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : String(clearError));
    } finally {
      setClearing(false);
    }
  }, [appId, contactCount, onClear]);

  if (!supported) return null;

  return (
    <View style={settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>首次消息内容</Text>
        <Text style={settingsStyles.rowHint}>
          当前机器人有 {contactCount} 个联系人保存了首次消息内容。
        </Text>
        {notice ? <Text style={settingsStyles.rowHint}>{notice}</Text> : null}
        {error ? <Text style={settingsStyles.rowError}>{error}</Text> : null}
      </View>
      <Button
        size="sm"
        variant="destructive"
        onPress={handleClear}
        loading={clearing}
        disabled={!connected || clearing || !appId || contactCount === 0}
        testID="host-page-lark-contacts-clear-first-messages"
      >
        清空全部首次消息
      </Button>
    </View>
  );
}
