import { useMemo } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type {
  PaseoMemoryCreateInput,
  PaseoMemoryDetail,
  PaseoMemorySettings,
  PaseoMemoryState,
  PaseoMemoryUser,
  PaseoMemoryUserOperation,
} from "@getpaseo/protocol/messages";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SettingsTextAreaCard } from "@/components/settings-textarea";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { MemoryContentManagerSection } from "./memory-content-manager-section";
import type { MemoryDetailDraft } from "./memory-detail-draft";
import { MemoryHostSyncCard } from "./memory-host-sync-card";
import type { MemoryStatusFilter } from "./memory-form-options";
import { MemorySettingsCard } from "./memory-settings-card";
import { MemoryScopePoliciesSection } from "./memory-scope-policies-section";
import { MemoryTransferCard } from "./memory-transfer-card";
import { MemoryUserCard } from "./memory-user-card";
import type { MemoryScopeFilter } from "./memory-view-model";

interface MemorySectionContentProps {
  serverId: string;
  memory: PaseoMemoryState;
  summary: string;
  search: string;
  statusFilter: MemoryStatusFilter;
  scopeFilter: MemoryScopeFilter;
  isMutating: boolean;
  visibleError: string | null;
  usersSupported: boolean;
  syncSupported: boolean;
  onSummaryChange: (summary: string) => void;
  onSearchChange: (search: string) => void;
  onStatusFilterChange: (status: MemoryStatusFilter) => void;
  onScopeFilterChange: (scope: MemoryScopeFilter) => void;
  onSaveSettings: (settings: PaseoMemorySettings) => Promise<void>;
  onChangeUser: (operation: PaseoMemoryUserOperation) => Promise<void>;
  onSaveSummary: () => Promise<void>;
  onCreateDetail: (input: PaseoMemoryCreateInput) => Promise<void>;
  onSaveDetail: (detail: PaseoMemoryDetail, draft: MemoryDetailDraft) => Promise<void>;
  onDeleteDetail: (detail: PaseoMemoryDetail) => Promise<void>;
  onClearAll: () => Promise<void>;
  onConsolidate: () => Promise<void>;
  onImport: (json: string, replace: boolean) => Promise<void>;
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
  summary,
  search,
  statusFilter,
  scopeFilter,
  isMutating,
  visibleError,
  usersSupported,
  syncSupported,
  onSummaryChange,
  onSearchChange,
  onStatusFilterChange,
  onScopeFilterChange,
  onSaveSettings,
  onChangeUser,
  onSaveSummary,
  onCreateDetail,
  onSaveDetail,
  onDeleteDetail,
  onClearAll,
  onConsolidate,
  onImport,
}: MemorySectionContentProps) {
  const { t } = useTranslation();
  const summaryTrailing = useMemo(
    () => (
      <Button size="sm" disabled={isMutating} onPress={onSaveSummary}>
        保存
      </Button>
    ),
    [isMutating, onSaveSummary],
  );
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

      <MemoryScopePoliciesSection serverId={serverId} memory={memory} />

      <MemoryContentManagerSection
        serverId={serverId}
        memory={memory}
        search={search}
        statusFilter={statusFilter}
        scopeFilter={scopeFilter}
        isMutating={isMutating}
        onSearchChange={onSearchChange}
        onStatusFilterChange={onStatusFilterChange}
        onScopeFilterChange={onScopeFilterChange}
        onCreateDetail={onCreateDetail}
        onSaveDetail={onSaveDetail}
        onDeleteDetail={onDeleteDetail}
      />

      {syncSupported ? (
        <SettingsSection title={t("memoryPolicies.sync.sectionTitle")}>
          <MemoryHostSyncCard serverId={serverId} disabled={isMutating} />
        </SettingsSection>
      ) : null}

      <SettingsSection title="总记忆文件" trailing={summaryTrailing}>
        <Text selectable style={settingsStyles.rowHint}>
          {memory.summaryPath}
        </Text>
        <SettingsTextAreaCard
          accessibilityLabel="Paseo 记忆总览"
          value={summary}
          onChangeText={onSummaryChange}
          style={styles.summaryInput}
        />
      </SettingsSection>

      <SettingsSection title="导入与导出">
        <MemoryTransferCard
          exportJson={memory.exportJson ?? ""}
          disabled={isMutating}
          onImport={onImport}
        />
      </SettingsSection>
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
  summaryInput: {
    minHeight: 220,
  },
}));
