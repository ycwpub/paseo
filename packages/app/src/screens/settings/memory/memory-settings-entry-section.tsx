import { useCallback } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import {
  buildHostMemoryRoute,
  buildHostMemorySettingsPageRoute,
  type HostMemorySettingsPage,
} from "@/utils/host-feature-routes";

interface MemorySettingsEntry {
  id: "content" | HostMemorySettingsPage;
  title: string;
  description: string;
}

const ENTRIES: readonly MemorySettingsEntry[] = [
  {
    id: "content",
    title: "记忆内容",
    description: "查看、编辑和删除全局、Project 与助手记忆。",
  },
  {
    id: "policies",
    title: "记忆规范",
    description: "定义不同记忆范围允许保存哪些长期信息。",
  },
  {
    id: "transfer",
    title: "导入与导出",
    description: "导出完整记忆数据，或通过 JSON 合并、替换当前记忆。",
  },
];

function MemorySettingsEntryRow({
  serverId,
  entry,
  memoryCount,
}: {
  serverId: string;
  entry: MemorySettingsEntry;
  memoryCount: number;
}) {
  const router = useRouter();
  const open = useCallback(() => {
    router.push(
      entry.id === "content"
        ? buildHostMemoryRoute(serverId)
        : buildHostMemorySettingsPageRoute(serverId, entry.id),
    );
  }, [entry.id, router, serverId]);
  const description =
    entry.id === "content"
      ? `${entry.description} 当前共 ${memoryCount} 条记忆。`
      : entry.description;

  return (
    <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{entry.title}</Text>
        <Text style={settingsStyles.rowHint}>{description}</Text>
      </View>
      <Button size="sm" variant="outline" onPress={open}>
        打开
      </Button>
    </View>
  );
}

export function MemorySettingsEntrySection({
  serverId,
  memoryCount,
}: {
  serverId: string;
  memoryCount: number;
}) {
  return (
    <SettingsSection title="记忆管理">
      <View style={settingsStyles.card}>
        {ENTRIES.map((entry) => (
          <MemorySettingsEntryRow
            key={entry.id}
            serverId={serverId}
            entry={entry}
            memoryCount={memoryCount}
          />
        ))}
      </View>
    </SettingsSection>
  );
}
