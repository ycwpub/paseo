import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type {
  PaseoMemoryCreateInput,
  PaseoMemoryDetail,
  PaseoMemoryScope,
  PaseoMemorySettings,
  PaseoMemoryUserOperation,
} from "@getpaseo/protocol/messages";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { useMemory } from "@/hooks/use-memory";
import { useHostFeature } from "@/runtime/host-features";
import { confirmDialog } from "@/utils/confirm-dialog";
import type { MemoryDetailDraft } from "./memory-detail-card";
import type { MemoryStatusFilter } from "./memory-form-options";
import { MemorySectionContent } from "./memory-section-content";
import {
  parseMemoryImportance,
  parseMemoryValidUntil,
  type MemoryScopeFilter,
} from "./memory-view-model";

export function MemorySection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const supported = useHostFeature(serverId, "memory");
  const usersSupported = useHostFeature(serverId, "memoryUsers");
  const syncSupported = useHostFeature(serverId, "memorySync");
  const { memory, isLoading, error, updateMemory, clearMemory, isMutating, mutationError } =
    useMemory(serverId, { enabled: supported });
  const [summary, setSummary] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MemoryStatusFilter>("active");
  const [scopeFilter, setScopeFilter] = useState<MemoryScopeFilter>("all");
  useEffect(() => setSummary(memory?.summary ?? ""), [memory?.activeUserId, memory?.summary]);

  const saveSettings = useCallback(
    async (settings: PaseoMemorySettings) => {
      await updateMemory({ settings });
    },
    [updateMemory],
  );
  const saveSummary = useCallback(async () => {
    await updateMemory({ summary });
  }, [summary, updateMemory]);
  const createDetail = useCallback(
    async (input: PaseoMemoryCreateInput) => {
      await updateMemory({ createDetails: [input] });
    },
    [updateMemory],
  );
  const saveDetail = useCallback(
    async (detail: PaseoMemoryDetail, draft: MemoryDetailDraft) => {
      const scope: PaseoMemoryScope =
        draft.scopeType === "global"
          ? {
              type: "global",
              id: memory?.activeUserId ?? memory?.users?.[0]?.id ?? "default",
            }
          : { type: draft.scopeType, id: draft.scopeId.trim() };
      if (scope.type !== "global" && !scope.id) {
        throw new Error(`${scope.type} scope requires an ID`);
      }
      await updateMemory({
        detailEdits: [
          {
            id: detail.id,
            title: draft.title.trim(),
            category: draft.category,
            content: draft.content.trim(),
            keywords: draft.keywords
              .split(",")
              .map((keyword) => keyword.trim())
              .filter(Boolean),
            scope,
            status: draft.status,
            importance: parseMemoryImportance(draft.importance),
            validUntil: parseMemoryValidUntil(draft.validUntil),
          },
        ],
      });
    },
    [memory?.activeUserId, memory?.users, updateMemory],
  );
  const changeUser = useCallback(
    async (operation: PaseoMemoryUserOperation) => {
      if (operation.type === "delete") {
        const user = memory?.users?.find((candidate) => candidate.id === operation.id);
        const confirmed = await confirmDialog({
          title: t("memoryPolicies.users.deleteTitle", {
            name: user?.name ?? operation.id,
          }),
          message: t("memoryPolicies.users.deleteDescription"),
          confirmLabel: t("memoryPolicies.users.deleteConfirm"),
          destructive: true,
        });
        if (!confirmed) return;
      }
      await updateMemory({ userOperation: operation });
      setSearch("");
      setScopeFilter("all");
    },
    [memory?.users, t, updateMemory],
  );
  const deleteDetail = useCallback(
    async (detail: PaseoMemoryDetail) => {
      const confirmed = await confirmDialog({
        title: `Delete ${detail.title}?`,
        message: "该记忆及其来源信息删除后无法恢复。",
        confirmLabel: "删除",
        destructive: true,
      });
      if (confirmed) await updateMemory({ deleteDetailIds: [detail.id] });
    },
    [updateMemory],
  );
  const clearAll = useCallback(async () => {
    const confirmed = await confirmDialog({
      title: "清空全部 Paseo 记忆？",
      message: "The summary, details, usage records, and revision history will be deleted.",
      confirmLabel: "清空记忆",
      destructive: true,
    });
    if (confirmed) await clearMemory();
  }, [clearMemory]);
  const consolidate = useCallback(async () => {
    await updateMemory({ consolidate: true });
  }, [updateMemory]);
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
      <SettingsSection title="记忆">
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>
              Update the selected Paseo daemon to use long-term memory.
            </Text>
          </View>
        </View>
      </SettingsSection>
    );
  }
  if (isLoading || !memory) {
    return (
      <SettingsSection title="记忆">
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>{error ? error.message : "Loading memory…"}</Text>
          </View>
        </View>
      </SettingsSection>
    );
  }

  const visibleError = mutationError?.message ?? error?.message ?? null;
  return (
    <MemorySectionContent
      serverId={serverId}
      memory={memory}
      summary={summary}
      search={search}
      statusFilter={statusFilter}
      scopeFilter={scopeFilter}
      isMutating={isMutating}
      visibleError={visibleError}
      usersSupported={usersSupported}
      syncSupported={syncSupported}
      onSummaryChange={setSummary}
      onSearchChange={setSearch}
      onStatusFilterChange={setStatusFilter}
      onScopeFilterChange={setScopeFilter}
      onSaveSettings={saveSettings}
      onChangeUser={changeUser}
      onSaveSummary={saveSummary}
      onCreateDetail={createDetail}
      onSaveDetail={saveDetail}
      onDeleteDetail={deleteDetail}
      onClearAll={clearAll}
      onConsolidate={consolidate}
      onImport={importMemory}
    />
  );
}
