import { useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  PaseoMemorySettings,
  PaseoMemoryState,
  PaseoMemoryUser,
  PaseoMemoryUserOperation,
} from "@getpaseo/protocol/messages";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { MemorySettingsCard } from "./memory-settings-card";
import { MemorySettingsEntrySection } from "./memory-settings-entry-section";
import { MemoryUserCard } from "./memory-user-card";

interface MemorySectionContentProps {
  serverId: string;
  memory: PaseoMemoryState;
  isMutating: boolean;
  visibleError: string | null;
  usersSupported: boolean;
  onSaveSettings: (settings: PaseoMemorySettings) => Promise<void>;
  onChangeUser: (operation: PaseoMemoryUserOperation) => Promise<void>;
  onClearAll: () => Promise<void>;
  onConsolidate: () => Promise<void>;
}

function extractionStatus(memory: PaseoMemoryState): string {
  const parts = [`${memory.stats.pendingExtractions} 个待处理提取任务`];
  if (memory.stats.lastExtractedAt) {
    parts.push(`最近学习 ${new Date(memory.stats.lastExtractedAt).toLocaleString()}`);
  }
  if (memory.stats.lastConsolidatedAt) {
    parts.push(`最近整理 ${new Date(memory.stats.lastConsolidatedAt).toLocaleString()}`);
  }
  return parts.join(" · ");
}

export function MemorySectionContent({
  serverId,
  memory,
  isMutating,
  visibleError,
  usersSupported,
  onSaveSettings,
  onChangeUser,
  onClearAll,
  onConsolidate,
}: MemorySectionContentProps) {
  const users = useMemo<readonly PaseoMemoryUser[]>(
    () =>
      memory.users?.length
        ? memory.users
        : [
            {
              id: "default",
              name: "默认用户",
              createdAt: "",
              updatedAt: "",
            },
          ],
    [memory.users],
  );
  const activeUserId = memory.activeUserId ?? users[0]!.id;

  return (
    <View>
      <SettingsSection title="长期记忆">
        <MemorySettingsCard
          settings={memory.settings}
          disabled={isMutating}
          onChange={onSaveSettings}
        />
        {usersSupported ? (
          <MemoryUserCard
            users={users}
            activeUserId={activeUserId}
            disabled={isMutating}
            onChange={onChangeUser}
          />
        ) : null}
        {visibleError ? (
          <Alert title="无法更新记忆" description={visibleError} variant="error" />
        ) : null}
        <View style={styles.stats}>
          <Text style={settingsStyles.rowHint}>
            有效 {memory.stats.activeCount ?? memory.stats.detailCount} · 已被替代{" "}
            {memory.stats.supersededCount ?? 0} · 已过期 {memory.stats.expiredCount ?? 0} · 有争议{" "}
            {memory.stats.disputedCount ?? 0}
          </Text>
          <Text style={settingsStyles.rowHint}>{extractionStatus(memory)}</Text>
        </View>
        <View style={styles.actions}>
          <Button size="sm" variant="outline" disabled={isMutating} onPress={onConsolidate}>
            立即整理
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isMutating || memory.details.length === 0}
            onPress={onClearAll}
          >
            清空全部
          </Button>
        </View>
      </SettingsSection>

      <MemorySettingsEntrySection serverId={serverId} memoryCount={memory.details.length} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  stats: {
    gap: theme.spacing[1],
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
}));
