import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import type {
  PaseoMemoryCreateInput,
  PaseoMemoryDetail,
  PaseoMemoryScope,
  PaseoMemorySettings,
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
  const supported = useHostFeature(serverId, "memory");
  const { memory, isLoading, error, updateMemory, clearMemory, isMutating, mutationError } =
    useMemory(serverId, { enabled: supported });
  const [summary, setSummary] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MemoryStatusFilter>("active");
  const [scopeFilter, setScopeFilter] = useState<MemoryScopeFilter>("all");
  useEffect(() => setSummary(memory?.summary ?? ""), [memory?.summary]);

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
          ? { type: "global" }
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
    [updateMemory],
  );
  const deleteDetail = useCallback(
    async (detail: PaseoMemoryDetail) => {
      const confirmed = await confirmDialog({
        title: `Delete ${detail.title}?`,
        message: "This memory and its provenance cannot be recovered.",
        confirmLabel: "Delete",
        destructive: true,
      });
      if (confirmed) await updateMemory({ deleteDetailIds: [detail.id] });
    },
    [updateMemory],
  );
  const clearAll = useCallback(async () => {
    const confirmed = await confirmDialog({
      title: "Clear all Paseo memory?",
      message: "The summary, details, usage records, and revision history will be deleted.",
      confirmLabel: "Clear memory",
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
          title: "Replace all Paseo memory?",
          message: "Current memory will be deleted before the import is applied.",
          confirmLabel: "Replace",
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
      <SettingsSection title="Memory">
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
      <SettingsSection title="Memory">
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
      onSummaryChange={setSummary}
      onSearchChange={setSearch}
      onStatusFilterChange={setStatusFilter}
      onScopeFilterChange={setScopeFilter}
      onSaveSettings={saveSettings}
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
