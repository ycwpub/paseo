import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SettingsTextAreaCard } from "@/components/settings-textarea";
import { useMemory } from "@/hooks/use-memory";
import { useHostFeature } from "@/runtime/host-features";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { confirmDialog } from "@/utils/confirm-dialog";
import type { HostMemorySettingsPage } from "@/utils/host-routes";
import { MemoryHostSyncCard } from "./memory-host-sync-card";
import { MemoryScopePoliciesSection } from "./memory-scope-policies-section";
import { MemoryTransferCard } from "./memory-transfer-card";

export const MEMORY_SETTINGS_PAGE_TITLES: Record<HostMemorySettingsPage, string> = {
  policies: "记忆规范",
  summary: "总记忆文件",
  sync: "多主机记忆同步",
  transfer: "导入与导出",
};

function MemorySummaryPage({
  summary,
  summaryPath,
  disabled,
  onSave,
}: {
  summary: string;
  summaryPath: string;
  disabled: boolean;
  onSave: (summary: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(summary);
  useEffect(() => setDraft(summary), [summary, summaryPath]);
  const save = useCallback(() => onSave(draft), [draft, onSave]);
  const saveAction = useMemo(
    () => (
      <Button size="sm" disabled={disabled || draft === summary} onPress={save}>
        保存
      </Button>
    ),
    [disabled, draft, save, summary],
  );

  return (
    <SettingsSection title="总记忆文件" trailing={saveAction}>
      <View style={settingsStyles.card}>
        <View style={styles.summary}>
          <View>
            <Text style={settingsStyles.rowTitle}>文件存储路径</Text>
            <Text selectable style={styles.path}>
              {summaryPath}
            </Text>
          </View>
          <SettingsTextAreaCard
            accessibilityLabel="Paseo 记忆总览"
            value={draft}
            onChangeText={setDraft}
            style={styles.summaryInput}
          />
        </View>
      </View>
    </SettingsSection>
  );
}

export function MemorySettingsPage({
  serverId,
  page,
}: {
  serverId: string;
  page: HostMemorySettingsPage;
}) {
  const supported = useHostFeature(serverId, "memory");
  const syncSupported = useHostFeature(serverId, "memorySync");
  const { memory, isLoading, error, updateMemory, isMutating, mutationError } = useMemory(
    serverId,
    {
      enabled: supported,
    },
  );
  const saveSummary = useCallback(
    async (summary: string) => {
      await updateMemory({ summary });
    },
    [updateMemory],
  );
  const importMemory = useCallback(
    async (json: string, replace: boolean) => {
      if (replace) {
        const confirmed = await confirmDialog({
          title: "替换全部 Paseo 记忆？",
          message: "应用导入内容前会删除当前记忆。",
          confirmLabel: "替换",
          destructive: true,
        });
        if (!confirmed) return;
      }
      await updateMemory({ importJson: json, replaceOnImport: replace });
    },
    [updateMemory],
  );

  if (!supported) {
    return (
      <Alert
        variant="warning"
        title="记忆功能需要更新主机"
        description="请更新所选主机的 Paseo 服务后再使用长期记忆。"
      />
    );
  }
  if (isLoading || !memory) {
    return (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowHint}>{error?.message ?? "正在加载记忆…"}</Text>
        </View>
      </View>
    );
  }

  const visibleError = mutationError?.message ?? error?.message ?? null;
  let content;
  switch (page) {
    case "policies":
      content = <MemoryScopePoliciesSection serverId={serverId} memory={memory} />;
      break;
    case "summary":
      content = (
        <MemorySummaryPage
          summary={memory.summary}
          summaryPath={memory.summaryPath}
          disabled={isMutating}
          onSave={saveSummary}
        />
      );
      break;
    case "sync":
      content = syncSupported ? (
        <SettingsSection title="多主机记忆同步">
          <MemoryHostSyncCard serverId={serverId} memory={memory} disabled={isMutating} />
        </SettingsSection>
      ) : (
        <Alert
          variant="warning"
          title="当前主机不支持记忆同步"
          description="请更新所选主机的 Paseo 服务后再试。"
        />
      );
      break;
    case "transfer":
      content = (
        <SettingsSection title="导入与导出">
          <MemoryTransferCard
            exportJson={memory.exportJson ?? ""}
            disabled={isMutating}
            onImport={importMemory}
          />
        </SettingsSection>
      );
      break;
  }

  return (
    <View testID={`memory-settings-page-${page}`}>
      {visibleError ? (
        <Alert variant="error" title="无法更新记忆" description={visibleError} />
      ) : null}
      {content}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  summary: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  path: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing[1],
  },
  summaryInput: {
    minHeight: 360,
  },
}));
