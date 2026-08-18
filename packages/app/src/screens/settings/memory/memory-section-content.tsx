import { useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  PaseoMemoryCreateInput,
  PaseoMemoryDetail,
  PaseoMemorySettings,
  PaseoMemoryState,
} from "@getpaseo/protocol/messages";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";
import { SettingsTextAreaCard } from "@/components/settings-textarea";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { MemoryCreateCard } from "./memory-create-card";
import { MemoryDetailCard, type MemoryDetailDraft } from "./memory-detail-card";
import {
  MEMORY_SCOPE_OPTIONS,
  MEMORY_STATUS_OPTIONS,
  type MemoryStatusFilter,
} from "./memory-form-options";
import { MemorySettingsCard } from "./memory-settings-card";
import { MemoryScopePoliciesSection } from "./memory-scope-policies-section";
import { MemoryTransferCard } from "./memory-transfer-card";
import { filterMemoryDetails, type MemoryScopeFilter } from "./memory-view-model";

const SCOPE_FILTER_OPTIONS = [
  { id: "all", value: "all" as const, label: "All scopes" },
  ...MEMORY_SCOPE_OPTIONS,
];

interface MemorySectionContentProps {
  serverId: string;
  memory: PaseoMemoryState;
  summary: string;
  search: string;
  statusFilter: MemoryStatusFilter;
  scopeFilter: MemoryScopeFilter;
  isMutating: boolean;
  visibleError: string | null;
  onSummaryChange: (summary: string) => void;
  onSearchChange: (search: string) => void;
  onStatusFilterChange: (status: MemoryStatusFilter) => void;
  onScopeFilterChange: (scope: MemoryScopeFilter) => void;
  onSaveSettings: (settings: PaseoMemorySettings) => Promise<void>;
  onSaveSummary: () => Promise<void>;
  onCreateDetail: (input: PaseoMemoryCreateInput) => Promise<void>;
  onSaveDetail: (detail: PaseoMemoryDetail, draft: MemoryDetailDraft) => Promise<void>;
  onDeleteDetail: (detail: PaseoMemoryDetail) => Promise<void>;
  onClearAll: () => Promise<void>;
  onConsolidate: () => Promise<void>;
  onImport: (json: string, replace: boolean) => Promise<void>;
}

function extractionStatus(memory: PaseoMemoryState): string {
  const pendingLabel = memory.stats.pendingExtractions === 1 ? "extraction" : "extractions";
  const parts = [`${memory.stats.pendingExtractions} pending ${pendingLabel}`];
  if (memory.stats.lastExtractedAt) {
    parts.push(`last learned ${new Date(memory.stats.lastExtractedAt).toLocaleString()}`);
  }
  if (memory.stats.lastConsolidatedAt) {
    parts.push(`last consolidated ${new Date(memory.stats.lastConsolidatedAt).toLocaleString()}`);
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
  onSummaryChange,
  onSearchChange,
  onStatusFilterChange,
  onScopeFilterChange,
  onSaveSettings,
  onSaveSummary,
  onCreateDetail,
  onSaveDetail,
  onDeleteDetail,
  onClearAll,
  onConsolidate,
  onImport,
}: MemorySectionContentProps) {
  const visibleDetails = useMemo(
    () =>
      filterMemoryDetails({
        details: memory.details,
        search,
        status: statusFilter,
        scope: scopeFilter,
      }),
    [memory.details, scopeFilter, search, statusFilter],
  );
  const statusDisplay = useMemo(
    () => ({
      label:
        MEMORY_STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label ??
        statusFilter,
    }),
    [statusFilter],
  );
  const scopeDisplay = useMemo(
    () => ({
      label:
        SCOPE_FILTER_OPTIONS.find((option) => option.value === scopeFilter)?.label ?? scopeFilter,
    }),
    [scopeFilter],
  );
  const summaryTrailing = useMemo(
    () => (
      <Button size="sm" disabled={isMutating} onPress={onSaveSummary}>
        Save
      </Button>
    ),
    [isMutating, onSaveSummary],
  );
  const detailTrailing = useMemo(
    () => <MemoryCreateCard disabled={isMutating} onCreate={onCreateDetail} />,
    [isMutating, onCreateDetail],
  );
  const emptyText =
    memory.details.length === 0
      ? "No durable memory has been learned yet."
      : "No memory matches these filters.";

  return (
    <View>
      <SettingsSection title="Long-term memory">
        <MemorySettingsCard
          settings={memory.settings}
          disabled={isMutating}
          onChange={onSaveSettings}
        />
        {visibleError ? (
          <Alert title="Unable to update memory" description={visibleError} variant="error" />
        ) : null}
        <View style={styles.stats}>
          <Text style={settingsStyles.rowHint}>
            {memory.stats.activeCount ?? memory.stats.detailCount} active ·{" "}
            {memory.stats.supersededCount ?? 0} superseded · {memory.stats.expiredCount ?? 0}{" "}
            expired · {memory.stats.disputedCount ?? 0} disputed
          </Text>
          <Text style={settingsStyles.rowHint}>{extractionStatus(memory)}</Text>
        </View>
        <View style={styles.actions}>
          <Button size="sm" variant="outline" disabled={isMutating} onPress={onConsolidate}>
            Consolidate now
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isMutating || memory.details.length === 0}
            onPress={onClearAll}
          >
            Clear all
          </Button>
        </View>
      </SettingsSection>

      <MemoryScopePoliciesSection serverId={serverId} memory={memory} />

      <SettingsSection title="Summary file" trailing={summaryTrailing}>
        <Text selectable style={settingsStyles.rowHint}>
          {memory.summaryPath}
        </Text>
        <SettingsTextAreaCard
          accessibilityLabel="Paseo memory summary"
          value={summary}
          onChangeText={onSummaryChange}
          style={styles.summaryInput}
        />
      </SettingsSection>

      <SettingsSection title="Detail memories" trailing={detailTrailing}>
        <View style={settingsStyles.card}>
          <View style={styles.filters}>
            <View style={styles.search}>
              <Field label="Search">
                <FormTextInput
                  value={search}
                  onChangeText={onSearchChange}
                  placeholder="Title, content, keyword, or scope"
                />
              </Field>
            </View>
            <View style={styles.filter}>
              <SelectField
                label="State"
                value={statusFilter}
                selectedDisplay={statusDisplay}
                options={MEMORY_STATUS_OPTIONS}
                onChange={onStatusFilterChange}
                placeholder="All states"
                emptyText="No states"
              />
            </View>
            <View style={styles.filter}>
              <SelectField
                label="Scope"
                value={scopeFilter}
                selectedDisplay={scopeDisplay}
                options={SCOPE_FILTER_OPTIONS}
                onChange={onScopeFilterChange}
                placeholder="All scopes"
                emptyText="No scopes"
              />
            </View>
          </View>
        </View>
        {visibleDetails.length === 0 ? (
          <View style={settingsStyles.card}>
            <View style={settingsStyles.row}>
              <Text style={settingsStyles.rowHint}>{emptyText}</Text>
            </View>
          </View>
        ) : (
          visibleDetails.map((detail) => (
            <MemoryDetailCard
              key={detail.id}
              detail={detail}
              disabled={isMutating}
              onSave={onSaveDetail}
              onDelete={onDeleteDetail}
            />
          ))
        )}
      </SettingsSection>

      <SettingsSection title="Import and export">
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
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  search: {
    flex: 2,
    minWidth: 240,
  },
  filter: {
    flex: 1,
    minWidth: 160,
  },
}));
